import type { MediaRefusal } from '@vignettes/core/media'
import type { DeckContext } from '../messages.ts'
import type { ExitCode } from '../output.ts'
import type { DeckOutcome, FailedAnswer, PlannedAction, PushAction, PushProblemCode, RemoteCase, RemoteDraft } from '../push-plan.ts'
import type { DeckAnswer, RemoteCall } from '../remote.ts'
import type { CommandRun } from '../usage.ts'
import type { CheckedProblem } from './check.ts'
import { basename } from 'node:path'
import { splitFrontmatter } from '@vignettes/core/deck'
import { textDigest } from '@vignettes/core/digest'
import { MEDIA_REFUSALS } from '@vignettes/core/media'
import manifest from '../../package.json' with { type: 'json' }
import { CREATE_DECK, CURRENT_TOKEN, DECK_DRAFT, PROJECTS, PUBLISH_DECK, SAVE_DRAFT, UPLOAD_MEDIA } from '../api.ts'
import { registerKnownComponents } from '../components.ts'
import { deckFolder, writeReplacedCopy } from '../files.ts'
import { readLocalDeck } from '../local-deck.ts'
import { bodyTooLargeMessage, CliError, passwordMessage, pushActionMessage, pushProblemMessage } from '../messages.ts'
import { asCliError, EXIT_CODES, exitCodeOf } from '../output.ts'
import { ACTION_EXIT_CODES, classifyRemote, deckOutcome, digestOutcome, outcomeExit, planDeck, plannedWrites, planWarnings, requestBudget, TOKEN_REQUEST_LIMIT } from '../push-plan.ts'
import { callDeckRoute, callInstance, UPLOAD_TIMEOUT_MS } from '../remote.ts'
import { checkSlugs } from '../slugs.ts'
import { resolveTarget } from '../target.ts'
import { checked, problemLine } from './check.ts'

/** A problem of a result of `push`: one of the deck, or one the instance or the options give. */
type PushProblem = CheckedProblem | { severity: 'error' | 'warning', code: PushProblemCode | 'deck-body-too-large', message: string }

/** A deck in the `--json` document of `push`. */
export interface PushResult {
  file: string
  slug: string
  action: PushAction
  /** The address of the deck in the editor of the studio. */
  url: string
  message: string
  problems: PushProblem[]
  warnings: { code: PushProblemCode, message: string }[]
  /** With `--dry-run`: the writes the command would send, in their order. */
  writes?: string[]
  /** The local images the command sent, or with `--dry-run` would send, with the name the instance gives them. */
  files?: { path: string, name: string }[]
  /** The copy of the draft that `--force` replaced. */
  replaced?: string
  /** The error that stopped the deck or the command. */
  error?: { code: string, message: string }
}

interface Deck {
  file: string
  slug: string
  folder: string | undefined
  local: Awaited<ReturnType<typeof readLocalDeck>>
}

/** A folder of `GET /api/projects`, with the grant of the account on it. */
interface Folder {
  slug: string
  myGrant?: string
}

/** A result, the exit code it gives the command, and whether it stops the command. */
interface Pushed {
  result: PushResult
  exit: ExitCode
  stops: boolean
}

function projectOf(raw: string) {
  const { project } = splitFrontmatter(raw).data
  return typeof project === 'string' && project ? project : undefined
}

/** The slug of each file: its name without `.md`, or `--slug` for a single file. */
function deckSlugs(files: string[], option: string | undefined): string[] {
  if (option !== undefined && files.length > 1)
    throw new CliError('slug-with-files')
  const slugs = files.map(file => option ?? basename(file).replace(/\.md$/, ''))
  checkSlugs(slugs, files)
  return slugs
}

/** The folder of a deck to create: `--folder`, else the project key of the file; both, and different, stop the command. */
function folderOf(file: string, raw: string, option: string | undefined): string | undefined {
  const project = projectOf(raw)
  if (option && project && option !== project)
    throw new CliError('folder-differs', file, option, project)
  return option || project
}

/** The `data.reason` of a refused upload, when it is one of `MEDIA_REFUSALS`. */
function mediaRefusal(failure: FailedAnswer): MediaRefusal | undefined {
  const reason = failure.kind === 'status' && typeof failure.data === 'object' && failure.data !== null ? (failure.data as { reason?: unknown }).reason : undefined
  return MEDIA_REFUSALS.find(refusal => refusal === reason)
}

const writeText = ({ method, path }: { method: string, path: string }) => `${method} ${path}`

function report(results: PushResult[], dryRun: boolean): string {
  return results.flatMap(result => [
    `${result.file}  ${result.action}  ${result.message}`,
    ...result.problems.filter(problem => problem.severity !== 'info').map(problem => 'line' in problem
      ? `  ${problemLine(result.file, problem)}`
      : `  ${problem.severity}  ${problem.code}  ${problem.message}`),
    ...(result.files ?? []).map(({ path, name }) => `  ${dryRun ? 'Would send' : 'Sent'} ${path} as /media/${name}.`),
    ...result.warnings.map(warning => `  warning  ${warning.code}  ${warning.message}`),
    ...(result.error ? [`  ${result.error.message}`] : []),
    ...(result.replaced ? [`  The replaced draft is kept in ${result.replaced}.`] : []),
    ...(result.writes ? result.writes.map(write => `  ${write}`) : []),
  ]).join('\n')
}

/**
 * Pushes each deck file to the instance and publishes it, one deck after the
 * other: it checks every file first and sends nothing when one has an error.
 * A refusal of a deck lets the next decks go; a refusal of the token or a
 * failure of the instance stops the command, and the next decks are skipped.
 */
export const push: CommandRun = async ({ operands, options, environment, output, keyring, fetch }) => {
  registerKnownComponents()
  const dryRun = Boolean(options['dry-run'])
  const force = Boolean(options.force)
  const folderOption = options.folder as string | undefined
  const slugs = deckSlugs(operands, options.slug as string | undefined)
  const decks: Deck[] = []
  for (const [index, file] of operands.entries()) {
    const local = await readLocalDeck(file)
    decks.push({ file, slug: slugs[index]!, folder: folderOf(file, local.raw, folderOption), local })
  }

  const failed = decks.filter(deck => deck.local.problems.some(problem => problem.severity === 'error'))
  if (failed.length) {
    const results = decks.map(deck => ({
      file: deck.file,
      slug: deck.slug,
      action: failed.includes(deck) ? 'refused' as const : 'skipped' as const,
      url: '',
      message: '',
      problems: deck.local.problems.map(checked),
      warnings: [],
    }))
    for (const result of results)
      result.message = pushActionMessage(result.action, { slug: result.slug, url: '', origin: '', cli: manifest.version })
    output.print(report(results, dryRun))
    return output.finish(results, EXIT_CODES.deckError)
  }
  const budget = requestBudget(decks.map(deck => deck.local.images.length))
  if (budget > TOKEN_REQUEST_LIMIT)
    throw new CliError('too-many-requests-planned', String(budget), String(TOKEN_REQUEST_LIMIT))

  const { origin, token } = await resolveTarget({ instance: options.instance as string | undefined, environment, keyring })
  output.setInstance(origin)
  if (!token)
    throw new CliError('not-signed-in', origin)
  const call: RemoteCall = { origin, token, fetch }
  const current = await callInstance(CURRENT_TOKEN, call)
  if (current.scope === 'read' && !dryRun)
    throw new CliError('read-scope', origin)
  const privileged = current.role === 'editor'
  let projects: Promise<DeckAnswer<Folder[]>> | undefined

  const results: PushResult[] = []
  let exit: ExitCode = EXIT_CODES.success
  let stopped = false
  for (const deck of decks) {
    const context: DeckContext = { slug: deck.slug, url: `${origin}/edit/${deck.slug}`, origin, cli: manifest.version }
    if (stopped) {
      results.push({ file: deck.file, slug: deck.slug, action: 'skipped', url: context.url, message: pushActionMessage('skipped', context), problems: [], warnings: [] })
      continue
    }
    const pushed = await pushDeck(deck, {
      call,
      context,
      dryRun,
      force,
      privileged,
      folderOption: Boolean(folderOption),
      projects: () => projects ??= callDeckRoute(PROJECTS, call, {}),
    })
    results.push(pushed.result)
    if (exit === EXIT_CODES.success)
      exit = pushed.exit
    stopped = pushed.stops
  }
  output.print(report(results, dryRun))
  output.finish(results, exit)
}

interface DeckRun {
  call: RemoteCall
  context: DeckContext
  dryRun: boolean
  force: boolean
  privileged: boolean
  folderOption: boolean
  /** The answer of `GET /api/projects`, read once for the first deck to create. */
  projects: () => Promise<DeckAnswer<Folder[]>>
}

/** The steps of one deck: read, plan, then create, upload, save and publish. */
async function pushDeck(deck: Deck, run: DeckRun): Promise<Pushed> {
  const { call, context } = run
  const { local, slug } = deck
  const result: PushResult = { file: deck.file, slug, action: 'skipped', url: context.url, message: '', problems: local.problems.map(checked), warnings: [] }

  const done = (action: PushAction, over: Partial<PushResult> = {}, exit: ExitCode = ACTION_EXIT_CODES[action], stops = false): Pushed => {
    Object.assign(result, { action, message: pushActionMessage(action, context) }, over)
    return { result, exit, stops }
  }
  /** A refusal of the command line for this deck, such as a copy it cannot write: code 2, and the next decks go. */
  const refusedHere = (error: unknown): Pushed => {
    const { code, message } = asCliError(error)
    return done('refused', { error: { code, message } }, exitCodeOf(error))
  }
  // A 404 is an absent deck on the first read alone: elsewhere it is a refusal.
  const failure = (answered: DeckOutcome, detail: string, path?: string, reason?: MediaRefusal): Pushed => {
    const outcome = answered.action === 'absent' ? { action: 'forbidden', reason: 'refused' } as const : answered
    const { exit, stops } = outcomeExit(outcome)
    if (outcome.action === 'stopped') {
      const error = outcome.code === 'digest-unchecked'
        ? new CliError('digest-unchecked', context.origin, slug)
        : outcome.code === 'too-many-token-requests' || outcome.code === 'too-many-invalid-tokens'
          ? new CliError(outcome.code)
          : new CliError(outcome.code, context.origin, detail)
      return done(outcome.code === 'digest-unchecked' ? 'digest-unchecked' : 'stopped', { error: { code: error.code, message: error.message } }, exit, stops)
    }
    if (outcome.action === 'refused') {
      const message = outcome.problem === 'image-refused'
        ? pushProblemMessage('image-refused', `${path}: ${detail}${reason ? ` (reason ${reason})` : ''}`, context)
        : outcome.problem === 'instance-refused' ? pushProblemMessage('instance-refused', detail, context) : bodyTooLargeMessage(context, detail)
      result.problems.push({ severity: 'error', code: outcome.problem, message })
      return done('refused', {}, exit)
    }
    return done(outcome.action, outcome.action === 'forbidden' && outcome.reason === 'password' ? { message: passwordMessage(context) } : {}, exit)
  }

  const read = await callDeckRoute(DECK_DRAFT, call, { slug, query: 'draft' })
  let state: RemoteDraft | null = null
  if (read.ok) {
    state = read.answer
  }
  else {
    const outcome = deckOutcome('read', read.failure)
    if (outcome.action !== 'absent')
      return failure(outcome, read.detail)
  }

  const sent = local.sent
  const remote: RemoteCase = classifyRemote(sent, state)
  const action: PlannedAction = planDeck(remote, { force: run.force, privileged: run.privileged, sent })
  result.warnings = planWarnings({ raw: local.raw, sent, state, remote, action, folder: run.folderOption })
    .map(({ code, value }) => ({ code, message: pushProblemMessage(code, value ?? '', context) }))

  if (action === 'create') {
    if (!run.privileged && !deck.folder)
      return refusedHere(new CliError('folder-required', slug))
    if (deck.folder) {
      // A failure of the list stops this deck as a failure of its own route, and keeps the results of the decks before it.
      const listed = await run.projects()
      if (!listed.ok)
        return failure(deckOutcome('projects', listed.failure), listed.detail)
      const folder = listed.answer.find(project => project.slug === deck.folder)
      if (!folder || (!run.privileged && folder.myGrant !== 'editor'))
        return done('forbidden', { error: { code: 'folder-refused', message: new CliError('folder-refused', context.origin, deck.folder).message } })
    }
  }

  if (run.dryRun) {
    const writes = plannedWrites(slug, remote, action, local.images.map(image => image.name)).map(writeText)
    return done(action, { writes, files: local.images.map(({ path, name }) => ({ path, name })) })
  }
  if (action === 'unpublished-draft' || action === 'creation-unfinished')
    return done(action)

  if (action === 'create') {
    const created = await callDeckRoute(CREATE_DECK, call, { json: { slug, raw: sent, ...(deck.folder && { project: deck.folder }) } })
    if (!created.ok)
      return failure(deckOutcome('create', created.failure), created.detail)
  }

  if (local.images.length)
    result.files = []
  for (const image of local.images) {
    // A file leaves the machine with its request, whatever the answer.
    result.files!.push({ path: image.path, name: image.name })
    const form = new FormData()
    form.append('file', new Blob([image.data as Uint8Array<ArrayBuffer>], { type: image.type }), image.name)
    const uploaded = await callDeckRoute(UPLOAD_MEDIA, call, { query: `deck=${encodeURIComponent(slug)}`, form, timeout: UPLOAD_TIMEOUT_MS })
    if (!uploaded.ok)
      return failure(deckOutcome('image', uploaded.failure), uploaded.detail, image.path, mediaRefusal(uploaded.failure))
    if (uploaded.answer.src !== `/media/${image.name}`) {
      const error = new CliError('media-name-differs')
      return done('stopped', { error: { code: error.code, message: error.message } }, EXIT_CODES.instance, true)
    }
  }
  if (action === 'identical')
    return done('identical')

  if (action === 'create') {
    const reread = await callDeckRoute(DECK_DRAFT, call, { slug, query: 'draft' })
    if (!reread.ok)
      return failure(deckOutcome('reread', reread.failure), reread.detail)
    // Someone may write in the deck while its images go: the draft read again must be the text sent or its creation draft.
    const created = classifyRemote(sent, reread.answer)
    if (created !== 'draft-is-creation' && created !== 'draft-is-sent')
      return done('conflict')
    state = reread.answer
  }

  if (remote !== 'draft-is-sent') {
    const draftDigest = state?.from === 'draft' ? await textDigest(state.content) : null
    if (remote === 'foreign-draft' && run.force && state) {
      try {
        result.replaced = await writeReplacedCopy(await deckFolder(deck.file), slug, state.stamp, state.content)
      }
      catch (error) {
        return refusedHere(error)
      }
    }
    const saved = await callDeckRoute(SAVE_DRAFT, call, { slug, json: { raw: sent, stamp: state?.stamp ?? null, publishedVersion: state?.publishedVersion ?? null, draftDigest } })
    if (!saved.ok)
      return failure(deckOutcome('save', saved.failure), saved.detail)
    const unchecked = digestOutcome(draftDigest, saved.answer.draftDigest)
    if (unchecked)
      return failure(unchecked, '')
  }

  const digest = await textDigest(sent)
  const published = await callDeckRoute(PUBLISH_DECK, call, { slug, json: { digest } })
  if (!published.ok)
    return failure(deckOutcome('publish', published.failure), published.detail)
  const unchecked = digestOutcome(digest, published.answer.digest)
  if (unchecked)
    return failure(unchecked, '')
  return done(action === 'create' ? 'created' : 'published')
}

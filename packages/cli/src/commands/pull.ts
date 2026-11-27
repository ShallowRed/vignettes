import type { DeckContext, PullAction } from '../messages.ts'
import type { ExitCode } from '../output.ts'
import type { CommandRun } from '../usage.ts'
import { resolve } from 'node:path'
import manifest from '../../package.json' with { type: 'json' }
import { CURRENT_TOKEN, DECK_MARKDOWN } from '../api.ts'
import { writePulled } from '../files.ts'
import { CliError, passwordMessage, pullActionMessage, readOnlyDraftMessage } from '../messages.ts'
import { asCliError, EXIT_CODES, exitCodeOf } from '../output.ts'
import { deckOutcome, outcomeExit } from '../push-plan.ts'
import { callInstance, callMarkdown } from '../remote.ts'
import { checkSlugs } from '../slugs.ts'
import { resolveTarget } from '../target.ts'

/** A deck in the `--json` document of `pull`. */
export interface PullResult {
  slug: string
  /** The file the command writes. */
  file: string
  action: PullAction
  url: string
  message: string
  /** The copy of the local file that `--force` replaced. */
  replaced?: string
  error?: { code: string, message: string }
}

const ACTION_EXIT: Record<PullAction, ExitCode> = {
  'written': EXIT_CODES.success,
  'identical': EXIT_CODES.success,
  'local-differs': EXIT_CODES.conflict,
  'forbidden': EXIT_CODES.permission,
  'refused': EXIT_CODES.usage,
  'stopped': EXIT_CODES.instance,
  'skipped': EXIT_CODES.success,
}

/**
 * Writes the published version of each deck, or with `--draft` its draft, to
 * `<slug>.md` in the folder `--out` names or the current one, with the bytes
 * the instance sends. A local file with another text stays, unless `--force`,
 * which copies it first. The images stay on the instance: the file cites them
 * by `/media/<name>`.
 */
export const pull: CommandRun = async ({ operands, options, environment, output, keyring, fetch }) => {
  checkSlugs(operands)
  const draft = Boolean(options.draft)
  const force = Boolean(options.force)
  const folder = resolve((options.out as string | undefined) ?? '.')
  const { origin, token } = await resolveTarget({ instance: options.instance as string | undefined, environment, keyring })
  output.setInstance(origin)
  if (!token)
    throw new CliError('not-signed-in', origin)
  const call = { origin, token, fetch }
  await callInstance(CURRENT_TOKEN, call)

  const results: PullResult[] = []
  let exit: ExitCode = EXIT_CODES.success
  let stopped = false
  for (const slug of operands) {
    const deck: DeckContext & { file: string, draft: boolean } = { slug, url: `${origin}/edit/${slug}`, origin, cli: manifest.version, file: resolve(folder, `${slug}.md`), draft }
    const result: PullResult = { slug, file: deck.file, action: 'skipped', url: deck.url, message: '' }
    const end = (action: PullAction, over: Partial<PullResult> = {}, code: ExitCode = ACTION_EXIT[action]) => {
      Object.assign(result, { action, message: pullActionMessage(action, deck) }, over)
      if (exit === EXIT_CODES.success)
        exit = code
    }
    results.push(result)
    if (stopped) {
      end('skipped')
      continue
    }
    const read = await callMarkdown(DECK_MARKDOWN, call, { slug, ...(draft && { query: 'draft' }) })
    if (!read.ok) {
      const outcome = deckOutcome('markdown', read.failure)
      if (outcome.action === 'forbidden') {
        const status = read.failure.kind === 'status' ? read.failure.status : 0
        const message = outcome.reason === 'password' ? passwordMessage(deck) : draft && status === 403 ? readOnlyDraftMessage(deck) : undefined
        end('forbidden', message ? { message } : {})
        continue
      }
      // A read of a deck neither conflicts nor refuses a body: any other answer is a failure of the instance.
      const code = outcome.action === 'stopped' ? outcome.code : 'instance-error'
      const error = code === 'too-many-token-requests' || code === 'too-many-invalid-tokens' ? new CliError(code) : new CliError(code, origin, read.detail)
      const { exit: failed } = outcome.action === 'stopped' ? outcomeExit(outcome) : { exit: EXIT_CODES.instance }
      end('stopped', { error: { code: error.code, message: error.message } }, failed)
      stopped = true
      continue
    }
    try {
      const pulled = await writePulled(folder, slug, read.answer, force)
      end(pulled.state, pulled.replaced ? { replaced: pulled.replaced } : {})
    }
    catch (error) {
      const { code, message } = asCliError(error)
      end('refused', { error: { code, message } }, exitCodeOf(error))
    }
  }
  output.print(results.flatMap(result => [
    `${result.slug}  ${result.action}  ${result.message}`,
    ...(result.error ? [`  ${result.error.message}`] : []),
    ...(result.replaced ? [`  The replaced file is kept in ${result.replaced}.`] : []),
  ]).join('\n'))
  output.finish(results, exit)
}

import type { ExitCode } from './output.ts'
import { ACCESS_KEYS, creationDraft, deckImageSources, splitFrontmatter } from '@vignettes/core/deck'
import { EXIT_CODES } from './output.ts'

// The plan of `push` for a deck: the class of the remote state, the action it
// leads to, the writes it sends, and the outcome of each answer of a route of
// the deck. Pure: packages/cli/src/commands/push.ts sends the requests.

/** What `GET /api/presentations/:slug?draft` answers that `push` reads. */
export interface RemoteDraft {
  /** The stored draft, else the published text. */
  content: string
  from: 'draft' | 'published'
  stamp: number | null
  publishedRaw: string | null
  publishedVersion: number | null
}

/** The class of the remote state of a deck, against the text `push` sends. */
export type RemoteCase
  = | 'absent'
    | 'published-equal'
    | 'draft-is-sent'
    | 'draft-is-creation'
    | 'published-only'
    | 'draft-is-published'
    | 'foreign-draft'

/** What the reads decide for a deck. */
export type PlannedAction = 'create' | 'publish' | 'identical' | 'unpublished-draft' | 'creation-unfinished'

/** The action of each remote case, before `--force` and the access keys of a token of a global role. */
export const ACTIONS: Record<RemoteCase, PlannedAction> = {
  'absent': 'create',
  'published-equal': 'identical',
  'draft-is-sent': 'publish',
  'draft-is-creation': 'publish',
  'published-only': 'publish',
  'draft-is-published': 'publish',
  'foreign-draft': 'unpublished-draft',
}

/**
 * The remote case of a deck, trying the cases in this order and keeping the
 * first that holds; `state` is null when `GET …?draft` answered 404.
 */
export function classifyRemote(sent: string, state: RemoteDraft | null): RemoteCase {
  if (!state)
    return 'absent'
  if (state.publishedRaw === sent)
    return 'published-equal'
  if (state.from === 'published')
    return 'published-only'
  if (state.content === sent)
    return 'draft-is-sent'
  if (state.publishedRaw === null) {
    const { project } = splitFrontmatter(state.content).data
    if (state.content === creationDraft(sent, typeof project === 'string' ? { project } : {}))
      return 'draft-is-creation'
  }
  if (state.content === state.publishedRaw)
    return 'draft-is-published'
  return 'foreign-draft'
}

export function hasAccessKeys(sent: string): boolean {
  const { data } = splitFrontmatter(sent)
  return Object.values(ACCESS_KEYS).some(key => Object.hasOwn(data, key))
}

export interface PlanOptions {
  force: boolean
  /** The token has a global role (`editor` in the answer of `GET /api/tokens/current`). */
  privileged: boolean
  sent: string
}

/**
 * The action of a remote case: `--force` publishes over a draft `push` did not
 * send, and a token of a global role stops on the draft of a creation that
 * stopped before its access was set, when the text holds an access key.
 */
export function planDeck(remote: RemoteCase, options: PlanOptions): PlannedAction {
  if (remote === 'foreign-draft' && options.force)
    return 'publish'
  if (remote === 'draft-is-creation' && options.privileged && hasAccessKeys(options.sent))
    return 'creation-unfinished'
  return ACTIONS[remote]
}

/** A request that writes, in the order `push` sends them. */
export interface PlannedWrite {
  method: 'POST' | 'PUT'
  path: string
}

/**
 * The writes of a deck: the creation, then an upload per local image, then the
 * save of the text, but for a draft that holds it already, then the
 * publication; an identical deck uploads its images alone.
 */
export function plannedWrites(slug: string, remote: RemoteCase, action: PlannedAction, images: readonly string[]): PlannedWrite[] {
  const deck = `/api/presentations/${slug}`
  const uploads: PlannedWrite[] = images.map(() => ({ method: 'POST', path: `/api/media?deck=${slug}` }))
  if (action === 'identical')
    return uploads
  if (action !== 'create' && action !== 'publish')
    return []
  return [
    ...(action === 'create' ? [{ method: 'POST', path: '/api/presentations' } as const] : []),
    ...uploads,
    ...(remote === 'draft-is-sent' ? [] : [{ method: 'PUT', path: deck } as const]),
    { method: 'POST', path: `${deck}/publish` },
  ]
}

/** The requests per token in 5 minutes that an instance accepts (`personal-token.ts`). */
export const TOKEN_REQUEST_LIMIT = 300

/**
 * The most requests a command sends: `GET /api/tokens/current` and
 * `GET /api/projects`, then per deck its read, its creation, its second read,
 * its save, its publication and its uploads.
 */
export function requestBudget(images: readonly number[]): number {
  return 2 + images.reduce((sum, count) => sum + 5 + count, 0)
}

/** The problems `push` finds on the instance or in its options, with their severity. */
export const PUSH_PROBLEM_CODES = {
  'image-refused': 'error',
  'instance-refused': 'error',
  'uploaded-image-unknown': 'warning',
  'folder-ignored': 'warning',
  'draft-online': 'warning',
  'published-replaced': 'warning',
} as const

export type PushProblemCode = keyof typeof PUSH_PROBLEM_CODES

/** The uploaded images the local file cites that no remote text of the deck cites. */
export function unknownUploads(raw: string, state: RemoteDraft | null): string[] {
  const remote = [state?.content ?? '', state?.publishedRaw ?? '']
  const paths = deckImageSources(raw)
    .filter(({ source }) => source.kind === 'uploaded')
    .map(({ value }) => value.trim().split(/[?#]/)[0]!)
  return [...new Set(paths)].filter(path => !remote.some(text => text.includes(path)))
}

/**
 * The warnings the reads give a deck, before any write: a publication over a
 * published version that differs from the text sent names the version it
 * replaces, whatever the remote case.
 */
export function planWarnings(input: { raw: string, sent: string, state: RemoteDraft | null, remote: RemoteCase, action: PlannedAction, folder: boolean }): { code: PushProblemCode, value?: string }[] {
  const { state, remote, action } = input
  return [
    ...(input.folder && remote !== 'absent' ? [{ code: 'folder-ignored' as const }] : []),
    ...(action === 'identical' && state?.from === 'draft' && state.content !== input.sent ? [{ code: 'draft-online' as const }] : []),
    ...(action === 'publish' && state && state.publishedRaw !== null && state.publishedRaw !== input.sent && state.publishedVersion !== null
      ? [{ code: 'published-replaced' as const, value: String(state.publishedVersion) }]
      : []),
    ...unknownUploads(input.raw, state).map(value => ({ code: 'uploaded-image-unknown' as const, value })),
  ]
}

/** The actions of the results of `push`: the planned ones under `--dry-run`, and the outcomes. */
export type PushAction
  = | 'create'
    | 'publish'
    | 'created'
    | 'published'
    | 'identical'
    | 'unpublished-draft'
    | 'creation-unfinished'
    | 'live-session'
    | 'conflict'
    | 'exists'
    | 'digest-unchecked'
    | 'forbidden'
    | 'refused'
    | 'stopped'
    | 'skipped'

/** The exit code of each action, 0 for a success. */
export const ACTION_EXIT_CODES: Record<PushAction, ExitCode> = {
  'create': EXIT_CODES.success,
  'publish': EXIT_CODES.success,
  'created': EXIT_CODES.success,
  'published': EXIT_CODES.success,
  'identical': EXIT_CODES.success,
  'unpublished-draft': EXIT_CODES.conflict,
  'creation-unfinished': EXIT_CODES.conflict,
  'live-session': EXIT_CODES.conflict,
  'conflict': EXIT_CODES.conflict,
  'exists': EXIT_CODES.conflict,
  'digest-unchecked': EXIT_CODES.instance,
  'forbidden': EXIT_CODES.permission,
  'refused': EXIT_CODES.deckError,
  'stopped': EXIT_CODES.instance,
  'skipped': EXIT_CODES.success,
}

/**
 * The routes of a deck, by their step: the read, the list of the folders for a
 * deck to create, the creation, the second read after it, an upload, the save
 * and the publication.
 */
export type DeckRoute = 'read' | 'projects' | 'create' | 'reread' | 'image' | 'save' | 'publish'

/** An answer of a route of a deck that is not a success. */
export type FailedAnswer
  = | { kind: 'status', status: number, statusMessage?: string, data?: unknown }
  /** No answer: the network failed or the connection closed. */
    | { kind: 'unreachable' }
  /** A success whose body has a form the command line does not read, or repeats the token. */
    | { kind: 'unreadable' }

/** The errors of the command line that stop the command at a deck. */
export type StopCode
  = | 'token-refused'
    | 'too-many-token-requests'
    | 'too-many-invalid-tokens'
    | 'instance-redirect'
    | 'instance-unreachable'
    | 'instance-error'
    | 'instance-answer'
    | 'digest-unchecked'

/** What an answer does to its deck and to the command. */
export type DeckOutcome
  = | { action: 'absent' }
    | { action: 'forbidden', reason: 'refused' | 'password' }
    | { action: 'exists' | 'conflict' | 'live-session' }
    | { action: 'refused', problem: 'instance-refused' | 'image-refused' | 'deck-body-too-large' }
    | { action: 'stopped', code: StopCode }

// The messages of the two refusals 429 of layers/studio/server/utils/personal-token.ts;
// test/unit/cli-routes.test.ts compares them.
export const TOO_MANY_TOKEN_REQUESTS = 'Too many requests with this token, try again later'
export const TOO_MANY_INVALID_TOKENS = 'Too many invalid tokens, try again later'

const hasFlag = (data: unknown, flag: string) => typeof data === 'object' && data !== null && (data as Record<string, unknown>)[flag] === true

/**
 * The outcome of an answer of a route of a deck that is not a success, after a
 * successful `GET /api/tokens/current`.
 */
export function deckOutcome(route: DeckRoute, answer: FailedAnswer): DeckOutcome {
  if (answer.kind === 'unreachable')
    return { action: 'stopped', code: 'instance-unreachable' }
  if (answer.kind === 'unreadable')
    return { action: 'stopped', code: 'instance-answer' }
  const { status, statusMessage, data } = answer
  if (status >= 300 && status < 400)
    return { action: 'stopped', code: 'instance-redirect' }
  switch (status) {
    case 400:
      return { action: 'refused', problem: 'instance-refused' }
    case 401:
      return hasFlag(data, 'requiresPassword') ? { action: 'forbidden', reason: 'password' } : { action: 'stopped', code: 'token-refused' }
    case 403:
      return { action: 'forbidden', reason: 'refused' }
    case 404:
      return route === 'read' ? { action: 'absent' } : { action: 'forbidden', reason: 'refused' }
    case 409:
      if (route === 'create')
        return { action: 'exists' }
      return route === 'save' && !hasFlag(data, 'conflict') ? { action: 'live-session' } : { action: 'conflict' }
    case 413:
      return { action: 'refused', problem: route === 'image' ? 'image-refused' : 'deck-body-too-large' }
    case 415:
      return route === 'image' ? { action: 'refused', problem: 'image-refused' } : { action: 'stopped', code: 'instance-error' }
    case 429:
      if (statusMessage === TOO_MANY_TOKEN_REQUESTS)
        return { action: 'stopped', code: 'too-many-token-requests' }
      return statusMessage === TOO_MANY_INVALID_TOKENS ? { action: 'stopped', code: 'too-many-invalid-tokens' } : { action: 'stopped', code: 'instance-error' }
    default:
      return { action: 'stopped', code: 'instance-error' }
  }
}

/** The exit code of an outcome, and whether it stops the command: the codes 3 and 6 reach the whole instance. */
export function outcomeExit(outcome: Exclude<DeckOutcome, { action: 'absent' }>): { exit: ExitCode, stops: boolean } {
  if (outcome.action !== 'stopped')
    return { exit: ACTION_EXIT_CODES[outcome.action], stops: false }
  const exit = outcome.code === 'token-refused' || outcome.code === 'too-many-invalid-tokens' ? EXIT_CODES.authentication : EXIT_CODES.instance
  return { exit, stops: true }
}

/**
 * The outcome of a success of the save or of the publication: an instance
 * that does not repeat the digest `push` sent may run a version without the
 * check, and stops the command.
 */
export function digestOutcome(sent: string | null, answered: unknown): DeckOutcome | null {
  return answered === sent ? null : { action: 'stopped', code: 'digest-unchecked' }
}

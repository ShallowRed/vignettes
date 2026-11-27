import type { Route } from './api.ts'
import type { FailedAnswer } from './push-plan.ts'
import manifest from '../package.json' with { type: 'json' }
import { ErrorBodySchema } from './api.ts'
import { CliError } from './messages.ts'

export interface RemoteCall {
  origin: string
  token: string
  /** The `fetch` of Node, replaced by the tests. */
  fetch?: typeof fetch
}

/** What a request sends besides its route: the slug of its path, a query, and a JSON or multipart body. */
export interface RouteRequest {
  slug?: string
  query?: string
  json?: unknown
  form?: FormData
  /** In milliseconds; 30 seconds by default. */
  timeout?: number
}

const TIMEOUT_MS = 30_000

/** The time an upload of an image may take. */
export const UPLOAD_TIMEOUT_MS = 120_000

/** The code of the network error under the `TypeError` of `fetch`, such as `ECONNREFUSED`. */
function networkCode(error: unknown): string {
  if ((error as { name?: unknown }).name === 'TimeoutError')
    return 'timeout'
  const code = (error as { cause?: { code?: unknown } }).cause?.code
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'no answer'
}

/** Whether a value or one of its fields holds the token. */
function repeats(value: unknown, token: string): boolean {
  return typeof value === 'string'
    ? value.includes(token)
    : typeof value === 'object' && value !== null && Object.values(value).some(field => repeats(field, token))
}

/** The address of a route at the origin of the instance, and nowhere else. */
function routeUrl(route: Route<unknown>, call: RemoteCall, request: RouteRequest): URL {
  const path = route.path.replace(':slug', encodeURIComponent(request.slug ?? ''))
  const url = new URL(`${path}${request.query ? `?${request.query}` : ''}`, call.origin)
  if (url.origin !== call.origin)
    throw new CliError('internal', 'a route left the origin of the instance.')
  return url
}

/** Sends a request with the token; a network error, a closed connection or a timeout throws `instance-unreachable`. */
async function send(route: Route<unknown>, call: RemoteCall, request: RouteRequest, accept = 'application/json'): Promise<{ url: URL, response: Response }> {
  const url = routeUrl(route, call, request)
  const headers: Record<string, string> = { 'authorization': `Bearer ${call.token}`, 'accept': accept, 'user-agent': `vignettes-cli/${manifest.version}` }
  if (request.json !== undefined)
    headers['content-type'] = 'application/json'
  try {
    const response = await (call.fetch ?? globalThis.fetch)(url, {
      method: route.method,
      redirect: 'manual',
      headers,
      body: request.form ?? (request.json === undefined ? undefined : JSON.stringify(request.json)),
      signal: AbortSignal.timeout(request.timeout ?? TIMEOUT_MS),
    })
    return { url, response }
  }
  catch (error) {
    throw new CliError('instance-unreachable', call.origin, networkCode(error))
  }
}

/** The address a redirection names, with `<token>` for the token. */
function redirection(response: Response, url: URL, token: string): string {
  const location = response.headers.get('location')
  return location ? (URL.parse(location, url.href)?.href ?? location).replaceAll(token, '<token>') : 'no address'
}

/**
 * Calls a route of the instance with the token, at the origin of the instance
 * and nowhere else: a redirection stops the command, and each status other
 * than a success stops it with the code of its class.
 */
export async function callInstance<Answer>(route: Route<Answer>, call: RemoteCall, request: RouteRequest = {}): Promise<Answer> {
  const { url, response } = await send(route, call, request)
  if (response.status >= 300 && response.status < 400)
    throw new CliError('instance-redirect', call.origin, redirection(response, url, call.token))
  if (response.status === 401)
    throw new CliError('token-refused', call.origin)
  if (response.status === 403)
    throw new CliError('token-forbidden', call.origin)
  if (response.status === 404)
    throw new CliError('route-unknown', call.origin, route.path)
  if (!response.ok)
    throw new CliError('instance-error', call.origin, String(response.status))
  const answer = route.answer.safeParse(await response.json().catch(() => undefined))
  // A field of the answer could repeat the token: it never reaches an output or a file.
  if (!answer.success || repeats(answer.data, call.token))
    throw new CliError('instance-answer', call.origin, route.path)
  return answer.data
}

/** The answer of a route of a deck: its success, or what `deckOutcome` classes, with the detail of its message. */
export type DeckAnswer<Answer>
  = | { ok: true, answer: Answer }
    | { ok: false, failure: FailedAnswer, detail: string }

/**
 * Calls a route of a deck as `callInstance` does, and gives each answer that
 * is not a success to the caller, which classes it by `deckOutcome`: the
 * status, the message of the server without the token, and its `data`.
 */
export async function callDeckRoute<Answer>(route: Route<Answer>, call: RemoteCall, request: RouteRequest): Promise<DeckAnswer<Answer>> {
  let sent
  try {
    sent = await send(route, call, request)
  }
  catch (error) {
    return { ok: false, failure: { kind: 'unreachable' }, detail: error instanceof CliError ? error.message : String(error) }
  }
  const { url, response } = sent
  if (response.status >= 300 && response.status < 400)
    return { ok: false, failure: { kind: 'status', status: response.status }, detail: redirection(response, url, call.token) }
  const body = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = ErrorBodySchema.safeParse(body)
    const statusMessage = error.success ? error.data.statusMessage?.replaceAll(call.token, '<token>') : undefined
    return { ok: false, failure: { kind: 'status', status: response.status, statusMessage, data: error.success ? error.data.data : undefined }, detail: statusMessage ?? String(response.status) }
  }
  const answer = route.answer.safeParse(body)
  if (!answer.success || repeats(answer.data, call.token))
    return { ok: false, failure: { kind: 'unreadable' }, detail: route.path }
  return { ok: true, answer: answer.data }
}

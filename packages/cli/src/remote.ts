import type { Route } from './api.ts'
import manifest from '../package.json' with { type: 'json' }
import { CliError } from './messages.ts'

export interface RemoteCall {
  origin: string
  token: string
  /** The `fetch` of Node, replaced by the tests. */
  fetch?: typeof fetch
}

/** The code of the network error under the `TypeError` of `fetch`, such as `ECONNREFUSED`. */
function networkCode(error: unknown): string {
  const code = (error as { cause?: { code?: unknown } }).cause?.code
  return typeof code === 'string' && /^[A-Z_]+$/.test(code) ? code : 'no answer'
}

/**
 * Calls a route of the instance with the token, at the origin of the instance
 * and nowhere else: a redirection stops the command, and each status other
 * than a success stops it with the code of its class.
 */
export async function callInstance<Answer>(route: Route<Answer>, call: RemoteCall): Promise<Answer> {
  const url = new URL(route.path, call.origin)
  if (url.origin !== call.origin)
    throw new CliError('internal', 'a route left the origin of the instance.')
  // An address or a field of the answer could repeat the token: it never reaches an output or a file.
  const safe = (text: string) => text.replaceAll(call.token, '<token>')
  const repeatsToken = (value: unknown): boolean => typeof value === 'string'
    ? value.includes(call.token)
    : typeof value === 'object' && value !== null && Object.values(value).some(repeatsToken)
  let response: Response
  try {
    response = await (call.fetch ?? globalThis.fetch)(url, {
      method: route.method,
      redirect: 'manual',
      headers: { 'authorization': `Bearer ${call.token}`, 'accept': 'application/json', 'user-agent': `vignettes-cli/${manifest.version}` },
    })
  }
  catch (error) {
    throw new CliError('instance-unreachable', call.origin, networkCode(error))
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    throw new CliError('instance-redirect', call.origin, location ? safe(URL.parse(location, url.href)?.href ?? location) : 'no address')
  }
  if (response.status === 401)
    throw new CliError('token-refused', call.origin)
  if (response.status === 403)
    throw new CliError('token-forbidden', call.origin)
  if (response.status === 404)
    throw new CliError('route-unknown', call.origin, route.path)
  if (!response.ok)
    throw new CliError('instance-error', call.origin, String(response.status))
  const answer = route.answer.safeParse(await response.json().catch(() => undefined))
  if (!answer.success || repeatsToken(answer.data))
    throw new CliError('instance-answer', call.origin, route.path)
  return answer.data
}

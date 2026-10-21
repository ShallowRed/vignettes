import type { TokenRequest, TokenSummary } from '#shared/access'
import type { Fetcher } from './http'

/** The personal access tokens of the signed-in account. */
export const tokensApi = {
  list: (fetch: Fetcher) => fetch<TokenSummary[]>('/api/tokens'),
  /** The response carries the secret, which the server never shows again. */
  create: (fetch: Fetcher, request: TokenRequest) =>
    fetch<{ token: TokenSummary, secret: string }>('/api/tokens', { method: 'POST', body: request }),
  /** Revokes an active token, removes a revoked or expired one. */
  remove: (fetch: Fetcher, id: number) =>
    fetch<{ action: 'revoked' | 'removed' }>(`/api/tokens/${id}`, { method: 'DELETE' }),
}

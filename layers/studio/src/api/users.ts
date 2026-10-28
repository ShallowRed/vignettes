import type { AccountRole, AccountSummary, UserAccount } from '#shared/access'
import type { Fetcher } from './http'

/** Known identities and their runtime role (owner only). */
export const usersApi = {
  list: (fetch: Fetcher) => fetch<AccountSummary[]>('/api/admin/users'),
  /** Pre-provision an account by provider handle so it can be granted access now. */
  invite: (fetch: Fetcher, provider: 'github' | 'google', handle: string) =>
    fetch<UserAccount>('/api/admin/users/invite', { method: 'POST', body: { provider, handle } }),
  setRole: (fetch: Fetcher, id: number, role: AccountRole) =>
    fetch(`/api/admin/users/${id}`, { method: 'PATCH', body: { role } }),
  /** Revokes every active personal token of the account. */
  revokeTokens: (fetch: Fetcher, id: number) =>
    fetch<{ revoked: number }>(`/api/admin/users/${id}/tokens`, { method: 'DELETE' }),
  /** Permanent: removes the account and every grant it holds. */
  remove: (fetch: Fetcher, id: number) =>
    fetch(`/api/admin/users/${id}`, { method: 'DELETE' }),
}

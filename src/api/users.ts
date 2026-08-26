import type { UserAccount } from '#shared/access'
import type { Fetcher } from './http'

/** Known identities and their runtime role (owner only). */
export const usersApi = {
  list: (fetch: Fetcher) => fetch<UserAccount[]>('/api/admin/users'),
  /** Pre-provision an account by provider handle so it can be granted access now. */
  invite: (fetch: Fetcher, provider: 'github' | 'google', handle: string) =>
    fetch<UserAccount>('/api/admin/users/invite', { method: 'POST', body: { provider, handle } }),
}

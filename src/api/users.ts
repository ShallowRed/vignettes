import type { UserAccount } from '#shared/access'
import type { Fetcher } from './http'

/** Known identities and their runtime role (owner only). */
export const usersApi = {
  list: (fetch: Fetcher) => fetch<UserAccount[]>('/api/admin/users'),
  /** Pre-provision a Google account by email so it can be granted access now. */
  invite: (fetch: Fetcher, email: string) =>
    fetch<UserAccount>('/api/admin/users/invite', { method: 'POST', body: { email } }),
}

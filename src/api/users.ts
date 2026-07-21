import type { UserAccount } from '#shared/access'
import type { Fetcher } from './http'

/** Known identities and their runtime role (owner only). */
export const usersApi = {
  list: (fetch: Fetcher) => fetch<UserAccount[]>('/api/admin/users'),
}

import { useStores } from './db'

/** The database-backed `UserStore` port. */
export function useUserStore() {
  return useStores().users
}

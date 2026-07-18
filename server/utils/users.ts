import { createUserStore } from '../db/user-store'
import { useDb } from './db'

/** The database-backed `UserStore` port. */
export function useUserStore() {
  return createUserStore(useDb())
}

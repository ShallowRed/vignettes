import type { Fetcher } from '~/api'
import { trashApi } from '~/api'
import { trashKeys } from './keys'

/** Declarative query options for the corbeille listing. */
export function trashQuery(fetch: Fetcher) {
  return {
    key: trashKeys.all,
    query: () => trashApi.list(fetch),
  }
}

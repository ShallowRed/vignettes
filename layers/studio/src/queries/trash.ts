import type { Fetcher } from '../api'
import { trashApi } from '../api'
import { trashKeys } from './keys'
import { throughPayload } from './payload'

/** Declarative query options for the corbeille listing. */
export function trashQuery(fetch: Fetcher) {
  return {
    key: trashKeys.all,
    query: () => throughPayload(trashApi.list(fetch)),
    ssrCatchError: true,
  }
}

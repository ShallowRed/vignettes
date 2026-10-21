import type { Fetcher } from '../api'
import { tokensApi } from '../api'
import { tokenKeys } from './keys'
import { throughPayload } from './payload'

/** Declarative query options for the tokens of the signed-in account. */
export function tokensQuery(fetch: Fetcher) {
  return {
    key: tokenKeys.all,
    query: () => throughPayload(tokensApi.list(fetch)),
    ssrCatchError: true,
  }
}

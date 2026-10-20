import type { PermissionScope } from '#shared/access'
import type { Fetcher } from '../api'
import { permissionsApi, usersApi } from '../api'
import { deckKeys, projectKeys, usersKeys } from './keys'

/** The cache key for a scope's grants (reactive: recomputed if the scope moves). */
export function sharingKey(scope: () => PermissionScope) {
  const s = scope()
  return s.kind === 'deck' ? deckKeys.sharing(s.slug) : projectKeys.sharing(s.slug)
}

/**
 * Declarative query options for a scope's sharing grants. `throughDeck` reads a
 * folder's grants through one of its decks (see `permissionsApi.list`).
 */
export function grantsQuery(fetch: Fetcher, scope: () => PermissionScope, throughDeck?: () => string) {
  return {
    key: () => sharingKey(scope),
    query: () => permissionsApi.list(fetch, scope(), { deck: throughDeck?.() }),
  }
}

/** Declarative query options for the known-identities picker. */
export function usersQuery(fetch: Fetcher) {
  return {
    key: usersKeys.all,
    query: () => usersApi.list(fetch),
  }
}

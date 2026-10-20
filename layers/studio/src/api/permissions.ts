import type { DeckGrant, GrantSummary, PermissionScope, ProviderHandle } from '#shared/access'
import type { Fetcher } from './http'

/** The admin permissions endpoint for a scope (a deck or a project). */
function scopePath(scope: PermissionScope): string {
  return `/api/admin/${scope.kind === 'deck' ? 'decks' : 'projects'}/${scope.slug}/permissions`
}

/**
 * Sharing grants, unified across decks and projects (same endpoint shape under a
 * different prefix). A grant escalates one user on the scope.
 */
export const permissionsApi = {
  /** `deck` reads a folder's grants through one of its decks, for whoever may share that deck. */
  list: (fetch: Fetcher, scope: PermissionScope, opts: { deck?: string } = {}) =>
    fetch<GrantSummary[]>(scopePath(scope), opts.deck ? { query: { deck: opts.deck } } : {}),
  /** Grant a deck to an account named by its provider handle, invited when it never logged in. */
  shareByHandle: (fetch: Fetcher, slug: string, account: ProviderHandle, role: DeckGrant, expiresAt: string | null) =>
    fetch<{ userId: number, login: string }>(scopePath({ kind: 'deck', slug }), { method: 'POST', body: { account, role, expiresAt } }),
  set: (fetch: Fetcher, scope: PermissionScope, userId: number, role: DeckGrant, expiresAt?: string | null) =>
    fetch(`${scopePath(scope)}/${userId}`, { method: 'PUT', body: { role, ...(expiresAt !== undefined ? { expiresAt } : {}) } }),
  remove: (fetch: Fetcher, scope: PermissionScope, userId: number) =>
    fetch(`${scopePath(scope)}/${userId}`, { method: 'DELETE' }),
}

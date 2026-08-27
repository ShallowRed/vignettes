import type { DeckGrant, GrantSummary, PermissionScope } from '#shared/access'
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
  list: (fetch: Fetcher, scope: PermissionScope) =>
    fetch<GrantSummary[]>(scopePath(scope)),
  set: (fetch: Fetcher, scope: PermissionScope, userId: number, role: DeckGrant, expiresAt?: string | null) =>
    fetch(`${scopePath(scope)}/${userId}`, { method: 'PUT', body: { role, ...(expiresAt !== undefined ? { expiresAt } : {}) } }),
  remove: (fetch: Fetcher, scope: PermissionScope, userId: number) =>
    fetch(`${scopePath(scope)}/${userId}`, { method: 'DELETE' }),
}

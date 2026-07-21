import type { DeckGrant } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { deckKeys, projectKeys, usersKeys } from '~/queries/keys'

/** A grant currently held on a deck or project. */
export interface GrantRow { userId: number, login: string, role: DeckGrant }
/** A known identity (login row) offered in the sharing picker. */
export interface UserRow { id: number, login: string, role: string }

/** What is being shared: one deck, or a whole project (master key). */
export interface SharingScope { kind: 'deck' | 'project', slug: string }

export const GRANT_ROLE_ITEMS = [
  { label: 'Lecture', value: 'viewer' as DeckGrant },
  { label: 'Édition', value: 'editor' as DeckGrant },
]

/**
 * Sharing (per-deck or per-project grants), unified for both slideovers. Owner
 * only. The grants + users lists are Pinia Colada queries (deduped app-wide by
 * key), and add/remove are mutations that invalidate the grants query — no manual
 * reload. Fetches are gated by `enabled` so a closed slideover stays idle.
 *
 * `useRequestFetch` is captured in setup (admin endpoints need the session
 * cookie); the queries never run during SSR because the slideover opens on click.
 */
export function useSharing(scope: () => SharingScope, enabled: () => boolean) {
  const requestFetch = useRequestFetch()
  const queryCache = useQueryCache()
  const toast = useToast()

  function basePath() {
    const s = scope()
    return `/api/admin/${s.kind === 'deck' ? 'decks' : 'projects'}/${s.slug}/permissions`
  }
  function grantsKey() {
    const s = scope()
    return s.kind === 'deck' ? deckKeys.sharing(s.slug) : projectKeys.sharing(s.slug)
  }

  const grantsQuery = useQuery({
    key: grantsKey,
    query: () => requestFetch<GrantRow[]>(basePath()),
    enabled,
  })
  const usersQuery = useQuery({
    key: usersKeys.all,
    query: () => requestFetch<UserRow[]>('/api/admin/users'),
    enabled,
  })

  const grants = computed<GrantRow[]>(() => grantsQuery.data.value ?? [])
  const knownUsers = computed<UserRow[]>(() => usersQuery.data.value ?? [])

  // Global owners/editors already see everything; only a viewer can be escalated.
  const grantableUsers = computed(() => {
    const granted = new Set(grants.value.map(g => g.userId))
    return knownUsers.value
      .filter(u => u.role === 'viewer' && !granted.has(u.id))
      .map(u => ({ label: u.login, value: u.id }))
  })

  const grantUserId = ref<number | undefined>(undefined)
  const grantRole = ref<DeckGrant>('viewer')

  function invalidateGrants() {
    return queryCache.invalidateQueries({ key: grantsKey() })
  }
  function onError(error: any, action: string) {
    toast.add({ title: error?.statusMessage || action, icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const { mutate: submitGrant, isLoading: adding } = useMutation({
    mutation: () => requestFetch(`${basePath()}/${grantUserId.value}`, { method: 'PUT', body: { role: grantRole.value } }),
    onSuccess() { grantUserId.value = undefined },
    onError: e => onError(e, 'Échec du partage'),
    onSettled: invalidateGrants,
  })
  const { mutate: submitRemove, isLoading: removing } = useMutation({
    mutation: (userId: number) => requestFetch(`${basePath()}/${userId}`, { method: 'DELETE' }),
    onError: e => onError(e, 'Échec du retrait'),
    onSettled: invalidateGrants,
  })

  function addGrant() {
    if (grantUserId.value != null)
      submitGrant()
  }

  const busy = computed(() => adding.value || removing.value)

  return {
    grants,
    grantableUsers,
    grantUserId,
    grantRole,
    grantRoleItems: GRANT_ROLE_ITEMS,
    addGrant,
    removeGrant: (userId: number) => submitRemove(userId),
    busy,
  }
}

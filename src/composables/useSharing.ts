import type { DeckGrant, GrantSummary, PermissionScope, UserAccount } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { permissionsApi, usersApi } from '~/api'
import { grantsQuery, sharingKey, usersQuery } from '~/queries'
import { usersKeys } from '~/queries/keys'

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
 * All HTTP goes through the `permissionsApi` / `usersApi` service layer.
 */
export function useSharing(scope: () => PermissionScope, enabled: () => boolean) {
  const requestFetch = useRequestFetch()
  const queryCache = useQueryCache()
  const toast = useToast()

  const grantsQ = useQuery({ ...grantsQuery(requestFetch, scope), enabled })
  const usersQ = useQuery({ ...usersQuery(requestFetch), enabled })

  const grants = computed<GrantSummary[]>(() => grantsQ.data.value ?? [])
  const knownUsers = computed<UserAccount[]>(() => usersQ.data.value ?? [])

  // Global owners/editors already see everything; only a viewer can be escalated.
  const grantableUsers = computed(() => {
    const granted = new Set(grants.value.map(g => g.userId))
    return knownUsers.value
      .filter(u => u.role === 'viewer' && !granted.has(u.id))
      .map(u => ({ label: u.invited ? `${u.login} (invité)` : u.login, value: u.id }))
  })

  const grantUserId = ref<number | undefined>(undefined)
  const grantRole = ref<DeckGrant>('viewer')

  function invalidateGrants() {
    return queryCache.invalidateQueries({ key: sharingKey(scope) })
  }
  function onError(error: any, action: string) {
    toast.add({ title: error?.statusMessage || action, icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const { mutate: submitGrant, isLoading: adding } = useMutation({
    mutation: () => permissionsApi.set(requestFetch, scope(), grantUserId.value!, grantRole.value),
    onSuccess() { grantUserId.value = undefined },
    onError: e => onError(e, 'Échec du partage'),
    onSettled: invalidateGrants,
  })
  const { mutate: submitRemove, isLoading: removing } = useMutation({
    mutation: (userId: number) => permissionsApi.remove(requestFetch, scope(), userId),
    onError: e => onError(e, 'Échec du retrait'),
    onSettled: invalidateGrants,
  })

  function addGrant() {
    if (grantUserId.value != null)
      submitGrant()
  }

  // Invite on the fly: an email that never logged in becomes a pre-provisioned
  // Google account (server-side), immediately selectable in the picker — the
  // grant then goes through the normal flow above.
  const inviteEmail = ref('')
  // Coarse shape check to enable the button; the endpoint zod-validates for real.
  const inviteValid = computed(() => {
    const [local, domain, ...rest] = inviteEmail.value.trim().split('@')
    return rest.length === 0 && !!local && !!domain && domain.includes('.')
  })
  const { mutate: submitInvite, isLoading: inviting } = useMutation({
    mutation: () => usersApi.invite(requestFetch, inviteEmail.value.trim()),
    async onSuccess(account) {
      await queryCache.invalidateQueries({ key: usersKeys.all })
      grantUserId.value = account.id
      inviteEmail.value = ''
      toast.add({ title: 'Compte invité', description: `${account.login} peut maintenant recevoir un accès.`, icon: 'i-lucide-mail-plus', color: 'success' })
    },
    onError: e => onError(e, 'Échec de l\'invitation'),
  })
  function invite() {
    if (inviteValid.value && !inviting.value)
      submitInvite()
  }

  const busy = computed(() => adding.value || removing.value || inviting.value)

  return {
    grants,
    grantableUsers,
    grantUserId,
    grantRole,
    grantRoleItems: GRANT_ROLE_ITEMS,
    addGrant,
    removeGrant: (userId: number) => submitRemove(userId),
    inviteEmail,
    inviteValid,
    invite,
    busy,
  }
}

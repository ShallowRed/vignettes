import type { DeckGrant, GrantSummary, IdentityProvider, PermissionScope, UserAccount } from '#shared/access'
import { isProviderHandle } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { permissionsApi, usersApi } from '~/api'
import { grantsQuery, sharingKey, usersQuery } from '~/queries'
import { usersKeys } from '~/queries/keys'

export const GRANT_ROLE_ITEMS = [
  { label: 'Lecture', value: 'viewer' as DeckGrant },
  { label: 'Édition', value: 'editor' as DeckGrant },
]

/** Grant duration presets; the value is a day count (0 = permanent). */
export const GRANT_DURATION_ITEMS = [
  { label: 'Illimité', value: 0 },
  { label: '7 jours', value: 7 },
  { label: '30 jours', value: 30 },
  { label: '90 jours', value: 90 },
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
  /** True once the accounts list actually loaded (empty ≠ still loading). */
  const usersReady = computed(() => usersQ.status.value === 'success')

  // Global owners/editors already see everything; only a viewer can be escalated.
  const grantableUsers = computed(() => {
    const granted = new Set(grants.value.map(g => g.userId))
    return knownUsers.value
      .filter(u => u.role === 'viewer' && !granted.has(u.id))
      .map(u => ({ label: u.invited ? `${u.login} (invité)` : u.login, value: u.id }))
  })

  const grantUserId = ref<number | undefined>(undefined)
  const grantRole = ref<DeckGrant>('viewer')
  const grantDays = ref(0)

  function invalidateGrants() {
    return queryCache.invalidateQueries({ key: sharingKey(scope) })
  }
  function onError(error: any, action: string) {
    toast.add({ title: error?.statusMessage || action, icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const { mutate: submitGrant, isLoading: adding } = useMutation({
    mutation: () => permissionsApi.set(
      requestFetch,
      scope(),
      grantUserId.value!,
      grantRole.value,
      grantDays.value > 0 ? new Date(Date.now() + grantDays.value * 86_400_000).toISOString() : null,
    ),
    onSuccess() {
      grantUserId.value = undefined
      grantDays.value = 0
    },
    onError: e => onError(e, 'Échec du partage'),
    onSettled: invalidateGrants,
  })
  const { mutate: submitRemove, isLoading: removing } = useMutation({
    mutation: (userId: number) => permissionsApi.remove(requestFetch, scope(), userId),
    onError: e => onError(e, 'Échec du retrait'),
    onSettled: invalidateGrants,
  })

  // Inline role change on an existing grant: same upsert, keeping its expiry.
  // An expired grant is not editable this way (re-adding it is a conscious act).
  const { mutate: submitRoleChange, isLoading: changingRole } = useMutation({
    mutation: ({ userId, role, expiresAt }: { userId: number, role: DeckGrant, expiresAt: string | null }) =>
      permissionsApi.set(requestFetch, scope(), userId, role, expiresAt),
    onError: e => onError(e, 'Échec de la modification'),
    onSettled: invalidateGrants,
  })
  function changeGrantRole(grant: GrantSummary, role: DeckGrant) {
    if (role !== grant.role)
      submitRoleChange({ userId: grant.userId, role, expiresAt: grant.expiresAt ?? null })
  }

  function addGrant() {
    if (grantUserId.value != null)
      submitGrant()
  }

  // Invite on the fly: a handle that never logged in becomes a pre-provisioned
  // account (server-side), immediately selectable in the picker — the grant then
  // goes through the normal flow above. Works for both providers: a Google email
  // or a GitHub username.
  const inviteProvider = ref<IdentityProvider>('google')
  const inviteHandle = ref('')
  const inviteValid = computed(() => isProviderHandle(inviteProvider.value, inviteHandle.value))
  const { mutate: submitInvite, isLoading: inviting } = useMutation({
    mutation: () => usersApi.invite(requestFetch, inviteProvider.value, inviteHandle.value.trim()),
    async onSuccess(account) {
      await queryCache.invalidateQueries({ key: usersKeys.all })
      grantUserId.value = account.id
      inviteHandle.value = ''
      toast.add({ title: 'Compte autorisé', description: `${account.login} peut maintenant recevoir un accès.`, icon: 'i-lucide-user-plus', color: 'success' })
    },
    onError: e => onError(e, 'Échec de l\'autorisation'),
  })
  function invite() {
    if (inviteValid.value && !inviting.value)
      submitInvite()
  }

  const busy = computed(() => adding.value || removing.value || inviting.value || changingRole.value)

  return {
    grants,
    grantableUsers,
    grantUserId,
    grantRole,
    grantDays,
    grantRoleItems: GRANT_ROLE_ITEMS,
    grantDurationItems: GRANT_DURATION_ITEMS,
    addGrant,
    changeGrantRole,
    removeGrant: (userId: number) => submitRemove(userId),
    usersReady,
    inviteProvider,
    inviteHandle,
    inviteValid,
    invite,
    busy,
  }
}

import type { DeckGrant, GrantSummary, IdentityProvider, PermissionScope, ProviderHandle, UserAccount } from '#shared/access'
import { isProviderHandle, mayGrantUntil } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { permissionsApi, usersApi } from '../api'
import { grantsQuery, sharingKey, usersQuery } from '../queries'
import { usersKeys } from '../queries/keys'
import { mayChangeRole } from '../utils/grant-role'
import { requestErrorMessage } from '../utils/request-error'
import { shortDate } from '../utils/short-date'

/** Grant duration presets, as day counts (0 = permanent). */
const GRANT_DURATIONS = [0, 7, 30, 90]
/** The duration that ends with the sharer's own access. */
const UNTIL_LIMIT = -1

/** A role offered for a grant; a disabled role gives its reason. */
export interface GrantRoleItem {
  label: string
  value: DeckGrant
  disabled?: boolean
  reason?: string
}

/**
 * Sharing (per-deck or per-project grants), unified for both slideovers. The
 * grants + users lists are Pinia Colada queries (deduped app-wide by key), and
 * add/remove are mutations that invalidate the grants query, so the lists reload by themselves.
 * Fetches are gated by `enabled` so a closed slideover stays idle.
 *
 * `directory` tells whether the actor reads the list of accounts (the owner):
 * the owner picks an account in it, another sharer of a deck types the handle
 * of the account (`shareByHandle`), which the server finds or invites.
 *
 * `limit` is the end of the sharer's own access (`sharingLimit`), undefined while
 * it is not known yet: the durations past it are disabled, one more ends with
 * it, and the terms wait for it (`termsReady`).
 *
 * `useRequestFetch` is captured in setup (admin endpoints need the session
 * cookie); the queries never run during SSR because the slideover opens on click.
 * All HTTP goes through the `permissionsApi` / `usersApi` service layer.
 */
export function useSharing(scope: () => PermissionScope, enabled: () => boolean, directory: () => boolean, limit: () => Date | null | undefined = () => null) {
  const requestFetch = useRequestFetch()
  const queryCache = useQueryCache()
  const toast = useToast()
  const { track } = useStudioEvent()
  const { t, locale } = useI18n()

  const grantRoleItems = computed<GrantRoleItem[]>(() => [
    { label: t('deck.sharing.roleViewer'), value: 'viewer' },
    { label: t('deck.sharing.roleEditor'), value: 'editor' },
  ])
  // The roles of an existing grant: a collaborator raises it to `editor` only
  // when it ends by their own limit.
  function grantRoleItemsOf(grant: GrantSummary): GrantRoleItem[] {
    const end = limit()
    return grantRoleItems.value.map((item) => {
      if (mayChangeRole(end, grant, item.value))
        return item
      return { ...item, disabled: true, reason: end ? t('deck.sharing.editorPastLimit', { date: shortDate(end, locale.value) }) : undefined }
    })
  }
  const endOf = (days: number) => days === UNTIL_LIMIT ? limit() ?? null : days > 0 ? new Date(Date.now() + days * 86_400_000) : null
  const termsReady = computed(() => limit() !== undefined)
  const grantRole = ref<DeckGrant>('viewer')
  const grantDurationItems = computed(() => {
    const end = limit() ?? null
    return [
      ...GRANT_DURATIONS.map(days => ({
        label: days === 0 ? t('deck.sharing.durationUnlimited') : t('deck.sharing.durationDays', days),
        value: days,
        disabled: !mayGrantUntil(end, { role: grantRole.value, expiresAt: endOf(days) }),
      })),
      ...(end ? [{ label: t('deck.sharing.durationUntilMine', { date: shortDate(end, locale.value) }), value: UNTIL_LIMIT, disabled: false }] : []),
    ]
  })

  const grantsQ = useQuery({ ...grantsQuery(requestFetch, scope), enabled })
  const usersQ = useQuery({ ...usersQuery(requestFetch), enabled: () => enabled() && directory() })

  const grants = computed<GrantSummary[]>(() => grantsQ.data.value ?? [])
  const grantsStatus = grantsQ.status
  const knownUsers = computed<UserAccount[]>(() => usersQ.data.value ?? [])
  /** True once the accounts list actually loaded (empty ≠ still loading). */
  const usersReady = computed(() => usersQ.status.value === 'success')

  // Global owners/editors already see everything; only a viewer can be escalated.
  const grantableUsers = computed(() => {
    const granted = new Set(grants.value.map(g => g.userId))
    return knownUsers.value
      .filter(u => u.role === 'viewer' && !granted.has(u.id))
      .map(u => ({ label: u.invited ? t('deck.sharing.invitedAccount', { login: u.login }) : u.login, value: u.id }))
  })

  const grantUserId = ref<number | undefined>(undefined)
  const defaultDays = () => {
    const end = limit()
    return end === undefined ? undefined : end ? UNTIL_LIMIT : 0
  }
  const grantDays = ref<number | undefined>(defaultDays())
  watch(() => {
    const end = limit()
    return end ? end.getTime() : end
  }, () => {
    grantDays.value = defaultDays()
  })

  function invalidateGrants() {
    return queryCache.invalidateQueries({ key: sharingKey(scope) })
  }
  function onError(error: any, action: string) {
    toast.add({ title: requestErrorMessage(error, action), icon: 'i-lucide-triangle-alert', color: 'error' })
  }

  const grantExpiry = () => endOf(grantDays.value!)?.toISOString() ?? null

  const { mutate: submitGrant, isLoading: adding } = useMutation({
    mutation: () => permissionsApi.set(requestFetch, scope(), grantUserId.value!, grantRole.value, grantExpiry()),
    onSuccess() {
      track('access-granted', { scope: scope().kind, role: grantRole.value, via: 'account' })
      grantUserId.value = undefined
      grantDays.value = defaultDays()
    },
    onError: e => onError(e, t('deck.sharing.grantFailed')),
    onSettled: invalidateGrants,
  })
  const { mutate: submitRemove, isLoading: removing } = useMutation({
    mutation: (userId: number) => permissionsApi.remove(requestFetch, scope(), userId),
    onError: e => onError(e, t('deck.sharing.removeFailed')),
    onSettled: invalidateGrants,
  })

  // Inline role change on an existing grant: same upsert, keeping its expiry,
  // for the roles `grantRoleItemsOf` offers, and none while the limit is unknown.
  // An expired grant is not editable this way (re-adding it is a conscious act).
  const { mutate: submitRoleChange, isLoading: changingRole } = useMutation({
    mutation: ({ userId, role, expiresAt }: { userId: number, role: DeckGrant, expiresAt: string | null }) =>
      permissionsApi.set(requestFetch, scope(), userId, role, expiresAt),
    onError: e => onError(e, t('deck.sharing.roleChangeFailed')),
    onSettled: invalidateGrants,
  })
  function changeGrantRole(grant: GrantSummary, role: DeckGrant) {
    if (role !== grant.role && mayChangeRole(limit(), grant, role))
      submitRoleChange({ userId: grant.userId, role, expiresAt: grant.expiresAt ?? null })
  }

  function addGrant() {
    if (termsReady.value && grantUserId.value != null)
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
      toast.add({ title: t('deck.sharing.accountAuthorized'), description: t('deck.sharing.accountAuthorizedDescription', { login: account.login }), icon: 'i-lucide-user-plus', color: 'success' })
    },
    onError: e => onError(e, t('deck.sharing.authorizeFailed')),
  })
  function invite() {
    if (inviteValid.value && !inviting.value)
      submitInvite()
  }

  // A deck shared by its handle: the server finds the account or invites it,
  // then grants it, in one request. Folder grants stay with the owner's picker.
  const { mutate: submitHandleGrant, isLoading: sharingByHandle } = useMutation({
    mutation: () => {
      const target = scope()
      if (target.kind !== 'deck')
        throw new Error('A folder is shared from the list of accounts')
      return permissionsApi.shareByHandle(
        requestFetch,
        target.slug,
        { provider: inviteProvider.value, handle: inviteHandle.value.trim() } as ProviderHandle,
        grantRole.value,
        grantExpiry(),
      )
    },
    onSuccess() {
      track('access-granted', { scope: 'deck', role: grantRole.value, via: 'handle' })
      inviteHandle.value = ''
      grantDays.value = defaultDays()
    },
    onError: e => onError(e, t('deck.sharing.grantFailed')),
    onSettled: invalidateGrants,
  })
  function shareByHandle() {
    if (termsReady.value && inviteValid.value && !sharingByHandle.value)
      submitHandleGrant()
  }

  const busy = computed(() => adding.value || removing.value || inviting.value || changingRole.value || sharingByHandle.value)

  return {
    grants,
    grantsStatus,
    refetchGrants: () => grantsQ.refetch(),
    termsReady,
    grantableUsers,
    grantUserId,
    grantRole,
    grantDays,
    grantRoleItems,
    grantRoleItemsOf,
    grantDurationItems,
    addGrant,
    changeGrantRole,
    removeGrant: (userId: number) => submitRemove(userId),
    usersReady,
    inviteProvider,
    inviteHandle,
    inviteValid,
    invite,
    shareByHandle,
    directory,
    busy,
  }
}

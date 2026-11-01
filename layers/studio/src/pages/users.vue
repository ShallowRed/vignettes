<script setup lang="ts">
import type { AccountRole, AccountSummary } from '#shared/access'
import { ACCOUNT_ROLES } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { usersApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { usersQuery } from '../queries'
import { usersKeys } from '../queries/keys'
import { requestErrorMessage } from '../utils/request-error'
import { shortDate } from '../utils/short-date'

definePageMeta({ layout: false })

/**
 * Accounts page (owner only): every identity the instance knows, its global
 * role, whether an invitation is still unclaimed, and removal. One flat table —
 * per-deck/folder access stays in the sharing panels where its context lives.
 */
const { t, locale } = useI18n()
const { owner: isOwner, user } = useAppSession()
const toast = useToast()
const queryCache = useQueryCache()
const requestFetch = useRequestFetch()

const usersQ = useQuery({ ...usersQuery(requestFetch), enabled: () => isOwner.value })
const accounts = computed<AccountSummary[]>(() => usersQ.data.value ?? [])

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('admin.users.title') },
])
useHead({ title: () => t('admin.users.title') })

const roleItems = computed(() => ACCOUNT_ROLES.map(value => ({ label: t(`common.role.${value}`), value })))

function invalidate() {
  return queryCache.invalidateQueries({ key: usersKeys.all })
}
function onError(error: any, fallback: string) {
  toast.add({ title: requestErrorMessage(error, fallback), icon: 'i-lucide-triangle-alert', color: 'error' })
}

const { mutate: changeRole, isLoading: changingRole } = useMutation({
  mutation: ({ id, to }: { id: number, to: AccountRole }) =>
    usersApi.setRole(requestFetch, id, to),
  onSuccess: () => toast.add({ title: t('admin.users.roleUpdated'), icon: 'i-lucide-check', color: 'success' }),
  onError: e => onError(e, t('admin.users.roleChangeFailed')),
  onSettled: invalidate,
})

// Removal goes through a confirmation modal naming what disappears.
const removeTarget = ref<AccountSummary | null>(null)
const removeOpen = computed({
  get: () => removeTarget.value !== null,
  set: (v: boolean) => {
    if (!v)
      removeTarget.value = null
  },
})
const { mutate: runRemove, isLoading: removing } = useMutation({
  mutation: (id: number) => usersApi.remove(requestFetch, id),
  onSuccess() {
    toast.add({ title: t('admin.users.removed'), icon: 'i-lucide-check', color: 'success' })
    removeTarget.value = null
  },
  onError: e => onError(e, t('admin.users.removeFailed')),
  onSettled: invalidate,
})

// Revoking the tokens of an account goes through a confirmation too: its scripts stop working.
const revokeTarget = ref<AccountSummary | null>(null)
const revokeOpen = computed({
  get: () => revokeTarget.value !== null,
  set: (v: boolean) => {
    if (!v)
      revokeTarget.value = null
  },
})
const { mutate: runRevokeTokens, isLoading: revoking } = useMutation({
  mutation: (id: number) => usersApi.revokeTokens(requestFetch, id),
  onSuccess(result) {
    toast.add({ title: t('admin.users.tokensRevoked', result.revoked), icon: 'i-lucide-check', color: 'success' })
    revokeTarget.value = null
  },
  onError: e => onError(e, t('admin.users.revokeTokensFailed')),
  onSettled: invalidate,
})

const busy = computed(() => changingRole.value || removing.value || revoking.value)

const inviteOpen = ref(false)
</script>

<template>
  <NuxtLayout
    name="default"
    :breadcrumb="breadcrumb"
  >
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('admin.users.title') }}
        </h1>
        <span
          v-if="isOwner"
          class="text-sm text-muted whitespace-nowrap"
        >{{ t('admin.users.count', accounts.length) }}</span>
        <div class="flex-1" />
        <UButton
          v-if="isOwner"
          :label="t('admin.users.add')"
          icon="i-lucide-user-plus"
          size="sm"
          @click="inviteOpen = true"
        />
      </div>

      <ErrorState
        v-if="!isOwner"
        icon="i-lucide-lock"
        :title="t('admin.access.restrictedTitle')"
        :description="t('admin.users.restrictedDescription')"
        :back="{ to: '/' }"
      />

      <ul
        v-else
        class="flex flex-col gap-2"
      >
        <li
          v-for="account in accounts"
          :key="account.id"
          class="flex flex-wrap items-center gap-3 list-row"
        >
          <UAvatar
            :src="account.avatarUrl ?? undefined"
            :alt="account.login"
            size="sm"
          />
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ account.login }}
              <span
                v-if="account.id === user?.id"
                class="text-xs text-muted font-normal"
              >{{ t('admin.users.you') }}</span>
            </p>
            <p class="text-xs text-muted">
              <template v-if="account.invited">
                {{ t('admin.users.invitationPending') }}
              </template>
              <template v-else>
                {{ t('admin.users.lastLogin', { date: shortDate(account.lastLoginAt, locale) }) }}
              </template>
              <template v-if="account.activeTokens">
                · {{ t('admin.users.activeTokens', account.activeTokens) }}
              </template>
            </p>
          </div>
          <div class="flex-1" />
          <USelect
            :model-value="account.role"
            :items="roleItems"
            :disabled="busy || account.id === user?.id"
            class="w-32"
            :aria-label="t('admin.users.roleOf', { login: account.login })"
            @update:model-value="(to: any) => changeRole({ id: account.id, to })"
          />
          <UTooltip :text="t('admin.users.revokeTokens', { login: account.login })">
            <UButton
              icon="i-lucide-key-round"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="busy || !account.activeTokens"
              :aria-label="t('admin.users.revokeTokens', { login: account.login })"
              @click="revokeTarget = account"
            />
          </UTooltip>
          <UTooltip :text="t('admin.users.remove', { login: account.login })">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :disabled="busy || account.id === user?.id || account.role === 'owner'"
              :aria-label="t('admin.users.remove', { login: account.login })"
              @click="removeTarget = account"
            />
          </UTooltip>
        </li>
      </ul>

      <UserInviteModal v-model:open="inviteOpen" />

      <UModal
        v-model:open="revokeOpen"
        :title="t('admin.users.revokeTokensConfirmTitle')"
        :description="revokeTarget ? `${revokeTarget.login} · ${t('admin.users.activeTokens', revokeTarget.activeTokens)}` : undefined"
      >
        <template #body>
          <ActionNotice
            tone="critical"
            :title="t('admin.users.revokeTokensConfirmNotice')"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="revokeTarget = null"
            />
            <UButton
              :label="t('admin.users.revokeTokensConfirmAction')"
              color="error"
              icon="i-lucide-key-round"
              :loading="revoking"
              @click="revokeTarget && runRevokeTokens(revokeTarget.id)"
            />
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="removeOpen"
        :title="t('admin.users.removeConfirmTitle')"
        :description="removeTarget?.login"
      >
        <template #body>
          <UAlert
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('admin.users.removeConfirmNotice')"
            :description="t('admin.users.removeConfirmDescription')"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="removeTarget = null"
            />
            <UButton
              :label="t('admin.users.removeConfirmAction')"
              color="error"
              icon="i-lucide-trash-2"
              :loading="removing"
              @click="removeTarget && runRemove(removeTarget.id)"
            />
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>

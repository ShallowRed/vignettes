<script setup lang="ts">
import type { Role, UserAccount } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { usersApi } from '../api'
import { useAppSession } from '../composables/useAppSession'
import { usersQuery } from '../queries'
import { usersKeys } from '../queries/keys'
import { requestErrorMessage } from '../utils/request-error'

/**
 * Accounts page (owner only): every identity the instance knows, its global
 * role, whether an invitation is still unclaimed, and removal. One flat table —
 * per-deck/folder access stays in the sharing panels where its context lives.
 */
const { t, locale } = useI18n()
const { role, user } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const toast = useToast()
const queryCache = useQueryCache()
const requestFetch = useRequestFetch()

const usersQ = useQuery({ ...usersQuery(requestFetch), enabled: () => isOwner.value })
const accounts = computed<UserAccount[]>(() => usersQ.data.value ?? [])

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('admin.users.title') },
])
useHead({ title: () => t('admin.users.pageTitle') })

const roleItems = computed(() => [
  { label: t('common.role.viewer'), value: 'viewer' },
  { label: t('common.role.editor'), value: 'editor' },
  { label: t('common.role.owner'), value: 'owner' },
])

function invalidate() {
  return queryCache.invalidateQueries({ key: usersKeys.all })
}
function onError(error: any, fallback: string) {
  toast.add({ title: requestErrorMessage(error, fallback), icon: 'i-lucide-triangle-alert', color: 'error' })
}

const { mutate: changeRole, isLoading: changingRole } = useMutation({
  mutation: ({ id, to }: { id: number, to: Role }) =>
    usersApi.setRole(requestFetch, id, to as 'owner' | 'editor' | 'viewer'),
  onSuccess: () => toast.add({ title: t('admin.users.roleUpdated'), icon: 'i-lucide-check', color: 'success' }),
  onError: e => onError(e, t('admin.users.roleChangeFailed')),
  onSettled: invalidate,
})

// Removal goes through a confirmation modal naming what disappears.
const removeTarget = ref<UserAccount | null>(null)
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

const busy = computed(() => changingRole.value || removing.value)

const inviteOpen = ref(false)

function dateLabel(d: Date | string) {
  return new Date(d).toLocaleDateString(locale.value, { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('admin.users.title') }}
      </h1>
      <span class="text-sm text-muted">{{ t('admin.users.count', accounts.length) }}</span>
      <div class="flex-1" />
      <UButton
        v-if="isOwner"
        :label="t('admin.users.add')"
        icon="i-lucide-user-plus"
        size="sm"
        @click="inviteOpen = true"
      />
    </div>

    <UAlert
      v-if="!isOwner"
      color="error"
      variant="subtle"
      icon="i-lucide-lock"
      :title="t('admin.access.restrictedTitle')"
      :description="t('admin.users.restrictedDescription')"
    />

    <ul
      v-else
      class="flex flex-col gap-2"
    >
      <li
        v-for="account in accounts"
        :key="account.id"
        class="flex flex-wrap items-center gap-3 rounded-lg bg-elevated px-3 py-2"
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
              {{ t('admin.users.lastLogin', { date: dateLabel(account.lastLoginAt) }) }}
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
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          :disabled="busy || account.id === user?.id || account.role === 'owner'"
          :aria-label="t('admin.users.remove', { login: account.login })"
          @click="removeTarget = account"
        />
      </li>
    </ul>

    <UserInviteModal v-model:open="inviteOpen" />

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
</template>

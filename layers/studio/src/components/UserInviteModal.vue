<script setup lang="ts">
import type { IdentityProvider, Role, UserAccount } from '#shared/access'
import { handleField, IDENTITY_PROVIDER_ITEMS, isProviderHandle } from '#shared/access'
import { useMutation, useQueryCache } from '@pinia/colada'
import { usersApi } from '../api'
import { usersKeys } from '../queries/keys'
import { requestErrorMessage } from '../utils/request-error'

/**
 * Add an account from the accounts page: name it by its provider handle (Google
 * email or GitHub username) and give it a global role. The account exists right
 * away, so it can be granted deck or folder access before its first login.
 */
const emit = defineEmits<{ invited: [account: UserAccount] }>()
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()
const requestFetch = useRequestFetch()
const queryCache = useQueryCache()

const provider = ref<IdentityProvider>('google')
const handle = ref('')
const role = ref<Role>('viewer')
const field = computed(() => handleField(provider.value))
const valid = computed(() => isProviderHandle(provider.value, handle.value))

const roleItems = computed(() => [
  { label: t('common.role.viewer'), value: 'viewer' },
  { label: t('common.role.editor'), value: 'editor' },
  { label: t('common.role.owner'), value: 'owner' },
])

watch(open, (isOpen) => {
  if (isOpen) {
    handle.value = ''
    role.value = 'viewer'
  }
})

const { mutate: submit, isLoading: busy } = useMutation({
  async mutation() {
    const account = await usersApi.invite(requestFetch, provider.value, handle.value.trim())
    // `invite` always creates a viewer; a stronger role is a second, explicit step.
    if (role.value !== 'viewer' && account.role !== role.value)
      await usersApi.setRole(requestFetch, account.id, role.value as 'owner' | 'editor' | 'viewer')
    return account
  },
  async onSuccess(account) {
    await queryCache.invalidateQueries({ key: usersKeys.all })
    toast.add({ title: t('admin.invite.added'), description: t('admin.invite.addedDescription', { login: account.login }), icon: 'i-lucide-user-plus', color: 'success' })
    open.value = false
    emit('invited', account)
  },
  onError(error: any) {
    toast.add({ title: requestErrorMessage(error, t('admin.invite.addFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  },
})

function add() {
  if (valid.value && !busy.value)
    submit()
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('admin.invite.title')"
    :description="t('admin.invite.description')"
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="add"
      >
        <UFormField :label="t(field.labelKey)">
          <div class="flex items-center gap-2">
            <USelect
              v-model="provider"
              :items="IDENTITY_PROVIDER_ITEMS"
              class="w-28"
              :aria-label="t('admin.invite.provider')"
            />
            <UInput
              v-model="handle"
              :type="provider === 'google' ? 'email' : 'text'"
              :placeholder="t(field.placeholderKey)"
              :aria-label="t(field.labelKey)"
              autofocus
              class="flex-1"
            />
          </div>
        </UFormField>

        <UFormField
          :label="t('admin.invite.globalRole')"
          :description="t('admin.invite.globalRoleDescription')"
        >
          <USelect
            v-model="role"
            :items="roleItems"
            class="w-full"
          />
        </UFormField>

        <p class="text-xs text-muted">
          {{ t('admin.invite.noEmail', { provider: provider === 'google' ? 'Google' : 'GitHub' }) }}
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          :label="t('common.actions.cancel')"
          color="neutral"
          variant="ghost"
          @click="() => { open = false }"
        />
        <UButton
          :label="t('admin.invite.submit')"
          icon="i-lucide-user-plus"
          :disabled="!valid || busy"
          :loading="busy"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>

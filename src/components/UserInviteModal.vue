<script setup lang="ts">
import type { IdentityProvider, Role, UserAccount } from '#shared/access'
import { handleField, IDENTITY_PROVIDER_ITEMS, isProviderHandle } from '#shared/access'
import { useMutation, useQueryCache } from '@pinia/colada'
import { usersApi } from '~/api'
import { usersKeys } from '~/queries/keys'

/**
 * Add an account from the accounts page: name it by its provider handle (Google
 * email or GitHub username) and give it a global role. The account exists right
 * away, so it can be granted deck or folder access before its first login.
 */
const emit = defineEmits<{ invited: [account: UserAccount] }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const requestFetch = useRequestFetch()
const queryCache = useQueryCache()

const provider = ref<IdentityProvider>('google')
const handle = ref('')
const role = ref<Role>('viewer')
const field = computed(() => handleField(provider.value))
const valid = computed(() => isProviderHandle(provider.value, handle.value))

const ROLE_ITEMS = [
  { label: 'Lecteur', value: 'viewer' },
  { label: 'Éditeur', value: 'editor' },
  { label: 'Owner', value: 'owner' },
]

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
    toast.add({ title: 'Compte ajouté', description: `${account.login} peut recevoir des accès.`, icon: 'i-lucide-user-plus', color: 'success' })
    open.value = false
    emit('invited', account)
  },
  onError(error: any) {
    toast.add({ title: error?.statusMessage || 'Échec de l\'ajout', icon: 'i-lucide-triangle-alert', color: 'error' })
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
    title="Ajouter un compte"
    description="Le compte peut recevoir des accès avant même sa première connexion."
  >
    <template #body>
      <form
        class="flex flex-col gap-4"
        @submit.prevent="add"
      >
        <UFormField :label="field.label">
          <div class="flex items-center gap-2">
            <USelect
              v-model="provider"
              :items="IDENTITY_PROVIDER_ITEMS"
              class="w-28"
              aria-label="Fournisseur de connexion"
            />
            <UInput
              v-model="handle"
              :type="provider === 'google' ? 'email' : 'text'"
              :placeholder="field.placeholder"
              :aria-label="field.label"
              autofocus
              class="flex-1"
            />
          </div>
        </UFormField>

        <UFormField
          label="Rôle global"
          description="Lecteur convient au partage ponctuel : les accès se donnent ensuite par présentation ou par dossier."
        >
          <USelect
            v-model="role"
            :items="ROLE_ITEMS"
            class="w-full"
          />
        </UFormField>

        <p class="text-xs text-muted">
          Aucun email n'est envoyé : partagez le lien vous-même. Le compte s'activera à sa première connexion
          {{ provider === 'google' ? 'Google' : 'GitHub' }}.
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          label="Ajouter le compte"
          icon="i-lucide-user-plus"
          :disabled="!valid || busy"
          :loading="busy"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>

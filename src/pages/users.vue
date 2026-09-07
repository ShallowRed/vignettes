<script setup lang="ts">
import type { Role, UserAccount } from '#shared/access'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { usersApi } from '~/api'
import { useAppSession } from '~/composables/useAppSession'
import { usersQuery } from '~/queries'
import { usersKeys } from '~/queries/keys'

/**
 * Accounts page (owner only): every identity the instance knows, its global
 * role, whether an invitation is still unclaimed, and removal. One flat table —
 * per-deck/folder access stays in the sharing panels where its context lives.
 */
const { role, user } = useAppSession()
const isOwner = computed(() => role.value === 'owner')
const toast = useToast()
const queryCache = useQueryCache()
const requestFetch = useRequestFetch()

const usersQ = useQuery({ ...usersQuery(requestFetch), enabled: () => isOwner.value })
const accounts = computed<UserAccount[]>(() => usersQ.data.value ?? [])

const breadcrumb = [
  { label: 'Accueil', to: '/' },
  { label: 'Comptes' },
]
useHead({ title: 'Comptes · Nuxt Slides' })

const ROLE_ITEMS = [
  { label: 'Lecteur', value: 'viewer' },
  { label: 'Éditeur', value: 'editor' },
  { label: 'Owner', value: 'owner' },
]

function invalidate() {
  return queryCache.invalidateQueries({ key: usersKeys.all })
}
function onError(error: any, fallback: string) {
  toast.add({ title: error?.statusMessage || fallback, icon: 'i-lucide-triangle-alert', color: 'error' })
}

const { mutate: changeRole, isLoading: changingRole } = useMutation({
  mutation: ({ id, to }: { id: number, to: Role }) =>
    usersApi.setRole(requestFetch, id, to as 'owner' | 'editor' | 'viewer'),
  onSuccess: () => toast.add({ title: 'Rôle mis à jour', icon: 'i-lucide-check', color: 'success' }),
  onError: e => onError(e, 'Échec du changement de rôle'),
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
    toast.add({ title: 'Compte retiré', icon: 'i-lucide-check', color: 'success' })
    removeTarget.value = null
  },
  onError: e => onError(e, 'Échec du retrait'),
  onSettled: invalidate,
})

const busy = computed(() => changingRole.value || removing.value)

const inviteOpen = ref(false)

function dateLabel(d: Date | string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold text-highlighted">
        Comptes
      </h1>
      <span class="text-sm text-muted">{{ accounts.length }} compte{{ accounts.length > 1 ? 's' : '' }}</span>
      <div class="flex-1" />
      <UButton
        v-if="isOwner"
        label="Ajouter un compte"
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
      title="Accès réservé"
      description="La gestion des comptes est réservée au rôle Owner."
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
            >(vous)</span>
          </p>
          <p class="text-xs text-muted">
            <template v-if="account.invited">
              Invitation en attente : jamais connecté
            </template>
            <template v-else>
              Dernière connexion {{ dateLabel(account.lastLoginAt) }}
            </template>
          </p>
        </div>
        <div class="flex-1" />
        <USelect
          :model-value="account.role"
          :items="ROLE_ITEMS"
          :disabled="busy || account.id === user?.id"
          class="w-32"
          :aria-label="`Rôle de ${account.login}`"
          @update:model-value="(to: any) => changeRole({ id: account.id, to })"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          :disabled="busy || account.id === user?.id || account.role === 'owner'"
          :aria-label="`Retirer ${account.login}`"
          @click="removeTarget = account"
        />
      </li>
    </ul>

    <UserInviteModal v-model:open="inviteOpen" />

    <UModal
      v-model:open="removeOpen"
      title="Retirer ce compte ?"
      :description="removeTarget?.login"
    >
      <template #body>
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Le compte et tous ses accès partagés seront retirés."
          description="Ses présentations ne sont pas touchées (le contenu n'appartient à personne). Une nouvelle connexion avec la même identité repartira de zéro, sans accès."
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            @click="removeTarget = null"
          />
          <UButton
            label="Retirer le compte"
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

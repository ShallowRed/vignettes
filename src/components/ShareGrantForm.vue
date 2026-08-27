<script setup lang="ts">
import type { useSharing } from '~/composables/useSharing'

/**
 * The add-grant form shared by the deck and project sharing panels: pick a known
 * account, or authorize one on the fly by its provider handle (Google email or
 * GitHub username) — the account is pre-selected in the picker, ready to be
 * granted. Receives the whole `useSharing` bag so both panels stay wired
 * identically.
 */
const props = defineProps<{ sharing: ReturnType<typeof useSharing> }>()

const {
  grantableUsers,
  grantUserId,
  grantRole,
  grantDays,
  grantRoleItems,
  grantDurationItems,
  addGrant,
  inviteProvider,
  inviteHandle,
  inviteValid,
  invite,
  busy,
} = props.sharing

const showInvite = ref(false)

const providerItems = [
  { label: 'Google', value: 'google' },
  { label: 'GitHub', value: 'github' },
]
const isGoogle = computed(() => inviteProvider.value === 'google')
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-end gap-2">
      <UFormField
        label="Ajouter un accès"
        class="flex-1"
      >
        <USelect
          v-model="grantUserId"
          :items="grantableUsers"
          placeholder="Choisir un compte"
          class="w-full"
        />
      </UFormField>
      <USelect
        v-model="grantRole"
        :items="grantRoleItems"
        class="w-28"
      />
      <USelect
        v-model="grantDays"
        :items="grantDurationItems"
        class="w-28"
        aria-label="Durée de l'accès"
      />
      <UButton
        icon="i-lucide-user-plus"
        :disabled="grantUserId == null || busy"
        aria-label="Ajouter l'accès"
        @click="addGrant"
      />
    </div>

    <UButton
      v-if="!showInvite"
      label="Autoriser un compte qui ne s'est jamais connecté…"
      icon="i-lucide-user-plus"
      color="neutral"
      variant="link"
      size="xs"
      class="self-start px-0"
      @click="showInvite = true"
    />
    <form
      v-else
      class="flex flex-col gap-2"
      @submit.prevent="invite"
    >
      <div class="flex items-end gap-2">
        <USelect
          v-model="inviteProvider"
          :items="providerItems"
          class="w-28"
          aria-label="Fournisseur de connexion"
        />
        <UFormField
          :label="isGoogle ? 'Adresse du compte Google' : 'Nom d\'utilisateur GitHub'"
          class="flex-1"
        >
          <UInput
            v-model="inviteHandle"
            :type="isGoogle ? 'email' : 'text'"
            :placeholder="isGoogle ? 'prenom.nom@gmail.com' : 'nom-utilisateur'"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UButton
          label="Autoriser"
          icon="i-lucide-user-plus"
          :disabled="!inviteValid || busy"
          :loading="busy"
          @click="invite"
        />
      </div>
      <p class="text-xs text-muted">
        Aucun email n'est envoyé : partagez le lien vous-même. L'accès s'appliquera dès sa première connexion {{ isGoogle ? 'Google' : 'GitHub' }}.
      </p>
    </form>
  </div>
</template>

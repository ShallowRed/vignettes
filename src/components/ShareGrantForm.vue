<script setup lang="ts">
import type { useSharing } from '~/composables/useSharing'

/**
 * The add-grant form shared by the deck and project sharing panels: pick a known
 * account, or invite a Google account by email on the fly — the invited account
 * is pre-selected in the picker, ready to be granted. Receives the whole
 * `useSharing` bag so both panels stay wired identically.
 */
const props = defineProps<{ sharing: ReturnType<typeof useSharing> }>()

const {
  grantableUsers,
  grantUserId,
  grantRole,
  grantRoleItems,
  addGrant,
  inviteEmail,
  inviteValid,
  invite,
  busy,
} = props.sharing

const showInvite = ref(false)
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
      <UButton
        icon="i-lucide-user-plus"
        :disabled="grantUserId == null || busy"
        aria-label="Accorder l'accès"
        @click="addGrant"
      />
    </div>

    <UButton
      v-if="!showInvite"
      label="Autoriser un compte Google…"
      icon="i-lucide-user-plus"
      color="neutral"
      variant="link"
      size="xs"
      class="self-start px-0"
      @click="showInvite = true"
    />
    <form
      v-else
      class="flex items-end gap-2"
      @submit.prevent="invite"
    >
      <UFormField
        label="Adresse du compte Google"
        help="Aucun email n'est envoyé : partagez le lien vous-même. L'accès s'appliquera dès sa première connexion Google."
        class="flex-1"
      >
        <UInput
          v-model="inviteEmail"
          type="email"
          placeholder="prenom.nom@gmail.com"
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
    </form>
  </div>
</template>

<script setup lang="ts">
import type { useSharing } from '../composables/useSharing'
import { handleField, IDENTITY_PROVIDER_ITEMS } from '#shared/access'

/**
 * The add-grant form shared by the deck and project sharing panels: pick a known
 * account, or authorize one on the fly by its provider handle (Google email or
 * GitHub username) — the account is pre-selected in the picker, ready to be
 * granted. Receives the whole `useSharing` bag so both panels stay wired
 * identically.
 */
const props = defineProps<{ sharing: ReturnType<typeof useSharing> }>()

const {
  usersReady,
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
// With nobody left to pick, the picker row is noise: explain it and lead with
// the authorize form instead. Gated on usersReady — while loading, the list is
// empty too and the form would pop open on every panel.
const noGrantable = computed(() => usersReady.value && grantableUsers.value.length === 0)
watch(noGrantable, (none) => {
  if (none)
    showInvite.value = true
}, { immediate: true })

const isGoogle = computed(() => inviteProvider.value === 'google')
const field = computed(() => handleField(inviteProvider.value))
</script>

<template>
  <div class="flex flex-col gap-2">
    <template v-if="!noGrantable">
      <UFormField label="Ajouter un accès">
        <USelect
          v-model="grantUserId"
          :items="grantableUsers"
          placeholder="Choisir un compte"
          class="w-full"
        />
      </UFormField>
      <div class="flex items-center gap-2">
        <USelect
          v-model="grantRole"
          :items="grantRoleItems"
          class="flex-1"
          aria-label="Niveau d'accès"
        />
        <USelect
          v-model="grantDays"
          :items="grantDurationItems"
          class="flex-1"
          aria-label="Durée de l'accès"
        />
        <UButton
          icon="i-lucide-user-plus"
          :disabled="grantUserId == null || busy"
          aria-label="Ajouter l'accès"
          @click="addGrant"
        />
      </div>
    </template>
    <p
      v-else
      class="text-sm text-dimmed"
    >
      Tous les comptes connus ont déjà accès. Autorisez-en un nouveau :
    </p>

    <UButton
      v-if="!showInvite"
      label="Autoriser un compte qui ne s'est jamais connecté…"
      icon="i-lucide-user-plus"
      color="neutral"
      variant="subtle"
      size="sm"
      block
      @click="showInvite = true"
    />
    <form
      v-else
      class="flex flex-col gap-1.5"
      @submit.prevent="invite"
    >
      <span class="text-sm font-medium text-default">{{ field.label }}</span>
      <div class="flex items-center gap-2">
        <USelect
          v-model="inviteProvider"
          :items="IDENTITY_PROVIDER_ITEMS"
          class="w-28"
          aria-label="Fournisseur de connexion"
        />
        <UInput
          v-model="inviteHandle"
          :type="isGoogle ? 'email' : 'text'"
          :placeholder="field.placeholder"
          :aria-label="field.label"
          autofocus
          class="flex-1"
        />
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

<script setup lang="ts">
import type { useSharing } from '../composables/useSharing'
import { useAppSession } from '../composables/useAppSession'

/**
 * The add-grant form shared by the deck and project sharing panels. The owner
 * picks a known account, or authorizes one on the fly by its provider handle
 * (Google email or GitHub username), which the picker then pre-selects. Another
 * sharer of a deck types the handle of the account and grants it in one step:
 * the list of accounts stays with the owner. Receives the whole `useSharing` bag
 * so both panels stay wired identically.
 */
const props = defineProps<{ sharing: ReturnType<typeof useSharing> }>()

const { t } = useI18n()
const { user } = useAppSession()

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
  shareByHandle,
  directory,
  termsReady,
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

// The server refuses a sharer their own grant: say so before the request.
const ownHandle = computed(() => !!user.value?.login && inviteHandle.value.trim().toLowerCase() === user.value.login.toLowerCase())
const handleError = computed(() => ownHandle.value ? t('deck.grantForm.ownHandle') : undefined)
</script>

<template>
  <form
    v-if="!directory()"
    class="flex flex-col gap-2"
    @submit.prevent="shareByHandle"
  >
    <HandleField
      v-model:provider="inviteProvider"
      v-model:handle="inviteHandle"
      :error="handleError"
    />
    <GrantTermsRow
      v-model:role="grantRole"
      v-model:days="grantDays"
      :role-items="grantRoleItems"
      :duration-items="grantDurationItems"
      :disabled="!termsReady"
    >
      <UButton
        type="submit"
        :label="t('deck.grantForm.share')"
        :aria-label="t('deck.grantForm.share')"
        icon="i-lucide-user-plus"
        class="shrink-0"
        :ui="{ label: 'max-sm:hidden' }"
        :disabled="!termsReady || !inviteValid || ownHandle || busy"
        :loading="busy"
      />
    </GrantTermsRow>
  </form>

  <div
    v-else
    class="flex flex-col gap-2"
  >
    <template v-if="!noGrantable">
      <UFormField :label="t('deck.grantForm.addGrant')">
        <USelect
          v-model="grantUserId"
          :items="grantableUsers"
          :placeholder="t('deck.grantForm.chooseAccount')"
          class="w-full"
        />
      </UFormField>
      <GrantTermsRow
        v-model:role="grantRole"
        v-model:days="grantDays"
        :role-items="grantRoleItems"
        :duration-items="grantDurationItems"
      >
        <UButton
          icon="i-lucide-user-plus"
          class="shrink-0"
          :disabled="grantUserId == null || busy"
          :aria-label="t('deck.grantForm.submitGrant')"
          @click="addGrant"
        />
      </GrantTermsRow>
    </template>
    <p
      v-else
      class="text-sm text-dimmed"
    >
      {{ t('deck.grantForm.allAccountsGranted') }}
    </p>

    <UButton
      v-if="!showInvite"
      :label="t('deck.grantForm.authorizeNewAccount')"
      icon="i-lucide-user-plus"
      color="neutral"
      variant="subtle"
      size="sm"
      block
      @click="() => { showInvite = true }"
    />
    <form
      v-else
      @submit.prevent="invite"
    >
      <HandleField
        v-model:provider="inviteProvider"
        v-model:handle="inviteHandle"
        autofocus
      >
        <UButton
          type="submit"
          :label="t('deck.grantForm.authorize')"
          icon="i-lucide-user-plus"
          class="shrink-0"
          :disabled="!inviteValid || busy"
          :loading="busy"
        />
      </HandleField>
    </form>
  </div>
</template>

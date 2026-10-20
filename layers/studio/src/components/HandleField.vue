<script setup lang="ts">
import type { IdentityProvider } from '#shared/access'
import { handleField, IDENTITY_PROVIDER_ITEMS } from '#shared/access'

/**
 * An account named by its provider handle: the provider, the Google address or
 * GitHub username, and the reminder that no email is sent. The default slot
 * ends the row, for a button acting on the handle.
 */
defineProps<{ error?: string, autofocus?: boolean }>()

const provider = defineModel<IdentityProvider>('provider', { required: true })
const handle = defineModel<string>('handle', { required: true })

const { t } = useI18n()

const isGoogle = computed(() => provider.value === 'google')
const field = computed(() => handleField(provider.value))
</script>

<template>
  <UFormField
    :label="t(field.labelKey)"
    :error="error"
    :help="t('deck.grantForm.noEmailNotice', { provider: isGoogle ? 'Google' : 'GitHub' })"
  >
    <div class="flex items-center gap-2">
      <USelect
        v-model="provider"
        :items="IDENTITY_PROVIDER_ITEMS"
        class="w-28 shrink-0"
        :aria-label="t('deck.grantForm.provider')"
      />
      <UInput
        v-model="handle"
        :type="isGoogle ? 'email' : 'text'"
        :placeholder="t(field.placeholderKey)"
        :aria-label="t(field.labelKey)"
        :autofocus="autofocus"
        autocomplete="off"
        class="min-w-0 flex-1"
      />
      <slot />
    </div>
  </UFormField>
</template>

<script setup lang="ts">
import type { IdentityProvider } from '#shared/access'
import { handleField, IDENTITY_PROVIDER_ITEMS, isProviderHandle } from '#shared/access'

/**
 * An account named by its provider handle: the provider, the Google address or
 * GitHub username, and the reminder that no email is sent. Until the handle is
 * valid, the help asks for one: the form's button that acts on the handle stays
 * disabled until then. The default slot ends the row, for such a button.
 */
defineProps<{ error?: string, autofocus?: boolean }>()

const provider = defineModel<IdentityProvider>('provider', { required: true })
const handle = defineModel<string>('handle', { required: true })

const { t } = useI18n()

const isGoogle = computed(() => provider.value === 'google')
const field = computed(() => handleField(provider.value))
const help = computed(() => isProviderHandle(provider.value, handle.value)
  ? t('deck.grantForm.noEmailNotice', { provider: isGoogle.value ? 'Google' : 'GitHub' })
  : t(field.value.missingKey))
</script>

<template>
  <UFormField
    :label="t(field.labelKey)"
    :error="error"
    :help="help"
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

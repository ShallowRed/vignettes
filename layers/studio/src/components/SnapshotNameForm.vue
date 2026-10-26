<script setup lang="ts">
// The form that captures a snapshot of the draft, with an optional name.
defineProps<{
  loading?: boolean
  /** Shows a cancel button. */
  cancelable?: boolean
}>()
const emit = defineEmits<{ capture: [name: string], cancel: [] }>()

const { t } = useI18n()
const name = ref('')
</script>

<template>
  <form
    class="flex flex-wrap items-center gap-2"
    @submit.prevent="emit('capture', name)"
  >
    <UInput
      v-model="name"
      :placeholder="t('deck.history.snapshotNamePlaceholder')"
      :aria-label="t('deck.history.snapshotName')"
      class="min-w-48 flex-1"
      size="sm"
      maxlength="80"
      autofocus
    />
    <UButton
      type="submit"
      :label="t('deck.history.capture')"
      icon="i-lucide-camera"
      size="sm"
      :loading="loading"
    />
    <UButton
      v-if="cancelable"
      :label="t('common.actions.cancel')"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="emit('cancel')"
    />
    <slot name="end" />
  </form>
</template>

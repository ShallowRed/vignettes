<script setup lang="ts">
/**
 * The footer of a form modal: cancel, and the submit button. While the form
 * cannot be sent, `blockedReason` says what is missing beside the disabled
 * button, which names it as its description.
 */
const props = defineProps<{
  label: string
  icon?: string
  loading?: boolean
  /** What the form still needs; the button is disabled while it is set. */
  blockedReason?: string
}>()

const emit = defineEmits<{ cancel: [], submit: [] }>()

const { t } = useI18n()
const reasonId = useId()
const blocked = computed(() => Boolean(props.blockedReason) && !props.loading)
</script>

<template>
  <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 w-full">
    <p
      v-if="blocked"
      :id="reasonId"
      class="me-auto text-sm text-muted"
    >
      {{ blockedReason }}
    </p>
    <div class="flex gap-2">
      <UButton
        :label="t('common.actions.cancel')"
        color="neutral"
        variant="ghost"
        @click="emit('cancel')"
      />
      <UButton
        :label="label"
        :icon="icon"
        :loading="loading"
        :disabled="blocked"
        :aria-describedby="blocked ? reasonId : undefined"
        @click="emit('submit')"
      />
    </div>
  </div>
</template>

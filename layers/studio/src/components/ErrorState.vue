<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui'

/**
 * A refusal or a failure, drawn the same way on every screen: an icon, a title,
 * a sentence, the actions, then the way back to the presentations, secondary
 * when another action leads. The slot below holds a detail.
 */
const props = defineProps<{
  icon: string
  title: string
  description?: string
  actions?: ButtonProps[]
  /** Where the way back goes: a link, or a handler on the error page. */
  back: Pick<ButtonProps, 'to' | 'onClick'>
}>()

const { t } = useI18n()

const allActions = computed<ButtonProps[]>(() => {
  const actions = props.actions ?? []
  return [
    ...actions,
    {
      label: t('common.actions.backToDecks'),
      icon: 'i-lucide-arrow-left',
      ...props.back,
      ...(actions.length ? { color: 'neutral' as const, variant: 'subtle' as const } : {}),
    },
  ]
})
</script>

<template>
  <div class="flex flex-col items-center gap-4 text-center">
    <UEmpty
      :icon="icon"
      :title="title"
      :description="description"
      :actions="allActions"
      variant="naked"
      size="lg"
      :ui="{ body: 'max-w-none' }"
    />
    <slot />
  </div>
</template>

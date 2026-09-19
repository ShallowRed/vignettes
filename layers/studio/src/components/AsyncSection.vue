<script setup lang="ts">
// Declarative async-state boundary: one grammar for every data view. Render the
// default slot when the data is ready; otherwise fall through pending → error →
// empty. Each state has a sensible default and a named slot to override:
//   <AsyncSection :status :error :empty="items.length === 0">
//     ...ready content...
//     <template #empty> ...contextual empty... </template>
//   </AsyncSection>
withDefaults(defineProps<{
  /** Matches Pinia Colada / useAsyncData: 'pending' until the first success. */
  status: 'pending' | 'error' | 'success' | 'idle'
  /** Passed to the error slot. */
  error?: { message?: string } | null
  /** Reads the data again; the default error slot shows its button when given. */
  retry?: () => unknown
  /** Ready-but-nothing-to-show: render the empty slot instead of the default. */
  empty?: boolean
  /** Copy for the default empty slot. */
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  error: null,
  retry: undefined,
  empty: false,
  emptyIcon: 'i-lucide-inbox',
  emptyTitle: 'Rien à afficher',
  emptyDescription: undefined,
})
</script>

<template>
  <slot
    v-if="status === 'pending' || status === 'idle'"
    name="pending"
  >
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <USkeleton
        v-for="i in 6"
        :key="i"
        class="h-36 rounded-lg"
      />
    </div>
  </slot>

  <slot
    v-else-if="status === 'error'"
    name="error"
    :error="error"
  >
    <ActionNotice
      tone="critical"
      title="Le chargement a échoué"
      description="Ces données n'ont pas pu être lues. Réessayez dans un instant."
    >
      <UButton
        v-if="retry"
        label="Réessayer"
        icon="i-lucide-rotate-ccw"
        color="neutral"
        variant="subtle"
        @click="() => { retry?.() }"
      />
    </ActionNotice>
  </slot>

  <slot
    v-else-if="empty"
    name="empty"
  >
    <UEmpty
      :icon="emptyIcon"
      :title="emptyTitle"
      :description="emptyDescription"
      variant="naked"
      size="lg"
    />
  </slot>

  <slot v-else />
</template>

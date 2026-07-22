<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'

// Catalog card. `admin` adds management details and actions for privileged viewers.
const props = defineProps<{
  presentation: PresentationListItem
  admin?: boolean
  /** Showcase card: title-first, no status/theme chrome (everything shown is public). */
  minimal?: boolean
}>()

const emit = defineEmits<{
  editMeta: []
  remove: []
}>()

const frozen = computed(() => isFrozen(props.presentation))

const to = computed(() => {
  if (props.admin && props.presentation.published === false && !frozen.value)
    return `/edit/${props.presentation.slug}`
  return deckPath(props.presentation)
})

const statusDisplay = computed(() => STATUS_CONFIG[props.presentation.status])

const adminActions = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Éditer le contenu', icon: 'i-lucide-pencil', to: `/edit/${props.presentation.slug}` },
    { label: 'Métadonnées…', icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta') },
  ],
  [
    {
      label: 'Supprimer…',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => emit('remove'),
    },
  ],
])
</script>

<template>
  <UPageCard
    :to="to"
    variant="outline"
    :ui="{
      root: 'ring-0 border-0 shadow-sm hover:shadow-md hover:bg-accented transition-all duration-200',
      container: 'p-4 sm:p-5',
    }"
  >
    <template #body>
      <!-- Admin actions pinned to the card's top-right corner (z-10 clears the
           stretched-link overlay so the trigger stays clickable). -->
      <div
        v-if="admin && !frozen"
        class="absolute top-2 right-2 z-10"
        @click.stop.prevent
      >
        <UDropdownMenu
          :items="adminActions"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="Actions"
          />
        </UDropdownMenu>
      </div>

      <div class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <h2
            class="font-semibold text-highlighted leading-snug line-clamp-2"
            :class="{ 'pr-6': admin && !frozen }"
          >
            {{ presentation.title }}
          </h2>
          <UIcon
            v-if="!(admin && !frozen)"
            name="i-lucide-arrow-up-right"
            class="shrink-0 size-4 text-dimmed mt-0.5"
          />
        </div>

        <!-- Taxonomies stripped to plain text (clean base): no colour, no icon. -->
        <div
          v-if="frozen || !minimal"
          class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted"
        >
          <span v-if="frozen">{{ presentation.lifecycle === 'archived' ? 'Archivée' : 'Gelée' }}</span>
          <span v-else-if="!minimal && statusDisplay && presentation.status !== 'public'">{{ statusDisplay.label }}</span>
          <span v-if="!minimal && presentation.unlisted">Unlisted</span>
          <span v-if="!minimal && admin && presentation.published === false">Non publié</span>
          <span v-if="!minimal">{{ presentation.theme }}</span>
        </div>

        <p
          v-if="admin && !minimal"
          class="text-xs text-muted font-mono"
        >
          {{ presentation.filename }}
        </p>
      </div>
    </template>
  </UPageCard>
</template>

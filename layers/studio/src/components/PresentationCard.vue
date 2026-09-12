<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'
import { useAppSession } from '../composables/useAppSession'

// Catalog card. `admin` adds management details and the actions menu (privileged
// roles only). Editing is separate: it follows the deck's own `canEdit`, so a
// collaborator holding an `editor` grant gets the pencil without the rest.
const props = defineProps<{
  presentation: PresentationListItem
  admin?: boolean
  /** Showcase card: title-first, no status/theme chrome (everything shown is public). */
  minimal?: boolean
}>()

const emit = defineEmits<{
  editMeta: []
  share: []
  remove: []
}>()

// Sharing is owner-only server-side, so the entry only shows for an owner.
const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

const frozen = computed(() => isFrozen(props.presentation))

// A frozen deck is read-only whatever the role.
const canEdit = computed(() => !frozen.value && (props.admin === true || props.presentation.canEdit === true))
const hasMenu = computed(() => props.admin === true && !frozen.value)
const hasActions = computed(() => canEdit.value || hasMenu.value)

const to = computed(() => {
  // Nothing to show yet: send whoever may edit it straight to the editor.
  if (canEdit.value && props.presentation.published === false)
    return `/edit/${props.presentation.slug}`
  return deckPath(props.presentation)
})

const statusDisplay = computed(() => STATUS_CONFIG[props.presentation.status])

const adminActions = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Éditer le contenu', icon: 'i-lucide-pencil', to: `/edit/${props.presentation.slug}` },
    { label: 'Métadonnées…', icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta') },
    ...(isOwner.value ? [{ label: 'Partager…', icon: 'i-lucide-users', onSelect: () => emit('share') }] : []),
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
        v-if="hasActions"
        class="absolute top-2 right-2 z-10 flex items-center gap-0.5"
        @click.stop.prevent
      >
        <UTooltip
          v-if="canEdit"
          text="Éditer le contenu"
        >
          <UButton
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            size="xs"
            :to="`/edit/${presentation.slug}`"
            aria-label="Éditer le contenu"
          />
        </UTooltip>
        <UDropdownMenu
          v-if="hasMenu"
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
            :class="hasActions ? (canEdit && hasMenu ? 'pr-14' : 'pr-8') : ''"
          >
            {{ presentation.title }}
          </h2>
          <UIcon
            v-if="!hasActions"
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
          <span v-if="!minimal && presentation.unlisted">Non répertoriée</span>
          <span v-if="!minimal && admin && presentation.published === false">Non publié</span>
          <span
            v-if="!minimal && canEdit && presentation.unpublishedChanges"
            class="text-warning"
          >Modifications non publiées</span>
          <span
            v-if="!minimal && admin && presentation.sharedCount"
            class="inline-flex items-center gap-0.5"
            :title="`${presentation.sharedCount} accès partagé${presentation.sharedCount > 1 ? 's' : ''}`"
          >
            <UIcon
              name="i-lucide-users"
              class="size-3"
            />
            {{ presentation.sharedCount }}
          </span>
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

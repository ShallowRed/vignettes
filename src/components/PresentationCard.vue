<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { DropdownMenuItem } from '@nuxt/ui'
import { deckPath, isFrozen, STATUS_CONFIG } from '#shared/presentations'

// Catalog card. `admin` adds management details and actions for privileged viewers.
const props = defineProps<{
  presentation: PresentationListItem
  admin?: boolean
}>()

const emit = defineEmits<{
  editMeta: []
  remove: []
}>()

const frozen = computed(() => isFrozen(props.presentation))

const to = computed(() => deckPath(props.presentation))

const statusDisplay = computed(() => STATUS_CONFIG[props.presentation.status])

const adminActions = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Éditer le contenu', icon: 'i-lucide-pencil', to: `/edit/${props.presentation.slug}` },
    { label: 'Métadonnées…', icon: 'i-lucide-settings-2', onSelect: () => emit('editMeta') },
  ],
  [
    {
      label: props.presentation.fileBacked ? 'Réinitialiser depuis le fichier…' : 'Supprimer…',
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
    variant="subtle"
    :ui="{ container: 'p-4 sm:p-5' }"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <h2 class="font-semibold text-highlighted leading-snug line-clamp-2">
            {{ presentation.title }}
          </h2>
          <div
            v-if="admin && !frozen"
            class="shrink-0 -mt-1 -mr-1"
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
          <UIcon
            v-else
            name="i-lucide-arrow-up-right"
            class="shrink-0 size-4 text-dimmed mt-0.5"
          />
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <UTooltip
            v-if="frozen"
            text="Instantané autoportant : contenu figé, non éditable en direct"
          >
            <UBadge
              color="info"
              variant="subtle"
              size="sm"
              icon="i-lucide-snowflake"
              :label="presentation.lifecycle === 'archived' ? 'Archivée' : 'Gelée'"
            />
          </UTooltip>
          <UBadge
            v-else
            :color="statusDisplay?.color || 'neutral'"
            variant="subtle"
            size="sm"
            :icon="statusDisplay?.icon || 'i-lucide-file'"
            :label="statusDisplay?.label || presentation.status"
          />

          <UBadge
            v-if="presentation.unlisted"
            color="neutral"
            variant="subtle"
            size="sm"
            icon="i-lucide-eye-off"
            label="Unlisted"
          />

          <UTooltip
            v-if="admin && presentation.published === false && !presentation.fileBacked"
            text="Aucune version publiée : le deck n'est pas encore servable"
          >
            <UBadge
              color="warning"
              variant="subtle"
              size="sm"
              icon="i-lucide-cloud-off"
              label="Non publié"
            />
          </UTooltip>

          <UBadge
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-palette"
            :label="presentation.theme"
          />
        </div>

        <p
          v-if="admin"
          class="text-xs text-muted font-mono flex items-center gap-1.5"
        >
          <UIcon
            name="i-lucide-file-text"
            class="size-3.5"
          />
          {{ presentation.filename }}
        </p>
      </div>
    </template>
  </UPageCard>
</template>

<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import { STATUS_CONFIG } from '#shared/presentations'

// Catalog card. `admin` adds management details for privileged viewers.
const props = defineProps<{
  presentation: PresentationListItem
  admin?: boolean
}>()

const frozen = computed(() =>
  props.presentation.lifecycle === 'frozen' || props.presentation.lifecycle === 'archived')

const to = computed(() =>
  props.presentation.alias
    ? `/p/${props.presentation.alias}`
    : `/slides/${props.presentation.slug}`)

const statusDisplay = computed(() => STATUS_CONFIG[props.presentation.status])
</script>

<template>
  <UPageCard
    :to="to"
    variant="outline"
    :ui="{ container: 'p-4 sm:p-5' }"
  >
    <template #body>
      <div class="flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <h2 class="font-semibold text-highlighted leading-snug line-clamp-2">
            {{ presentation.title }}
          </h2>
          <UIcon
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

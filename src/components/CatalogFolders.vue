<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { buildCatalogFolders } from '#shared/presentations'
import { projectColorStyle } from '~/utils/project-colors'

// Projects rendered as folders: the catalog's primary entry point. The folder
// set is derived (pure view-model) from the access-filtered decks plus the
// visible projects — the server already decides which projects an actor may see,
// so an empty folder only reaches privileged actors (e.g. a project just created,
// before it has any deck). Each links to its stable /projects/<slug> route.
const props = defineProps<{
  items: PresentationListItem[]
  projects?: Project[]
}>()

const folders = computed(() => buildCatalogFolders(props.items, props.projects ?? []))
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <UPageCard
      v-for="folder in folders"
      :key="folder.routeSlug"
      :to="`/projects/${folder.routeSlug}`"
      variant="outline"
      :ui="{
        root: 'ring-0 border-0 shadow-sm hover:shadow-md hover:bg-accented transition-all duration-200',
        container: 'p-4 sm:p-5',
      }"
    >
      <template #body>
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-folder"
            class="size-6 shrink-0 mt-0.5 text-dimmed"
            :style="projectColorStyle(folder.color)"
          />
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted leading-snug">
              {{ folder.title }}
            </h2>
            <p class="text-xs text-muted mt-1">
              {{ folder.count }} présentation{{ folder.count > 1 ? 's' : '' }}
              <template v-if="folder.themes.length">
                · {{ folder.themes.join(', ') }}
              </template>
            </p>
          </div>
        </div>
      </template>
    </UPageCard>
  </div>
</template>

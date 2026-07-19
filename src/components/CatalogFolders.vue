<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { groupByProject, UNGROUPED_PROJECT } from '#shared/presentations'

// Projects rendered as folders: the catalog's primary entry point. Each folder
// links to its stable /projects/<slug> route. The no-project bucket routes to
// the reserved `divers` slug.
const props = defineProps<{
  items: PresentationListItem[]
  projects?: Project[]
}>()

const projectOrder = computed(() => (props.projects ?? []).map(p => p.slug))
const meta = computed(() => new Map((props.projects ?? []).map(p => [p.slug, p])))

const folders = computed(() =>
  groupByProject(props.items, projectOrder.value).map((group) => {
    const ungrouped = group.project === UNGROUPED_PROJECT
    return {
      routeSlug: ungrouped ? 'divers' : group.project,
      title: ungrouped ? 'Divers' : (meta.value.get(group.project)?.title ?? group.project),
      count: group.items.length,
      themes: [...new Set(group.items.map(i => i.theme).filter(Boolean))] as string[],
    }
  }),
)
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
            class="size-6 text-dimmed shrink-0 mt-0.5"
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

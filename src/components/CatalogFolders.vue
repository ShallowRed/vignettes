<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { UNGROUPED_PROJECT } from '#shared/presentations'
import { projectColorStyle } from '~/utils/project-colors'

// Projects rendered as folders: the catalog's primary entry point. Every project
// gets a folder — including empty ones just created (so a new project is visible
// before it has any deck). Each links to its stable /projects/<slug> route; the
// no-project bucket routes to the reserved `divers` slug.
const props = defineProps<{
  items: PresentationListItem[]
  projects?: Project[]
}>()

const meta = computed(() => new Map((props.projects ?? []).map(p => [p.slug, p])))

// decks grouped by their project key (or the ungrouped bucket).
const buckets = computed(() => {
  const map = new Map<string, PresentationListItem[]>()
  for (const item of props.items) {
    const key = item.project ?? UNGROUPED_PROJECT
    if (!map.has(key))
      map.set(key, [])
    map.get(key)!.push(item)
  }
  return map
})

function themesOf(items: PresentationListItem[]): string[] {
  return [...new Set(items.map(i => i.theme).filter(Boolean))] as string[]
}

const folders = computed(() => {
  const named = (props.projects ?? []).map(p => p.slug)
  // Decks pointing at a project not in the list (legacy free-text) still get a folder.
  const orphan = [...buckets.value.keys()].filter(k => k !== UNGROUPED_PROJECT && !named.includes(k))
  const out = [...named, ...orphan].map((slug) => {
    const items = buckets.value.get(slug) ?? []
    return {
      routeSlug: slug,
      title: meta.value.get(slug)?.title ?? slug,
      count: items.length,
      color: meta.value.get(slug)?.color ?? null,
      themes: themesOf(items),
    }
  })

  const ungrouped = buckets.value.get(UNGROUPED_PROJECT) ?? []
  if (ungrouped.length) {
    out.push({ routeSlug: 'divers', title: 'Divers', count: ungrouped.length, color: null, themes: themesOf(ungrouped) })
  }
  return out
})
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

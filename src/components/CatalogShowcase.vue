<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { groupByProject, UNGROUPED_PROJECT } from '#shared/presentations'

/**
 * Public showcase: the visitor-facing catalog. Everything here is `public`
 * (the API's canList hides the rest), so it drops all access/management chrome
 * and leans on grouping: featured decks pinned on top, then a section per project.
 */
const props = defineProps<{
  items: PresentationListItem[]
  projects?: Project[]
}>()

const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q)
    return props.items
  return props.items.filter(i =>
    i.title.toLowerCase().includes(q) || (i.theme ?? '').toLowerCase().includes(q))
})

// Featured decks are highlighted once, on top — not repeated in their project group.
const featured = computed(() => filtered.value.filter(i => i.featured))
const rest = computed(() => filtered.value.filter(i => !i.featured))

const projectOrder = computed(() => (props.projects ?? []).map(p => p.slug))
const groups = computed(() => groupByProject(rest.value, projectOrder.value))

const projectMeta = computed(() => new Map(
  (props.projects ?? []).map(p => [p.slug, { title: p.title ?? p.slug, color: p.color }]),
))

function groupTitle(project: string) {
  return project === UNGROUPED_PROJECT ? 'Autres présentations' : (projectMeta.value.get(project)?.title ?? project)
}
function groupColor(project: string) {
  return project === UNGROUPED_PROJECT ? undefined : projectMeta.value.get(project)?.color
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Rechercher une présentation…"
      size="lg"
      class="w-full"
    />

    <UEmpty
      v-if="filtered.length === 0"
      icon="i-lucide-search-x"
      title="Aucune présentation"
      :description="search ? 'Aucun résultat pour cette recherche.' : 'Rien à afficher pour le moment.'"
      variant="naked"
    />

    <template v-else>
      <section
        v-if="featured.length > 0"
        class="flex flex-col gap-4"
      >
        <div class="flex items-center gap-2">
          <UIcon
            name="i-lucide-star"
            class="size-4 text-primary"
          />
          <h2 class="text-sm font-semibold text-highlighted uppercase tracking-wide">
            À la une
          </h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <PresentationCard
            v-for="deck in featured"
            :key="deck.slug"
            :presentation="deck"
            minimal
          />
        </div>
      </section>

      <section
        v-for="group in groups"
        :key="group.project"
        class="flex flex-col gap-4"
      >
        <div class="flex items-center gap-2">
          <span
            v-if="groupColor(group.project)"
            class="size-2.5 rounded-full shrink-0"
            :style="{ backgroundColor: groupColor(group.project) }"
          />
          <h2 class="text-sm font-semibold text-highlighted uppercase tracking-wide">
            {{ groupTitle(group.project) }}
          </h2>
          <span class="text-xs text-dimmed">{{ group.items.length }}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <PresentationCard
            v-for="deck in group.items"
            :key="deck.slug"
            :presentation="deck"
            minimal
          />
        </div>
      </section>
    </template>
  </div>
</template>

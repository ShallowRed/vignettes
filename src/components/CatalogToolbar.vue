<script setup lang="ts">
import type { PublicationStatus } from '#shared/access'
import type { CatalogQuery, PresentationListItem, SortKey } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { PUBLICATION_STATUSES } from '#shared/access'
import { countByStatus, STATUS_CONFIG, UNGROUPED_PROJECT } from '#shared/presentations'

// Catalog controls: edits a CatalogQuery via v-model; the page applies the filtering.
const props = defineProps<{
  items: PresentationListItem[]
  showStatusFilter?: boolean
  projects?: Project[]
}>()

const query = defineModel<CatalogQuery>({ required: true })

const counts = computed(() => countByStatus(props.items))

const search = computed({
  get: () => query.value.search ?? '',
  set: (value: string) => { query.value = { ...query.value, search: value } },
})

const sortKey = computed({
  get: () => query.value.sortKey ?? 'title',
  set: (value: SortKey) => { query.value = { ...query.value, sortKey: value } },
})

const sortOptions: { label: string, value: SortKey }[] = [
  { label: 'Titre', value: 'title' },
  { label: 'Statut', value: 'status' },
  { label: 'Thème', value: 'theme' },
]

function toggleDir() {
  query.value = { ...query.value, sortDir: query.value.sortDir === 'desc' ? 'asc' : 'desc' }
}

function toggleStatus(status: PublicationStatus) {
  const current = query.value.statuses ?? []
  query.value = {
    ...query.value,
    statuses: current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status],
  }
}

function isActive(status: PublicationStatus) {
  return query.value.statuses?.includes(status) ?? false
}

// Chips for every project slug present, ordered by the registry, plus an "ungrouped" chip.
const projectChips = computed(() => {
  const present = new Map<string, number>()
  let ungrouped = 0
  for (const item of props.items) {
    if (item.project)
      present.set(item.project, (present.get(item.project) ?? 0) + 1)
    else
      ungrouped++
  }
  const order = (props.projects ?? []).map(p => p.slug)
  const titleOf = new Map((props.projects ?? []).map(p => [p.slug, p.title ?? p.slug]))
  const colorOf = new Map((props.projects ?? []).map(p => [p.slug, p.color]))

  const slugs = [...present.keys()].sort((a, b) => {
    const ra = order.indexOf(a)
    const rb = order.indexOf(b)
    if (ra !== rb)
      return (ra < 0 ? Infinity : ra) - (rb < 0 ? Infinity : rb)
    return a.localeCompare(b)
  })

  const chips = slugs.map(slug => ({
    value: slug,
    label: titleOf.get(slug) ?? slug,
    color: colorOf.get(slug),
    count: present.get(slug)!,
  }))
  if (ungrouped > 0)
    chips.push({ value: UNGROUPED_PROJECT, label: 'Sans projet', color: undefined, count: ungrouped })
  return chips
})

const showProjectFilter = computed(() => projectChips.value.length > 1)

function toggleProject(value: string) {
  const current = query.value.projects ?? []
  query.value = {
    ...query.value,
    projects: current.includes(value)
      ? current.filter(p => p !== value)
      : [...current, value],
  }
}

function isProjectActive(value: string) {
  return query.value.projects?.includes(value) ?? false
}
</script>

<template>
  <div class="flex flex-col gap-4 mb-8">
    <div class="flex flex-wrap gap-2 items-center">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Rechercher (titre, slug, thème)…"
        class="flex-1 min-w-56"
      />

      <USelect
        v-model="sortKey"
        :items="sortOptions"
        icon="i-lucide-arrow-down-up"
        aria-label="Trier par"
        class="w-36"
      />
      <UTooltip :text="query.sortDir === 'desc' ? 'Décroissant' : 'Croissant'">
        <UButton
          :icon="query.sortDir === 'desc' ? 'i-lucide-arrow-down-wide-narrow' : 'i-lucide-arrow-up-narrow-wide'"
          color="neutral"
          variant="outline"
          @click="toggleDir"
        />
      </UTooltip>
    </div>

    <div
      v-if="showStatusFilter"
      class="flex flex-wrap gap-2"
    >
      <UButton
        v-for="status in PUBLICATION_STATUSES"
        :key="status"
        size="xs"
        :color="isActive(status) ? STATUS_CONFIG[status].color : 'neutral'"
        :variant="isActive(status) ? 'soft' : 'outline'"
        :icon="STATUS_CONFIG[status].icon"
        class="rounded-full"
        @click="toggleStatus(status)"
      >
        {{ STATUS_CONFIG[status].label }}
        <span class="opacity-60 tabular-nums">{{ counts[status] }}</span>
      </UButton>
    </div>

    <div
      v-if="showProjectFilter"
      class="flex flex-wrap gap-2"
    >
      <UButton
        v-for="chip in projectChips"
        :key="chip.value"
        size="xs"
        color="neutral"
        :variant="isProjectActive(chip.value) ? 'soft' : 'outline'"
        icon="i-lucide-folder"
        class="rounded-full"
        @click="toggleProject(chip.value)"
      >
        <span
          v-if="chip.color"
          class="size-2 rounded-full"
          :style="{ backgroundColor: chip.color }"
        />
        {{ chip.label }}
        <span class="opacity-60 tabular-nums">{{ chip.count }}</span>
      </UButton>
    </div>
  </div>
</template>

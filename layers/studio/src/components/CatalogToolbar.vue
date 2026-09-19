<script setup lang="ts">
import type { PublicationStatus } from '#shared/access'
import type { CatalogQuery, PresentationListItem, SortKey } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { DropdownMenuItem } from '@nuxt/ui'
import { PUBLICATION_STATUSES } from '#shared/access'
import { countByStatus, STATUS_CONFIG, UNGROUPED_PROJECT } from '#shared/presentations'

// Catalog controls: edits a CatalogQuery via v-model; the page applies the filtering.
// `showSort` off when the active view sorts itself (table columns).
const props = withDefaults(defineProps<{
  items: PresentationListItem[]
  showStatusFilter?: boolean
  showSort?: boolean
  projects?: Project[]
}>(), {
  showSort: true,
})

const { t } = useI18n()

const searchInput = useTemplateRef<{ inputRef?: HTMLInputElement }>('searchInput')

defineExpose({
  focusSearch: () => searchInput.value?.inputRef?.focus(),
})

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

// Theme is a project-coupled attribute, not a browsing axis — no theme sort/filter.
const sortOptions: { label: string, value: SortKey }[] = [
  { label: 'Titre', value: 'title' },
  { label: 'Statut', value: 'status' },
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

// Status filter folded into a checkbox dropdown; `onSelect.preventDefault` keeps it open.
const statusMenuItems = computed<DropdownMenuItem[]>(() =>
  PUBLICATION_STATUSES.map(status => ({
    label: `${t(STATUS_CONFIG[status].labelKey)} (${counts.value[status]})`,
    type: 'checkbox' as const,
    checked: isActive(status),
    onUpdateChecked: () => toggleStatus(status),
    onSelect: (e: Event) => e.preventDefault(),
  })))

const activeStatusCount = computed(() => query.value.statuses?.length ?? 0)

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

const projectMenuItems = computed<DropdownMenuItem[]>(() =>
  projectChips.value.map(chip => ({
    label: `${chip.label} (${chip.count})`,
    type: 'checkbox' as const,
    checked: isProjectActive(chip.value),
    onUpdateChecked: () => toggleProject(chip.value),
    onSelect: (e: Event) => e.preventDefault(),
  })))

const activeProjectCount = computed(() => query.value.projects?.length ?? 0)

const hasActiveFilters = computed(() =>
  activeStatusCount.value > 0 || activeProjectCount.value > 0)

function clearFilters() {
  query.value = { ...query.value, statuses: [], projects: [] }
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <UInput
      ref="searchInput"
      v-model="search"
      icon="i-lucide-search"
      placeholder="Rechercher…"
      class="flex-1 min-w-48"
    >
      <template #trailing>
        <UKbd value="/" />
      </template>
    </UInput>

    <!-- Filters folded into compact checkbox dropdowns; active count shown in the trigger. -->
    <UDropdownMenu
      v-if="showStatusFilter"
      :items="statusMenuItems"
      :content="{ align: 'start' }"
    >
      <UButton
        :label="activeStatusCount ? `Statut · ${activeStatusCount}` : 'Statut'"
        icon="i-lucide-list-filter"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        :variant="activeStatusCount ? 'subtle' : 'outline'"
      />
    </UDropdownMenu>

    <UDropdownMenu
      v-if="showProjectFilter"
      :items="projectMenuItems"
      :content="{ align: 'start' }"
    >
      <UButton
        :label="activeProjectCount ? `Projet · ${activeProjectCount}` : 'Projet'"
        icon="i-lucide-folder"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        :variant="activeProjectCount ? 'subtle' : 'outline'"
      />
    </UDropdownMenu>

    <UButton
      v-if="hasActiveFilters"
      label="Effacer"
      icon="i-lucide-filter-x"
      color="neutral"
      variant="ghost"
      @click="clearFilters"
    />

    <template v-if="showSort">
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
    </template>

    <slot name="trailing" />
  </div>
</template>

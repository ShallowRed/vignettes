<script setup lang="ts">
import type { CatalogQuery, PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { applyCatalogQuery } from '#shared/presentations'
import { useAppSession } from '~/composables/useAppSession'

// Single catalog for every role: the API already scopes visibility to the actor
// (drafts/private appear only for privileged sessions); `privileged` only toggles
// management details on the cards/table.
const { privileged } = useAppSession()

const { data: presentations, status, error, refresh } = await useAsyncData(
  'presentations',
  () => $fetch<PresentationListItem[]>('/api/presentations'),
  { default: () => [] },
)

const { data: projects } = await useAsyncData(
  'projects',
  () => $fetch<Project[]>('/api/projects'),
  { default: () => [] },
)

// The prerendered payload is the anonymous catalog; once the session resolves
// client-side, refetch so privileged users see their full list.
watch(privileged, (now, before) => {
  if (now && !before)
    refresh()
})

const query = ref<CatalogQuery>({ search: '', statuses: [], projects: [], sortKey: 'title', sortDir: 'asc' })

const visible = computed(() => applyCatalogQuery(presentations.value, query.value))

const hasActiveFilters = computed(() =>
  Boolean(query.value.search)
  || (query.value.statuses?.length ?? 0) > 0
  || (query.value.projects?.length ?? 0) > 0)

function resetFilters() {
  query.value = { ...query.value, search: '', statuses: [], projects: [] }
}

// View mode, persisted client-side (the page is prerendered: default on SSR,
// stored preference applied after hydration).
const VIEW_KEY = 'nuxt-slides:catalog-view'
const view = ref<'cards' | 'table'>('cards')

onMounted(() => {
  const stored = localStorage.getItem(VIEW_KEY)
  if (stored === 'table' || stored === 'cards')
    view.value = stored
})

watch(view, v => localStorage.setItem(VIEW_KEY, v))

const toolbar = useTemplateRef('toolbar')

defineShortcuts({
  '/': () => toolbar.value?.focusSearch(),
})
</script>

<template>
  <div>
    <CatalogState
      v-if="status === 'pending'"
      state="pending"
    />
    <CatalogState
      v-else-if="error"
      state="error"
      :message="error.message"
    />
    <CatalogState
      v-else-if="presentations.length === 0"
      state="empty"
    />

    <template v-else>
      <CatalogToolbar
        ref="toolbar"
        v-model="query"
        :items="presentations"
        :projects="projects"
        show-status-filter
        :show-sort="view === 'cards'"
      >
        <template #trailing>
          <UFieldGroup>
            <UTooltip text="Vue cartes">
              <UButton
                icon="i-lucide-layout-grid"
                color="neutral"
                :variant="view === 'cards' ? 'subtle' : 'outline'"
                aria-label="Vue cartes"
                @click="view = 'cards'"
              />
            </UTooltip>
            <UTooltip text="Vue table">
              <UButton
                icon="i-lucide-table-2"
                color="neutral"
                :variant="view === 'table' ? 'subtle' : 'outline'"
                aria-label="Vue table"
                @click="view = 'table'"
              />
            </UTooltip>
          </UFieldGroup>
        </template>
      </CatalogToolbar>

      <p class="text-sm text-muted mb-4 -mt-4">
        {{ visible.length === presentations.length
          ? `${presentations.length} présentation${presentations.length > 1 ? 's' : ''}`
          : `${visible.length} sur ${presentations.length} présentations` }}
      </p>

      <UEmpty
        v-if="visible.length === 0"
        icon="i-lucide-search-x"
        title="Aucun résultat"
        description="Aucune présentation ne correspond à vos critères."
        variant="naked"
        :actions="hasActiveFilters
          ? [{ label: 'Réinitialiser les filtres', icon: 'i-lucide-filter-x', color: 'neutral', variant: 'subtle', onClick: resetFilters }]
          : []"
      />

      <CatalogTable
        v-else-if="view === 'table'"
        :items="visible"
        :admin="privileged"
        :projects="projects"
      />

      <div
        v-else
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        <PresentationCard
          v-for="presentation in visible"
          :key="presentation.slug"
          :presentation="presentation"
          :admin="privileged"
        />
      </div>
    </template>
  </div>
</template>

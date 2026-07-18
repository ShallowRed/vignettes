<script setup lang="ts">
import type { CatalogQuery, PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { applyCatalogQuery } from '#shared/presentations'
import { useAppSession } from '~/composables/useAppSession'

// Single catalog for every role: the API already scopes visibility to the actor
// (drafts/private appear only for privileged sessions); `privileged` only toggles
// management details on the cards/table.
const { privileged } = useAppSession()

// useRequestFetch: an SSR pass must re-emit the session cookie so a logged-in
// navigation gets its scoped catalog server-side (prerender stays anonymous and
// relies on the privileged refresh below).
const requestFetch = useRequestFetch()
const { data: presentations, status, error, refresh } = await useAsyncData(
  'presentations',
  () => requestFetch<PresentationListItem[]>('/api/presentations'),
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

function setView(v: 'cards' | 'table') {
  view.value = v
}

const toolbar = useTemplateRef('toolbar')

defineShortcuts({
  '/': () => toolbar.value?.focusSearch(),
})

// Management modals (privileged): one instance at page level, targeted per deck.
const createOpen = ref(false)
const metaOpen = ref(false)
const deleteOpen = ref(false)
const target = ref<PresentationListItem | null>(null)

function openCreate() {
  createOpen.value = true
}

function openMeta(item: PresentationListItem) {
  target.value = item
  metaOpen.value = true
}

function openDelete(item: PresentationListItem) {
  target.value = item
  deleteOpen.value = true
}
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
    <template v-else-if="presentations.length === 0">
      <CatalogState state="empty" />
      <div
        v-if="privileged"
        class="flex justify-center mt-4"
      >
        <UButton
          icon="i-lucide-file-plus-2"
          label="Nouvelle présentation"
          @click="openCreate"
        />
      </div>
    </template>

    <!-- Visitors get the public showcase: grouped, featured-first, no management chrome. -->
    <CatalogShowcase
      v-else-if="!privileged"
      :items="presentations"
      :projects="projects"
    />

    <!-- Privileged: the full management console (filters, table, actions). -->
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
          <UButton
            v-if="privileged"
            icon="i-lucide-file-plus-2"
            label="Nouvelle présentation"
            @click="openCreate"
          />
          <UFieldGroup>
            <UTooltip text="Vue cartes">
              <UButton
                icon="i-lucide-layout-grid"
                color="neutral"
                :variant="view === 'cards' ? 'subtle' : 'outline'"
                aria-label="Vue cartes"
                @click="setView('cards')"
              />
            </UTooltip>
            <UTooltip text="Vue table">
              <UButton
                icon="i-lucide-table-2"
                color="neutral"
                :variant="view === 'table' ? 'subtle' : 'outline'"
                aria-label="Vue table"
                @click="setView('table')"
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
        @edit-meta="openMeta"
        @remove="openDelete"
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
          @edit-meta="openMeta(presentation)"
          @remove="openDelete(presentation)"
        />
      </div>
    </template>

    <DeckCreateModal
      v-model:open="createOpen"
      :projects="projects"
    />
    <DeckMetaSlideover
      v-if="target"
      v-model:open="metaOpen"
      :item="target"
      :projects="projects"
      @saved="refresh"
    />
    <DeckDeleteModal
      v-if="target"
      v-model:open="deleteOpen"
      :item="target"
      @deleted="refresh"
    />
  </div>
</template>

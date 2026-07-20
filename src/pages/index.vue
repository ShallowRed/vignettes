<script setup lang="ts">
import type { CatalogQuery, PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { applyCatalogQuery } from '#shared/presentations'
import { useAppSession } from '~/composables/useAppSession'

// Catalog home. Everyone lands on the project folders (the primary entry point);
// privileged users can flip to the flat management console for cross-project work.
const { privileged } = useAppSession()

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()
// Session-dependent catalog: keep the SSR payload during hydration (else the
// client discards it and flashes the empty state — a mismatch), but never reuse
// it on later client navigation (that is how a stale anonymous listing came
// back when returning to this page). `watch(privileged)` refetches on login.
function sessionScopedCache(key: string) {
  return nuxtApp.isHydrating ? nuxtApp.payload.data[key] : undefined
}

const { data: presentations, status, error, refresh } = await useAsyncData(
  'presentations',
  () => requestFetch<PresentationListItem[]>('/api/presentations'),
  { default: () => [], getCachedData: sessionScopedCache },
)

const { data: projects, refresh: refreshProjects } = await useAsyncData(
  'projects',
  () => $fetch<Project[]>('/api/projects'),
  { default: () => [], getCachedData: sessionScopedCache },
)

async function onProjectCreated(project: Project) {
  await refreshProjects()
  await navigateTo(`/projects/${project.slug}`)
}

watch(privileged, (now, before) => {
  if (now && !before)
    refresh()
})

// folders = browse by project (default); manage = flat table/grid (admin only).
const mode = ref<'folders' | 'manage'>('folders')

// ── Management console state (only used in `manage` mode) ───────────────────
const query = ref<CatalogQuery>({ search: '', statuses: [], projects: [], sortKey: 'title', sortDir: 'asc' })
const visible = computed(() => applyCatalogQuery(presentations.value, query.value))

const hasActiveFilters = computed(() =>
  Boolean(query.value.search)
  || (query.value.statuses?.length ?? 0) > 0
  || (query.value.projects?.length ?? 0) > 0)

function resetFilters() {
  query.value = { ...query.value, search: '', statuses: [], projects: [] }
}

const toolbar = useTemplateRef('toolbar')
defineShortcuts({
  '/': () => mode.value === 'manage' && toolbar.value?.focusSearch(),
})

// Management modals (privileged): one instance at page level, targeted per deck.
const createOpen = ref(false)
const createProjectOpen = ref(false)
const metaOpen = ref(false)
const deleteOpen = ref(false)
const target = ref<PresentationListItem | null>(null)

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
        class="flex justify-center gap-2 mt-4"
      >
        <UButton
          icon="i-lucide-folder-plus"
          label="Nouveau dossier"
          color="neutral"
          variant="subtle"
          @click="createProjectOpen = true"
        />
        <UButton
          icon="i-lucide-file-plus-2"
          label="Nouvelle présentation"
          @click="createOpen = true"
        />
      </div>
    </template>

    <template v-else>
      <!-- Admin header: mode switch + (management search inline) + create.
           Inlining the toolbar between the switch and the create button saves a row. -->
      <div
        v-if="privileged"
        class="flex flex-wrap items-center gap-3 mb-6"
      >
        <div class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-elevated p-1 ring ring-default">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="mode === 'folders' ? 'bg-primary text-inverted shadow-sm' : 'text-muted hover:text-highlighted'"
            @click="mode = 'folders'"
          >
            <UIcon
              name="i-lucide-folder"
              class="size-4"
            />
            Dossiers
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            :class="mode === 'manage' ? 'bg-primary text-inverted shadow-sm' : 'text-muted hover:text-highlighted'"
            @click="mode = 'manage'"
          >
            <UIcon
              name="i-lucide-table-2"
              class="size-4"
            />
            Gestion
          </button>
        </div>

        <CatalogToolbar
          v-if="mode === 'manage'"
          ref="toolbar"
          v-model="query"
          :items="presentations"
          :projects="projects"
          show-status-filter
          :show-sort="false"
          class="flex-1 min-w-64"
        />
        <div
          v-else
          class="flex-1"
        />

        <UButton
          icon="i-lucide-folder-plus"
          label="Nouveau dossier"
          color="neutral"
          variant="subtle"
          class="shrink-0"
          @click="createProjectOpen = true"
        />
        <UButton
          icon="i-lucide-file-plus-2"
          label="Nouvelle présentation"
          class="shrink-0"
          @click="createOpen = true"
        />
      </div>

      <!-- Folders: the default entry point for everyone. -->
      <CatalogFolders
        v-if="!privileged || mode === 'folders'"
        :items="presentations"
        :projects="projects"
      />

      <!-- Management console (admin): flat, cross-project. -->
      <template v-else>
        <p class="text-sm text-muted mb-4">
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
          v-else
          :items="visible"
          :admin="privileged"
          :projects="projects"
          @edit-meta="openMeta"
          @remove="openDelete"
        />
      </template>
    </template>

    <DeckCreateModal
      v-model:open="createOpen"
      :projects="projects"
    />
    <ProjectCreateModal
      v-model:open="createProjectOpen"
      @created="onProjectCreated"
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

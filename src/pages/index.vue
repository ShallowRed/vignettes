<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { useAppSession } from '~/composables/useAppSession'
import { useCatalog } from '~/composables/useCatalog'
import { useCatalogFilters } from '~/composables/useCatalogFilters'
import { useModalTarget } from '~/composables/useModalTarget'

// Catalog home. Everyone lands on the project folders (the primary entry point);
// privileged users can flip to the flat management console for cross-project work.
const { privileged, loggedIn, role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

// Shared, access-filtered catalog state (decks + folders) on Pinia Colada.
// Mutations invalidate the cache, so create/delete reflect everywhere instantly.
const {
  presentations,
  presentationsStatus: status,
  presentationsError: error,
  projects,
} = useCatalog()

function onProjectCreated(project: Project) {
  // The create mutation already invalidated the folders query; just navigate.
  return navigateTo(`/projects/${project.slug}`)
}

// folders = browse by project (default); manage = flat table/grid (admin only).
const mode = ref<'folders' | 'manage'>('folders')

// Management console filter state (only used in `manage` mode).
const { query, visible, hasActiveFilters, resetFilters } = useCatalogFilters(presentations)

const toolbar = useTemplateRef('toolbar')
defineShortcuts({
  '/': () => mode.value === 'manage' && toolbar.value?.focusSearch(),
})

// Management modals (privileged): one instance at page level, targeted per deck.
const createOpen = ref(false)
const createProjectOpen = ref(false)
const { target, metaOpen, deleteOpen, openMeta, openDelete } = useModalTarget<PresentationListItem>()

// Folder management from the cards (owner), mirroring the deck pattern: one
// modal instance each, targeted per project by the grid's menu events.
const projectTarget = ref<Project | null>(null)
const editProjectOpen = ref(false)
const accessProjectOpen = ref(false)
const deleteProjectOpen = ref(false)

function openProjectEdit(project: Project) {
  projectTarget.value = project
  editProjectOpen.value = true
}
function openProjectAccess(project: Project) {
  projectTarget.value = project
  accessProjectOpen.value = true
}
function openProjectDelete(project: Project) {
  projectTarget.value = project
  deleteProjectOpen.value = true
}

const projectDeckCount = computed(() =>
  projectTarget.value
    ? presentations.value.filter(d => d.project === projectTarget.value!.slug).length
    : 0)
</script>

<template>
  <div>
    <AsyncSection
      :status="status"
      :error="error"
      :empty="presentations.length === 0"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-presentation"
          title="Aucune présentation"
          :description="privileged
            ? 'Créez un premier dossier ou une présentation pour démarrer.'
            : loggedIn
              ? 'Rien ne vous a été partagé pour le moment.'
              : 'Si des présentations vous ont été partagées, connectez-vous pour les voir.'"
          variant="naked"
          size="lg"
          :actions="!loggedIn
            ? [{ label: 'Se connecter', icon: 'i-lucide-log-in', to: '/login' }]
            : []"
        />
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
        :owner="isOwner"
        @edit-project="openProjectEdit"
        @manage-access="openProjectAccess"
        @remove-project="openProjectDelete"
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
    </AsyncSection>

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
    />
    <DeckDeleteModal
      v-if="target"
      v-model:open="deleteOpen"
      :item="target"
    />
    <ProjectEditModal
      v-if="projectTarget"
      v-model:open="editProjectOpen"
      :project="projectTarget"
    />
    <ProjectAccessSlideover
      v-if="projectTarget"
      v-model:open="accessProjectOpen"
      :project="projectTarget"
    />
    <ProjectDeleteModal
      v-if="projectTarget"
      v-model:open="deleteProjectOpen"
      :project="projectTarget"
      :deck-count="projectDeckCount"
    />
  </div>
</template>

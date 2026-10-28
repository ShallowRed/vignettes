<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { useAppSession } from '../composables/useAppSession'
import { useCatalog } from '../composables/useCatalog'
import { useCatalogFilters } from '../composables/useCatalogFilters'
import { useModalTarget } from '../composables/useModalTarget'

// Catalog home. Everyone lands on the project folders (the primary entry point);
// privileged users can flip to the flat management console for cross-project work.
const { t } = useI18n()
const { privileged, loggedIn, role, user } = useAppSession()
const { welcome } = useRuntimeConfig().public
useHead({ title: () => t('catalog.home.pageTitle') })
const isOwner = computed(() => role.value === 'owner')

// Shared, access-filtered catalog state (decks + folders) on Pinia Colada.
// Mutations invalidate the cache, so create/delete reflect everywhere instantly.
const {
  presentations,
  presentationsStatus: status,
  presentationsError: error,
  projects,
  refreshAll,
} = useCatalog()

function onProjectCreated(project: Project) {
  // The create mutation already invalidated the folders query; just navigate.
  return navigateTo(`/projects/${project.slug}`)
}

// folders = browse by project (default); manage = flat table/grid (admin only).
const mode = ref<'folders' | 'manage'>('folders')
const modeChoices = computed(() => [
  { value: 'folders', label: t('catalog.home.modeFolders'), icon: 'i-lucide-folder', active: mode.value === 'folders' },
  { value: 'manage', label: t('catalog.home.modeManage'), icon: 'i-lucide-table-2', active: mode.value === 'manage' },
])

// Management console filter state (only used in `manage` mode).
const { query, visible, hasActiveFilters, resetFilters } = useCatalogFilters(presentations)

const toolbar = useTemplateRef('toolbar')
defineShortcuts({
  '/': () => mode.value === 'manage' && toolbar.value?.focusSearch(),
})

// Management modals (privileged): one instance at page level, targeted per deck.
const createOpen = ref(false)
const createProjectOpen = ref(false)
const { target, metaOpen, metaFocus, deleteOpen, duplicateOpen, duplicateMode, openMeta, openDelete, openDuplicate } = useModalTarget<PresentationListItem>()

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
  <div class="flex flex-col gap-6">
    <div
      v-if="!loggedIn"
      class="flex flex-col gap-1"
    >
      <h1 class="text-xl font-semibold text-highlighted">
        {{ t('catalog.home.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ welcome || t('catalog.home.intro') }}
      </p>
    </div>
    <AsyncSection
      :status="status"
      :error="error"
      :retry="refreshAll"
      :empty="presentations.length === 0"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-presentation"
          :title="t('catalog.home.emptyTitle')"
          :description="privileged
            ? t('catalog.home.emptyPrivileged')
            : loggedIn
              ? t('catalog.home.emptyLoggedIn', { login: user?.login ?? '' })
              : t('catalog.home.emptyAnonymous')"
          variant="naked"
          size="lg"
          :actions="!loggedIn
            ? [{ label: t('common.actions.signIn'), icon: 'i-lucide-log-in', to: '/login' }]
            : []"
        />
        <div
          v-if="privileged"
          class="flex justify-center gap-2 mt-4"
        >
          <UButton
            icon="i-lucide-folder-plus"
            :label="t('common.actions.newFolder')"
            color="neutral"
            variant="subtle"
            @click="createProjectOpen = true"
          />
          <UButton
            icon="i-lucide-file-plus-2"
            :label="t('common.actions.newDeck')"
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
        <ChoiceRow
          size="sm"
          class="shrink-0"
          :choices="modeChoices"
          @choose="mode = $event as 'folders' | 'manage'"
        />

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

        <div class="flex items-center gap-2 ms-auto">
          <UButton
            icon="i-lucide-folder-plus"
            :label="t('common.actions.newFolder')"
            :aria-label="t('common.actions.newFolder')"
            :ui="{ label: 'max-md:sr-only' }"
            color="neutral"
            variant="ghost"
            class="shrink-0"
            @click="createProjectOpen = true"
          />
          <UButton
            icon="i-lucide-file-plus-2"
            :label="t('common.actions.newDeck')"
            class="shrink-0"
            @click="createOpen = true"
          />
        </div>
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
            ? t('catalog.deck.count', presentations.length)
            : t('catalog.home.visibleCount', { visible: visible.length, total: presentations.length }) }}
        </p>

        <UEmpty
          v-if="visible.length === 0"
          icon="i-lucide-search-x"
          :title="t('catalog.home.noResultTitle')"
          :description="t('catalog.home.noResultDescription')"
          variant="naked"
          :actions="hasActiveFilters
            ? [{ label: t('catalog.home.resetFilters'), icon: 'i-lucide-filter-x', color: 'neutral', variant: 'subtle', onClick: resetFilters }]
            : []"
        />

        <CatalogTable
          v-else
          :items="visible"
          :admin="privileged"
          :projects="projects"
          @edit-meta="openMeta"
          @share="(item: PresentationListItem) => openMeta(item, 'sharing')"
          @duplicate="(item: PresentationListItem, mode: 'variant' | 'edition') => openDuplicate(item, mode)"
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
      :focus="metaFocus"
    />
    <DeckDeleteModal
      v-if="target"
      v-model:open="deleteOpen"
      :item="target"
    />
    <DeckDuplicateModal
      v-if="target"
      v-model:open="duplicateOpen"
      :item="target"
      :mode="duplicateMode"
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

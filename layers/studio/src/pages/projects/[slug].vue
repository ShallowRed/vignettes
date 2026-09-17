<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { buildFolderContents, UNGROUPED_PROJECT } from '#shared/presentations'
import { useAppSession } from '../../composables/useAppSession'
import { useCatalog } from '../../composables/useCatalog'
import { useModalTarget } from '../../composables/useModalTarget'
import { projectColorStyle } from '../../utils/project-colors'

// A project folder's contents: the decks grouped under one project, reached from
// the folder grid via the stable /projects/<slug> route. `divers` is the
// reserved slug for the no-project bucket.
const route = useRoute()
const routeSlug = computed(() => route.params.slug as string)
const isUngrouped = computed(() => routeSlug.value === 'divers')
const projectKey = computed(() => isUngrouped.value ? UNGROUPED_PROJECT : routeSlug.value)

const { privileged, role, loggedIn } = useAppSession()

// Shared catalog state (decks + folders) on Pinia Colada, same cache the home
// reads. Mutating a folder here invalidates those queries, so the home grid
// updates too — no stale folder, no manual refresh threading.
const {
  presentations,
  presentationsStatus: status,
  presentationsError: error,
  projects,
} = useCatalog()

const projectTitle = computed(() =>
  isUngrouped.value
    ? 'Divers'
    : (projects.value.find(p => p.slug === routeSlug.value)?.title ?? routeSlug.value))

// Most recently changed first: the deck someone is working on is at the top.
const decks = computed(() =>
  presentations.value
    .filter(d => (d.project ?? UNGROUPED_PROJECT) === projectKey.value)
    .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)))

const contents = computed(() => buildFolderContents(decks.value))
const titleOf = (slug: string) => decks.value.find(d => d.slug === slug)?.title ?? slug

// A theme shared by every deck is named once for the folder instead of on each card.
const sharedTheme = computed(() => {
  const themes = new Set(decks.value.map(d => d.theme))
  return themes.size === 1 ? [...themes][0] : undefined
})

const breadcrumb = computed(() => [
  { label: 'Accueil', to: '/' },
  { label: projectTitle.value },
])

useHead(() => ({ title: `${projectTitle.value} · Vignettes` }))

const isOwner = computed(() => role.value === 'owner')

// Project access (owner only): a master-key grant over every deck in the project.
const accessOpen = ref(false)
const currentProject = computed(() => projects.value.find(p => p.slug === projectKey.value))
const projectRef = computed(() => ({ slug: projectKey.value, title: projectTitle.value, color: currentProject.value?.color ?? null, icon: currentProject.value?.icon ?? null }))
// Divers and a folder slug left on decks without its project row have nothing to manage.
const canManageAccess = computed(() => isOwner.value && Boolean(currentProject.value))

// Project lifecycle (owner only): edit metadata, or trash the whole folder.
const editProjectOpen = ref(false)
const deleteProjectOpen = ref(false)
const canManageProject = computed(() => isOwner.value && Boolean(currentProject.value))

// Create a deck straight into this folder: privileged roles anywhere, and a
// collaborator holding an `editor` grant on THIS folder (the server accepts
// exactly that). Pre-selects the project.
const createOpen = ref(false)
const defaultProject = computed(() => currentProject.value?.slug)
const canCreateHere = computed(() =>
  privileged.value || (!isUngrouped.value && currentProject.value?.myGrant === 'editor'))
// A collaborator may only file a new deck under folders they can edit.
const creatableProjects = computed(() =>
  privileged.value ? projects.value : projects.value.filter(p => p.myGrant === 'editor'))

function onProjectSaved(project: Project) {
  // The edit mutation invalidated the folders query already; a slug change also
  // moves the folder to a new URL.
  if (project.slug !== routeSlug.value)
    navigateTo(`/projects/${project.slug}`)
}
function onProjectDeleted() {
  // The delete mutation optimistically dropped this folder + its decks and
  // invalidated the caches; just leave the (now-gone) folder page.
  navigateTo('/')
}

// Management modals (privileged), mirroring the home console.
const { target, metaOpen, metaFocus, deleteOpen, duplicateOpen, duplicateMode, openMeta, openDelete, openDuplicate } = useModalTarget<PresentationListItem>()
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <UIcon
        :name="`i-lucide-${currentProject?.icon || 'folder'}`"
        class="size-5 shrink-0 text-dimmed"
        :style="projectColorStyle(currentProject?.color)"
      />
      <h1 class="text-xl font-semibold text-highlighted">
        {{ projectTitle }}
      </h1>
      <span class="text-sm text-muted">{{ decks.length }} présentation{{ decks.length > 1 ? 's' : '' }}</span>
      <div class="flex-1" />
      <UButton
        v-if="canCreateHere"
        icon="i-lucide-file-plus-2"
        label="Nouvelle présentation"
        size="sm"
        @click="createOpen = true"
      />
      <UButton
        v-if="canManageProject"
        icon="i-lucide-pencil"
        label="Modifier"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="editProjectOpen = true"
      />
      <UButton
        v-if="canManageAccess"
        icon="i-lucide-users"
        label="Gérer l'accès"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="accessOpen = true"
      />
      <UButton
        v-if="canManageProject"
        icon="i-lucide-trash-2"
        label="Supprimer"
        color="error"
        variant="ghost"
        size="sm"
        @click="deleteProjectOpen = true"
      />
    </div>

    <p
      v-if="decks.length"
      class="-mt-4 text-sm text-muted"
    >
      {{ sharedTheme ? `Thème ${sharedTheme} · ` : '' }}Triées par dernière modification
    </p>

    <AsyncSection
      :status="status"
      :error="error"
      :empty="decks.length === 0"
    >
      <template #empty>
        <UEmpty
          icon="i-lucide-folder-open"
          :title="loggedIn ? 'Dossier vide' : 'Dossier privé ou vide'"
          :description="loggedIn
            ? 'Aucune présentation dans ce projet.'
            : 'Si ce dossier vous a été partagé, connectez-vous pour voir son contenu.'"
          variant="naked"
          :actions="canCreateHere
            ? [{ label: 'Nouvelle présentation', icon: 'i-lucide-file-plus-2', onClick: () => (createOpen = true) }]
            : !loggedIn
              ? [{ label: 'Se connecter', icon: 'i-lucide-log-in', to: `/login?redirect=/projects/${routeSlug}` }]
              : []"
        />
      </template>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <PresentationCard
          v-for="entry in contents.entries"
          :key="entry.family ?? entry.variants[0]!.slug"
          :presentation="entry.variants[0]!"
          :variants="entry.family ? entry.variants : undefined"
          :admin="privileged"
          @edit-meta="deck => openMeta(deck)"
          @share="deck => openMeta(deck, 'sharing')"
          @duplicate="(deck, mode) => openDuplicate(deck, mode)"
          @remove="deck => openDelete(deck)"
        />
      </div>

      <UCollapsible
        v-if="contents.superseded.length"
        class="mt-10"
      >
        <UButton
          :label="`Éditions remplacées (${contents.superseded.length})`"
          color="neutral"
          variant="ghost"
          trailing-icon="i-lucide-chevron-down"
          :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
          class="group -ml-2.5"
        />
        <template #content>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
            <PresentationCard
              v-for="presentation in contents.superseded"
              :key="presentation.slug"
              :presentation="presentation"
              :replaced-by="titleOf(presentation.supersededBy!)"
              :admin="privileged"
              @edit-meta="deck => openMeta(deck)"
              @share="deck => openMeta(deck, 'sharing')"
              @duplicate="(deck, mode) => openDuplicate(deck, mode)"
              @remove="deck => openDelete(deck)"
            />
          </div>
        </template>
      </UCollapsible>
    </AsyncSection>

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
    <ProjectAccessSlideover
      v-if="canManageAccess"
      v-model:open="accessOpen"
      :project="projectRef"
    />
    <ProjectEditModal
      v-if="canManageProject"
      v-model:open="editProjectOpen"
      :project="projectRef"
      @saved="onProjectSaved"
    />
    <ProjectDeleteModal
      v-if="canManageProject"
      v-model:open="deleteProjectOpen"
      :project="projectRef"
      :deck-count="decks.length"
      @deleted="onProjectDeleted"
    />
    <DeckCreateModal
      v-model:open="createOpen"
      :projects="creatableProjects"
      :default-project="defaultProject"
    />
  </div>
</template>

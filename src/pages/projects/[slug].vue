<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { UNGROUPED_PROJECT } from '#shared/presentations'
import { useAppSession } from '~/composables/useAppSession'

// A project folder's contents: the decks grouped under one project, reached from
// the folder grid via the stable /projects/<slug> route. `divers` is the
// reserved slug for the no-project bucket.
const route = useRoute()
const routeSlug = computed(() => route.params.slug as string)
const isUngrouped = computed(() => routeSlug.value === 'divers')
const projectKey = computed(() => isUngrouped.value ? UNGROUPED_PROJECT : routeSlug.value)

const { privileged, role } = useAppSession()

const nuxtApp = useNuxtApp()
const requestFetch = useRequestFetch()
// Same as the catalog home: use the SSR payload during hydration, never after
// (the listing is session-dependent). See index.vue for the full rationale.
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

watch(privileged, (now, before) => {
  if (now && !before)
    refresh()
})

const projectTitle = computed(() =>
  isUngrouped.value
    ? 'Divers'
    : (projects.value.find(p => p.slug === routeSlug.value)?.title ?? routeSlug.value))

const decks = computed(() =>
  presentations.value.filter(d => (d.project ?? UNGROUPED_PROJECT) === projectKey.value))

const breadcrumb = computed(() => [
  { label: 'Accueil', to: '/' },
  { label: projectTitle.value },
])

useHead(() => ({ title: `${projectTitle.value} — Nuxt Slides` }))

const isOwner = computed(() => role.value === 'owner')

// Project access (owner only): a master-key grant over every deck in the project.
const accessOpen = ref(false)
const currentProject = computed(() => projects.value.find(p => p.slug === projectKey.value))
const projectRef = computed(() => ({ slug: projectKey.value, title: projectTitle.value, color: currentProject.value?.color ?? null }))
const canManageAccess = computed(() => isOwner.value && !isUngrouped.value)

// Project lifecycle (owner only): edit metadata, or trash the whole folder.
const editProjectOpen = ref(false)
const deleteProjectOpen = ref(false)
const canManageProject = computed(() => isOwner.value && !isUngrouped.value)

function onProjectSaved(project: Project) {
  // A slug change moves the folder to a new URL; otherwise just refresh in place.
  if (project.slug !== routeSlug.value)
    navigateTo(`/projects/${project.slug}`)
  else
    refreshProjects()
}
function onProjectDeleted() {
  navigateTo('/')
}

// Management modals (privileged), mirroring the home console.
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
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold text-highlighted">
        {{ projectTitle }}
      </h1>
      <span class="text-sm text-muted">{{ decks.length }} présentation{{ decks.length > 1 ? 's' : '' }}</span>
      <div class="flex-1" />
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

    <CatalogState
      v-if="status === 'pending'"
      state="pending"
    />
    <CatalogState
      v-else-if="error"
      state="error"
      :message="error.message"
    />

    <UEmpty
      v-else-if="decks.length === 0"
      icon="i-lucide-folder-open"
      title="Dossier vide"
      description="Aucune présentation dans ce projet."
      variant="naked"
    />

    <div
      v-else
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
    >
      <PresentationCard
        v-for="presentation in decks"
        :key="presentation.slug"
        :presentation="presentation"
        :admin="privileged"
        @edit-meta="openMeta(presentation)"
        @remove="openDelete(presentation)"
      />
    </div>

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
  </div>
</template>

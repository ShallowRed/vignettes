<script setup lang="ts">
import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { Fact } from './FactList.vue'
import { buildCatalogFolders } from '#shared/presentations'
import { useProjectActions } from '../composables/useProjectActions'
import { projectColorStyle } from '../utils/project-colors'

// Projects rendered as folders: the catalog's primary entry point. The folder
// set is derived (pure view-model) from the access-filtered decks plus the
// visible projects — the server already decides which projects an actor may see,
// so an empty folder only reaches privileged actors (e.g. a project just created,
// before it has any deck). Each links to its stable /projects/<slug> route.
// `owner` adds the folder management menu, mirroring the presentation cards.
const props = defineProps<{
  items: PresentationListItem[]
  projects?: Project[]
  owner?: boolean
}>()

const emit = defineEmits<{
  editProject: [Project]
  manageAccess: [Project]
  removeProject: [Project]
}>()

const { t } = useI18n()

const folders = computed(() => buildCatalogFolders(props.items, props.projects ?? []))

// Folder master keys (privileged payloads only), for the "shared" hint.
const sharedBySlug = computed(() =>
  new Map((props.projects ?? []).map(p => [p.slug, p.sharedCount ?? 0])))

function folderFacts(slug: string, count: number): Fact[] {
  const shared = sharedBySlug.value.get(slug)
  return [
    { key: 'count', text: t('catalog.deck.count', count) },
    ...(shared ? [{ key: 'shared', text: String(shared), icon: 'i-lucide-users', title: t('catalog.folders.sharedAccess', { n: shared }) }] : []),
  ]
}

// Only real project rows are manageable (Divers and orphan buckets have none).
const projectBySlug = computed(() =>
  new Map((props.projects ?? []).map(p => [p.slug, p])))

const projectActions = useProjectActions()
function folderActions(project: Project) {
  return projectActions({
    edit: () => emit('editProject', project),
    manageAccess: () => emit('manageAccess', project),
    remove: () => emit('removeProject', project),
  })
}
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    <UPageCard
      v-for="folder in folders"
      :key="folder.routeSlug"
      :to="`/projects/${folder.routeSlug}`"
      variant="outline"
      :ui="{
        root: 'ring-0 border-0 shadow-sm hover:shadow-md hover:bg-accented transition-all duration-200',
        container: 'p-4 sm:p-5',
      }"
    >
      <template #body>
        <!-- Owner actions pinned top-right (z-10 clears the stretched-link overlay). -->
        <div
          v-if="owner && projectBySlug.get(folder.routeSlug)"
          class="absolute top-2 right-2 z-10"
          @click.stop.prevent
        >
          <UDropdownMenu
            :items="folderActions(projectBySlug.get(folder.routeSlug)!)"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('catalog.folders.actionsLabel', { name: folder.title })"
            />
          </UDropdownMenu>
        </div>

        <div class="flex items-start gap-3">
          <UIcon
            :name="`i-lucide-${folder.icon || 'folder'}`"
            class="size-6 shrink-0 mt-0.5 project-tint"
            :style="projectColorStyle(folder.color)"
          />
          <div class="min-w-0">
            <h2 class="font-semibold text-highlighted leading-snug">
              {{ folder.ungrouped ? t('catalog.project.ungroupedTitle') : folder.title }}
            </h2>
            <FactList
              class="mt-1"
              :facts="folderFacts(folder.routeSlug, folder.count)"
            />
          </div>
        </div>
      </template>
    </UPageCard>
  </div>
</template>

<script setup lang="ts">
import type { CatalogQuery, PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import { applyCatalogQuery } from '#shared/presentations'
import { useAppSession } from '~/composables/useAppSession'

// Single catalog for every role: the API already scopes visibility to the actor
// (drafts/private appear only for privileged sessions); `privileged` only toggles
// management details on the cards.
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
        v-model="query"
        :items="presentations"
        :projects="projects"
        show-status-filter
      />

      <UEmpty
        v-if="visible.length === 0"
        icon="i-lucide-search-x"
        title="Aucun résultat"
        description="Aucune présentation ne correspond à votre recherche."
        variant="naked"
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

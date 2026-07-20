<script setup lang="ts">
import type { PublicationStatus } from '#shared/access'
import { useAppSession } from '~/composables/useAppSession'

// The trash (corbeille): restore or permanently erase soft-deleted projects and
// decks. Privileged users can restore; only the owner can permanently erase.
interface TrashProject { slug: string, title: string, color?: string | null, deckCount: number }
interface TrashDeck { slug: string, title: string, project?: string, status: PublicationStatus }

const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

const toast = useToast()
const busy = ref(false)

const { data, refresh, error } = await useAsyncData(
  'trash',
  () => $fetch<{ projects: TrashProject[], decks: TrashDeck[] }>('/api/admin/trash'),
  { default: () => ({ projects: [], decks: [] }) },
)

const isEmpty = computed(() => data.value.projects.length === 0 && data.value.decks.length === 0)

const breadcrumb = [
  { label: 'Accueil', to: '/' },
  { label: 'Corbeille' },
]
useHead({ title: 'Corbeille — Nuxt Slides' })

async function act(url: string, method: 'POST' | 'DELETE', okTitle: string) {
  busy.value = true
  try {
    await $fetch(url, { method })
    toast.add({ title: okTitle, icon: 'i-lucide-check', color: 'success' })
    await refresh()
  }
  catch (e: any) {
    toast.add({ title: e?.statusMessage || 'Échec', icon: 'i-lucide-triangle-alert', color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const restoreProject = (slug: string) => act(`/api/admin/trash/projects/${slug}/restore`, 'POST', 'Dossier restauré')
const restoreDeck = (slug: string) => act(`/api/admin/trash/decks/${slug}/restore`, 'POST', 'Présentation restaurée')

// Permanent deletion goes through a confirmation modal.
const purgeTarget = ref<{ kind: 'project' | 'deck', slug: string, title: string } | null>(null)
const purgeOpen = computed({
  get: () => purgeTarget.value !== null,
  set: (v: boolean) => {
    if (!v)
      purgeTarget.value = null
  },
})

async function confirmPurge() {
  const t = purgeTarget.value
  if (!t)
    return
  const url = t.kind === 'project' ? `/api/admin/trash/projects/${t.slug}` : `/api/admin/trash/decks/${t.slug}`
  await act(url, 'DELETE', 'Supprimé définitivement')
  purgeTarget.value = null
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <UBreadcrumb :items="breadcrumb" />

    <div class="flex items-center gap-3">
      <h1 class="text-xl font-semibold text-highlighted">
        Corbeille
      </h1>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-lock"
      title="Accès réservé"
      description="La corbeille est réservée aux comptes autorisés."
    />

    <UEmpty
      v-else-if="isEmpty"
      icon="i-lucide-trash-2"
      title="Corbeille vide"
      description="Les dossiers et présentations supprimés apparaîtront ici."
      variant="naked"
    />

    <template v-else>
      <!-- Trashed projects (folder + its decks restore/purge together). -->
      <section
        v-if="data.projects.length"
        class="flex flex-col gap-2"
      >
        <h2 class="text-sm font-medium text-muted">
          Dossiers
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="project in data.projects"
            :key="project.slug"
            class="flex items-center gap-3 rounded-lg bg-elevated px-3 py-2"
          >
            <UIcon
              name="i-lucide-folder"
              class="size-5 text-dimmed shrink-0"
            />
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted truncate">
                {{ project.title }}
              </p>
              <p class="text-xs text-muted">
                {{ project.deckCount }} présentation{{ project.deckCount > 1 ? 's' : '' }}
              </p>
            </div>
            <div class="flex-1" />
            <UButton
              label="Restaurer"
              icon="i-lucide-undo-2"
              color="neutral"
              variant="subtle"
              size="xs"
              :disabled="busy"
              @click="restoreProject(project.slug)"
            />
            <UButton
              v-if="isOwner"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :disabled="busy"
              aria-label="Supprimer définitivement"
              @click="purgeTarget = { kind: 'project', slug: project.slug, title: project.title }"
            />
          </li>
        </ul>
      </section>

      <!-- Standalone trashed decks (not part of a trashed folder). -->
      <section
        v-if="data.decks.length"
        class="flex flex-col gap-2"
      >
        <h2 class="text-sm font-medium text-muted">
          Présentations
        </h2>
        <ul class="flex flex-col gap-2">
          <li
            v-for="deck in data.decks"
            :key="deck.slug"
            class="flex items-center gap-3 rounded-lg bg-elevated px-3 py-2"
          >
            <UIcon
              name="i-lucide-presentation"
              class="size-5 text-dimmed shrink-0"
            />
            <p class="text-sm font-medium text-highlighted truncate min-w-0">
              {{ deck.title }}
            </p>
            <div class="flex-1" />
            <UButton
              label="Restaurer"
              icon="i-lucide-undo-2"
              color="neutral"
              variant="subtle"
              size="xs"
              :disabled="busy"
              @click="restoreDeck(deck.slug)"
            />
            <UButton
              v-if="isOwner"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :disabled="busy"
              aria-label="Supprimer définitivement"
              @click="purgeTarget = { kind: 'deck', slug: deck.slug, title: deck.title }"
            />
          </li>
        </ul>
      </section>
    </template>

    <UModal
      v-model:open="purgeOpen"
      title="Supprimer définitivement ?"
      :description="purgeTarget?.title"
    >
      <template #body>
        <UAlert
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Action irréversible"
          :description="purgeTarget?.kind === 'project'
            ? 'Le dossier et toutes ses présentations (brouillons, versions, partages) seront effacés pour de bon.'
            : 'Brouillon, versions publiées, réglages et partages seront effacés pour de bon.'"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            @click="purgeTarget = null"
          />
          <UButton
            label="Supprimer définitivement"
            color="error"
            icon="i-lucide-trash-2"
            :loading="busy"
            @click="confirmPurge"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>

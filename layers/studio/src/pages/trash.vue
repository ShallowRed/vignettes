<script setup lang="ts">
import { useAppSession } from '../composables/useAppSession'
import { useTrash } from '../composables/useTrash'

definePageMeta({ layout: false })

// The trash (corbeille): restore or permanently erase soft-deleted projects and
// decks. Privileged users can restore; only the owner can permanently erase.
const { t } = useI18n()
const { role } = useAppSession()
const isOwner = computed(() => role.value === 'owner')

// Query + restore/purge mutations (cross-invalidate the catalog on restore).
const { projects, decks, isEmpty, status, error, refresh, canView, busy, restore, purge } = useTrash()

const breadcrumb = computed(() => [
  { label: t('common.home'), to: '/' },
  { label: t('admin.trash.title') },
])
useHead({ title: () => t('admin.trash.pageTitle') })

const restoreProject = (slug: string) => restore({ kind: 'project', slug })
const restoreDeck = (slug: string) => restore({ kind: 'deck', slug })

// Permanent deletion goes through a confirmation modal. The target keeps a title
// for the dialog copy; only { kind, slug } is sent to the purge endpoint.
interface PurgeTarget { kind: 'project' | 'deck', slug: string, title: string }
const purgeTarget = ref<PurgeTarget | null>(null)
const purgeOpen = computed({
  get: () => purgeTarget.value !== null,
  set: (v: boolean) => {
    if (!v)
      purgeTarget.value = null
  },
})

async function confirmPurge() {
  if (!purgeTarget.value)
    return
  await purge({ kind: purgeTarget.value.kind, slug: purgeTarget.value.slug })
  purgeTarget.value = null
}
</script>

<template>
  <NuxtLayout
    name="default"
    :breadcrumb="breadcrumb"
  >
    <div class="flex flex-col gap-6">
      <div class="flex items-center gap-3">
        <h1 class="text-xl font-semibold text-highlighted">
          {{ t('admin.trash.title') }}
        </h1>
      </div>

      <ErrorState
        v-if="!canView"
        icon="i-lucide-lock"
        :title="t('admin.access.restrictedTitle')"
        :description="t('admin.trash.restrictedDescription')"
        :back="{ to: '/' }"
      />

      <AsyncSection
        v-else
        :status="status"
        :error="error"
        :retry="refresh"
        :empty="isEmpty"
      >
        <template #pending>
          <div class="flex flex-col gap-2">
            <USkeleton
              v-for="i in 3"
              :key="i"
              class="h-12 rounded-lg"
            />
          </div>
        </template>

        <template #empty>
          <UEmpty
            icon="i-lucide-trash-2"
            :title="t('admin.trash.emptyTitle')"
            :description="t('admin.trash.emptyDescription')"
            variant="naked"
          />
        </template>

        <div class="flex flex-col gap-6">
          <!-- Trashed projects (folder + its decks restore/purge together). -->
          <section
            v-if="projects.length"
            class="flex flex-col gap-2"
          >
            <h2 class="text-sm font-medium text-muted">
              {{ t('admin.trash.folders') }}
            </h2>
            <ul class="flex flex-col gap-2">
              <li
                v-for="project in projects"
                :key="project.slug"
                class="flex items-center gap-3 list-row"
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
                    {{ t('admin.trash.deckCount', project.deckCount) }}
                  </p>
                </div>
                <div class="flex-1" />
                <UButton
                  :label="t('common.actions.restore')"
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
                  :aria-label="t('admin.trash.deleteForeverItem', { title: project.title })"
                  @click="purgeTarget = { kind: 'project', slug: project.slug, title: project.title }"
                />
              </li>
            </ul>
          </section>

          <!-- Standalone trashed decks (not part of a trashed folder). -->
          <section
            v-if="decks.length"
            class="flex flex-col gap-2"
          >
            <h2 class="text-sm font-medium text-muted">
              {{ t('admin.trash.decks') }}
            </h2>
            <ul class="flex flex-col gap-2">
              <li
                v-for="deck in decks"
                :key="deck.slug"
                class="flex items-center gap-3 list-row"
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
                  :label="t('common.actions.restore')"
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
                  :aria-label="t('admin.trash.deleteForeverItem', { title: deck.title })"
                  @click="purgeTarget = { kind: 'deck', slug: deck.slug, title: deck.title }"
                />
              </li>
            </ul>
          </section>
        </div>
      </AsyncSection>

      <UModal
        v-model:open="purgeOpen"
        :title="t('admin.trash.purgeConfirmTitle')"
        :description="purgeTarget?.title"
      >
        <template #body>
          <ActionNotice
            tone="critical"
            :title="t('admin.trash.purgeIrreversible')"
            :description="purgeTarget?.kind === 'project'
              ? t('admin.trash.purgeFolderDescription')
              : t('admin.trash.purgeDeckDescription')"
          />
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 w-full">
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              @click="purgeTarget = null"
            />
            <UButton
              :label="t('common.actions.deleteForever')"
              color="error"
              icon="i-lucide-trash-2"
              :loading="busy"
              @click="confirmPurge"
            />
          </div>
        </template>
      </UModal>
    </div>
  </NuxtLayout>
</template>

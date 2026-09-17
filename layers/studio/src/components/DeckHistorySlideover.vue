<script setup lang="ts">
import { useMutation, useQuery } from '@pinia/colada'
import { historyApi } from '../api'
import { historyQuery, versionQuery } from '../queries'

/**
 * The history of a deck: the draft, then the published versions. Each entry
 * shows what it changed: the draft against the version the visitors see, a
 * version against the one before it. Restoring copies a version into the
 * draft; the visitors keep the current version until the next publish.
 */
const props = defineProps<{
  slug: string
  /** The text of the editor. */
  draft: string
  /** Whether the draft differs from the published version; null while unknown. */
  unpublished: boolean | null
}>()
const emit = defineEmits<{ restored: [stamp: number | null] }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()

const listQ = useQuery({ ...historyQuery($fetch, props.slug), enabled: () => open.value })
const versions = computed(() => listQ.data.value ?? [])
const current = computed(() => versions.value.find(v => v.current) ?? null)

type Selection = 'draft' | number
const selected = ref<Selection | null>(null)
const confirming = ref(false)
const chunks = ref<number | null>(null)
// The draft is shown on open; closing forgets the selection.
watch(open, (now) => {
  selected.value = now ? 'draft' : null
  confirming.value = false
})
watch(selected, () => {
  confirming.value = false
  chunks.value = null
})

const selectedVersion = computed(() => typeof selected.value === 'number' ? versions.value.find(v => v.id === selected.value) ?? null : null)

// The two texts of the diff: what the entry changed (`to`) against what came
// before it (`from`): the current version for the draft, the previous
// publication for a version. A first version is shown as it is.
const targetId = computed(() => typeof selected.value === 'number' ? selected.value : null)
const baseId = computed(() => {
  if (selected.value === 'draft')
    return current.value?.id ?? null
  const index = versions.value.findIndex(v => v.id === selected.value)
  return index >= 0 ? versions.value[index + 1]?.id ?? null : null
})
const targetQ = useQuery({ ...versionQuery($fetch, props.slug, targetId), enabled: () => targetId.value !== null })
const baseQ = useQuery({ ...versionQuery($fetch, props.slug, baseId), enabled: () => baseId.value !== null })
const to = computed(() => {
  if (selected.value === 'draft')
    return props.draft
  return targetQ.data.value?.id === targetId.value ? targetQ.data.value.raw : null
})
const from = computed(() => {
  if (baseId.value === null)
    return to.value
  return baseQ.data.value?.id === baseId.value ? baseQ.data.value.raw : null
})
const firstVersion = computed(() => selected.value !== 'draft' && baseId.value === null)

const heading = computed(() => {
  if (selected.value === 'draft')
    return 'Brouillon en cours'
  if (!selectedVersion.value)
    return ''
  return `${selectedVersion.value.current ? 'Version en ligne' : 'Version'} du ${when(selectedVersion.value.publishedAt)}`
})
const summary = computed(() => {
  if (selected.value === 'draft' && !current.value)
    return 'Jamais publié'
  if (firstVersion.value)
    return 'Première version publiée'
  if (chunks.value === null)
    return 'Comparaison…'
  const against = selected.value === 'draft' ? 'la version en ligne' : 'la version précédente'
  if (chunks.value === 0)
    return `Identique à ${against}`
  const passages = chunks.value === 1 ? '1 passage modifié' : `${chunks.value} passages modifiés`
  return selected.value === 'draft' ? `${passages} depuis ${against}` : `${passages} par cette publication`
})
const legend = computed(() => selected.value === 'draft'
  ? 'En vert, ce que le brouillon ajoute à la version en ligne ; en rouge, ce qu\'il en retire.'
  : 'En vert, ce que cette publication a ajouté ; en rouge, ce qu\'elle a retiré.')

// What a restore would put in the draft, and whether that changes anything.
const restoreId = computed(() => selected.value === 'draft' ? current.value?.id ?? null : targetId.value)
const restoreLabel = computed(() => restoreId.value === current.value?.id ? 'Revenir à la version en ligne' : 'Restaurer cette version')
const restorable = computed(() => {
  if (restoreId.value === null)
    return false
  if (selected.value === 'draft')
    return chunks.value !== null && chunks.value > 0
  return to.value !== null && to.value !== props.draft
})

function when(at: number): string {
  return new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}
function size(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

const { mutateAsync: restore, isLoading: restoring } = useMutation({
  mutation: (id: number) => historyApi.restore($fetch, props.slug, id),
  onSuccess(result) {
    toast.add({
      title: 'Version restaurée dans le brouillon',
      description: 'Relisez-la, puis publiez pour que les visiteurs la voient.',
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('restored', result.stamp)
    open.value = false
  },
  onError(error: any) {
    toast.add({ title: error?.statusMessage || 'Échec de la restauration', icon: 'i-lucide-triangle-alert', color: 'error' })
  },
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Historique"
    :description="`Le brouillon et les versions publiées de ${slug}`"
    :ui="{ content: 'max-w-5xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="grid h-full min-h-0 grid-cols-[17rem_minmax(0,1fr)]">
        <!-- The draft, then the versions, newest first. The served one is marked. -->
        <nav
          class="min-h-0 overflow-y-auto border-r border-default"
          aria-label="Brouillon et versions publiées"
        >
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 border-b border-default px-4 py-3 text-left hover:bg-elevated"
            :class="selected === 'draft' ? 'bg-elevated' : ''"
            :aria-current="selected === 'draft' ? 'true' : undefined"
            @click="selected = 'draft'"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">Brouillon en cours</span>
              <UBadge
                v-if="unpublished"
                label="Non publié"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </span>
            <span class="text-xs text-muted">{{ unpublished === false ? 'Identique à la version en ligne' : 'Ce que voit l\'éditeur' }}</span>
          </button>
          <p
            v-if="listQ.status.value === 'pending'"
            class="p-4 text-sm text-muted"
          >
            Chargement…
          </p>
          <p
            v-else-if="!versions.length"
            class="p-4 text-sm text-muted"
          >
            Aucune version publiée.
          </p>
          <ul v-else>
            <li
              v-for="entry in versions"
              :key="entry.id"
            >
              <button
                type="button"
                class="flex w-full flex-col gap-0.5 border-b border-default px-4 py-3 text-left hover:bg-elevated"
                :class="entry.id === selected ? 'bg-elevated' : ''"
                :aria-current="entry.id === selected ? 'true' : undefined"
                @click="selected = entry.id"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="text-sm font-medium text-highlighted">{{ when(entry.publishedAt) }}</span>
                  <UBadge
                    v-if="entry.current"
                    label="En ligne"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  />
                </span>
                <span class="text-xs text-muted">{{ entry.publishedBy }} · {{ size(entry.bytes) }}</span>
              </button>
            </li>
          </ul>
        </nav>

        <!-- The selected entry, what it changed, and its restoration. -->
        <section
          class="flex min-h-0 min-w-0 flex-col"
          aria-label="Entrée sélectionnée"
        >
          <div
            v-if="heading"
            class="flex items-center gap-3 border-b border-default px-4 py-2"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted">
                {{ heading }}
              </p>
              <p class="text-xs text-muted">
                {{ summary }}
              </p>
            </div>
            <UButton
              v-if="!confirming"
              :label="restoreLabel"
              icon="i-lucide-history"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!restorable"
              @click="confirming = true"
            />
          </div>

          <ActionNotice
            v-if="confirming && restoreId !== null"
            class="m-4"
            title="Remplacer le brouillon par cette version ?"
            description="Les modifications non publiées du brouillon seront perdues. Les visiteurs gardent la version en ligne jusqu'à la prochaine publication."
          >
            <UButton
              label="Restaurer"
              color="warning"
              size="sm"
              :loading="restoring"
              @click="restore(restoreId)"
            />
            <UButton
              label="Annuler"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="confirming = false"
            />
          </ActionNotice>

          <p
            v-if="chunks !== null && chunks > 0"
            class="px-4 py-2 text-xs text-muted"
          >
            {{ legend }}
          </p>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <DeckVersionDiff
              v-if="from !== null && to !== null"
              :from="from"
              :to="to"
              @chunks="chunks = $event"
            />
            <p
              v-else-if="selected !== null"
              class="p-4 text-sm text-muted"
            >
              Chargement…
            </p>
          </div>
        </section>
      </div>
    </template>
  </USlideover>
</template>

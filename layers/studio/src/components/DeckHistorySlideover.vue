<script setup lang="ts">
import type { HistoryEntry } from '#shared/presentations'
import type { HistoryRef } from '../api'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { historyApi } from '../api'
import { deckKeys, historyEntryQuery, historyQuery } from '../queries'

/**
 * The history of a deck: the draft, then the published versions and the
 * snapshots of the draft. Each entry shows what it changed: the draft against
 * the version the visitors see, any other entry against the one before it.
 * Restoring copies an entry into the draft, whose previous text stays in the
 * history; the visitors keep the current version until the next publish.
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
const queryCache = useQueryCache()

const listQ = useQuery({ ...historyQuery($fetch, props.slug), enabled: () => open.value })
const entries = computed(() => listQ.data.value ?? [])
const current = computed(() => entries.value.find(e => e.kind === 'version' && e.current) ?? null)

type Selection = 'draft' | HistoryRef
const selected = ref<Selection | null>(null)
const confirming = ref(false)
const naming = ref(false)
const label = ref('')
const chunks = ref<number | null>(null)
// The draft is shown on open; closing forgets the selection.
watch(open, (now) => {
  selected.value = now ? 'draft' : null
  confirming.value = false
  naming.value = false
})
watch(selected, () => {
  confirming.value = false
  chunks.value = null
})

const same = (a: HistoryRef, b: HistoryRef) => a.kind === b.kind && a.id === b.id
const isSelected = (entry: HistoryEntry) => selected.value !== null && selected.value !== 'draft' && same(selected.value, entry)
const selectedEntry = computed(() => selected.value && selected.value !== 'draft' ? entries.value.find(e => same(e, selected.value as HistoryRef)) ?? null : null)

// The two texts of the diff: what the entry changed (`to`) against what came
// before it (`from`): the current version for the draft, the previous entry
// otherwise. A first entry is shown as it is.
const targetRef = computed<HistoryRef | null>(() => selectedEntry.value ? { kind: selectedEntry.value.kind, id: selectedEntry.value.id } : null)
const baseRef = computed<HistoryRef | null>(() => {
  if (selected.value === 'draft')
    return current.value ? { kind: 'version', id: current.value.id } : null
  const index = entries.value.findIndex(e => isSelected(e))
  const previous = index >= 0 ? entries.value[index + 1] : undefined
  return previous ? { kind: previous.kind, id: previous.id } : null
})
const targetQ = useQuery({ ...historyEntryQuery($fetch, props.slug, targetRef), enabled: () => targetRef.value !== null })
const baseQ = useQuery({ ...historyEntryQuery($fetch, props.slug, baseRef), enabled: () => baseRef.value !== null })
function loaded(data: { kind: string, id: number, raw: string } | undefined, ref: HistoryRef | null) {
  return data && ref && same(data as HistoryRef, ref) ? data.raw : null
}
const to = computed(() => selected.value === 'draft' ? props.draft : loaded(targetQ.data.value, targetRef.value))
const from = computed(() => baseRef.value === null ? to.value : loaded(baseQ.data.value, baseRef.value))
const firstEntry = computed(() => selected.value !== 'draft' && selected.value !== null && baseRef.value === null)

function when(at: number): string {
  return new Date(at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}
function size(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}
function title(entry: HistoryEntry): string {
  return entry.kind === 'snapshot' && entry.label ? entry.label : when(entry.at)
}
function detail(entry: HistoryEntry): string {
  if (entry.kind === 'version')
    return `Publiée par ${entry.publishedBy} · ${size(entry.bytes)}`
  const who = entry.authors.length ? entry.authors.join(', ') : 'Enregistrement automatique'
  return `${entry.label ? `${when(entry.at)} · ` : ''}${who} · ${size(entry.bytes)}`
}

const heading = computed(() => {
  if (selected.value === 'draft')
    return 'Brouillon en cours'
  const entry = selectedEntry.value
  if (!entry)
    return ''
  if (entry.kind === 'version')
    return `${entry.current ? 'Version en ligne' : 'Version'} du ${when(entry.at)}`
  return entry.label ? `${entry.label} (instantané du ${when(entry.at)})` : `Instantané du ${when(entry.at)}`
})
const summary = computed(() => {
  if (selected.value === 'draft' && !current.value)
    return 'Jamais publié'
  if (firstEntry.value)
    return 'Première entrée de l\'historique'
  if (chunks.value === null)
    return 'Comparaison…'
  const against = selected.value === 'draft' ? 'la version en ligne' : selectedEntry.value?.kind === 'version' ? 'la version précédente' : 'l\'entrée précédente'
  if (chunks.value === 0)
    return `Identique à ${against}`
  const passages = chunks.value === 1 ? '1 passage modifié' : `${chunks.value} passages modifiés`
  return selected.value === 'draft' ? `${passages} depuis ${against}` : selectedEntry.value?.kind === 'version' ? `${passages} par cette publication` : `${passages} depuis ${against}`
})
const legend = computed(() => selected.value === 'draft'
  ? 'En vert, ce que le brouillon ajoute à la version en ligne ; en rouge, ce qu\'il en retire.'
  : 'En vert, ce que cette entrée a ajouté ; en rouge, ce qu\'elle a retiré.')

// What a restore would put in the draft, and whether that changes anything.
const restoreRef = computed<HistoryRef | null>(() => selected.value === 'draft' ? (current.value ? { kind: 'version', id: current.value.id } : null) : targetRef.value)
const restoreLabel = computed(() => {
  if (restoreRef.value?.kind === 'version' && restoreRef.value.id === current.value?.id)
    return 'Revenir à la version en ligne'
  return restoreRef.value?.kind === 'snapshot' ? 'Restaurer cet instantané' : 'Restaurer cette version'
})
const restorable = computed(() => {
  if (restoreRef.value === null)
    return false
  if (selected.value === 'draft')
    return chunks.value !== null && chunks.value > 0
  return to.value !== null && to.value !== props.draft
})

const { mutateAsync: restore, isLoading: restoring } = useMutation({
  mutation: (ref: HistoryRef) => historyApi.restore($fetch, props.slug, ref),
  onSuccess(result) {
    toast.add({
      title: 'Texte restauré dans le brouillon',
      description: 'Relisez-le, puis publiez pour que les visiteurs le voient.',
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

const { mutateAsync: keep, isLoading: keeping } = useMutation({
  mutation: (name: string) => historyApi.snapshot($fetch, props.slug, name.trim() || undefined),
  onSuccess() {
    toast.add({ title: 'Instantané conservé', icon: 'i-lucide-check', color: 'success' })
    naming.value = false
    label.value = ''
  },
  onError(error: any) {
    toast.add({ title: error?.statusMessage || 'Échec de l\'enregistrement', icon: 'i-lucide-triangle-alert', color: 'error' })
  },
  onSettled: () => queryCache.invalidateQueries({ key: deckKeys.history(props.slug) }),
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Historique"
    :description="`Le brouillon, les versions publiées et les instantanés de ${slug}`"
    :ui="{ content: 'max-w-5xl', body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div class="grid h-full min-h-0 grid-cols-[18rem_minmax(0,1fr)]">
        <!-- The draft, then the entries, newest first. The served version is marked. -->
        <nav
          class="min-h-0 overflow-y-auto border-r border-default"
          aria-label="Brouillon, versions et instantanés"
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
            v-else-if="!entries.length"
            class="p-4 text-sm text-muted"
          >
            Aucune version ni instantané.
          </p>
          <ul v-else>
            <li
              v-for="entry in entries"
              :key="`${entry.kind}-${entry.id}`"
            >
              <button
                type="button"
                class="flex w-full flex-col gap-0.5 border-b border-default px-4 py-3 text-left hover:bg-elevated"
                :class="isSelected(entry) ? 'bg-elevated' : ''"
                :aria-current="isSelected(entry) ? 'true' : undefined"
                @click="selected = { kind: entry.kind, id: entry.id }"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="flex min-w-0 items-center gap-1.5 text-sm font-medium text-highlighted">
                    <UIcon
                      :name="entry.kind === 'version' ? 'i-lucide-send' : 'i-lucide-camera'"
                      class="size-3.5 shrink-0 text-muted"
                    />
                    <span class="truncate">{{ title(entry) }}</span>
                  </span>
                  <UBadge
                    v-if="entry.kind === 'version'"
                    :label="entry.current ? 'En ligne' : 'Publiée'"
                    :color="entry.current ? 'primary' : 'neutral'"
                    variant="subtle"
                    size="sm"
                  />
                </span>
                <span class="text-xs text-muted">{{ detail(entry) }}</span>
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
              v-if="selected === 'draft' && !naming && !confirming"
              label="Conserver un instantané"
              icon="i-lucide-camera"
              color="neutral"
              variant="outline"
              size="sm"
              @click="naming = true"
            />
            <UButton
              v-if="!confirming && !naming"
              :label="restoreLabel"
              icon="i-lucide-history"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!restorable"
              @click="confirming = true"
            />
          </div>

          <!-- A named snapshot of the draft, kept out of the pruning. -->
          <form
            v-if="naming"
            class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-3"
            @submit.prevent="keep(label)"
          >
            <UInput
              v-model="label"
              placeholder="Nom de l'instantané (facultatif)"
              class="w-72"
              size="sm"
              maxlength="80"
              autofocus
              aria-label="Nom de l'instantané"
            />
            <UButton
              type="submit"
              label="Conserver"
              size="sm"
              :loading="keeping"
            />
            <UButton
              label="Annuler"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="naming = false"
            />
          </form>

          <ActionNotice
            v-if="confirming && restoreRef !== null"
            class="m-4"
            title="Remplacer le brouillon par ce texte ?"
            description="Le brouillon actuel reste dans l'historique comme instantané. Les visiteurs gardent la version en ligne jusqu'à la prochaine publication."
          >
            <UButton
              label="Restaurer"
              color="warning"
              size="sm"
              :loading="restoring"
              @click="restore(restoreRef)"
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

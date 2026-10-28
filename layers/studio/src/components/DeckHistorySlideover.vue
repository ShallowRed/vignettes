<script setup lang="ts">
import type { HistoryEntry } from '#shared/presentations'
import type { HistoryRef } from '../api'
import { useMutation, useQuery } from '@pinia/colada'
import { historyApi } from '../api'
import { useSnapshotCapture } from '../composables/useSnapshotCapture'
import { historyEntryQuery, historyQuery } from '../queries'
import { changedLines } from '../utils/changed-lines'
import { diffStructure } from '../utils/diff-skeleton'
import { historyRows } from '../utils/history-rows'
import { requestErrorMessage } from '../utils/request-error'
import { saveTextFile } from '../utils/save-file'

/**
 * The history of a deck: the draft, then the published versions and the
 * snapshots of the draft, the unnamed snapshots folded between them. Each entry
 * shows what it changed: the draft against the version the visitors see, any
 * other entry against the one before it.
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

const { t, locale } = useI18n()
const toast = useToast()

const listQ = useQuery({ ...historyQuery($fetch, props.slug), enabled: () => open.value })
const entries = computed(() => listQ.data.value ?? [])
const current = computed(() => entries.value.find(e => e.kind === 'version' && e.current) ?? null)

type Selection = 'draft' | HistoryRef
const selected = ref<Selection | null>(null)
const confirming = ref(false)
const naming = ref(false)
// The runs of unnamed snapshots unfolded since the panel opened.
const unfolded = ref(new Set<string>())
// The shape of each diff seen since the panel opened (see `structure`), with
// the texts it was computed from: the draft may still be syncing when the
// panel opens.
const structures = new Map<string, { from: string, to: string, structure: ReturnType<typeof diffStructure> }>()
// The draft is shown on open; closing forgets the selection and the diff
// structures, since the draft may change before the next opening.
watch(open, (now) => {
  structures.clear()
  selected.value = now ? 'draft' : null
  confirming.value = false
  naming.value = false
  unfolded.value = new Set()
})
watch(selected, () => {
  confirming.value = false
})
// The form captures the draft, shown selected above it.
watch(naming, (now) => {
  if (now) {
    selected.value = 'draft'
    confirming.value = false
  }
})

const same = (a: HistoryRef, b: HistoryRef) => a.kind === b.kind && a.id === b.id
const isSelected = (entry: HistoryEntry) => selected.value !== null && selected.value !== 'draft' && same(selected.value, entry)

// The list as drawn: each entry, and each run of unnamed snapshots as one
// toggle, unfolded on demand or when it holds the selected entry.
type ListItem
  = | { kind: 'entry', key: string, entry: HistoryEntry, nested: boolean }
    | { kind: 'fold', key: string, count: number, open: boolean }
const listItems = computed<ListItem[]>(() => historyRows(entries.value).flatMap((row): ListItem[] => {
  if (row.kind === 'entry')
    return [{ kind: 'entry', key: `${row.entry.kind}-${row.entry.id}`, entry: row.entry, nested: false }]
  const open = unfolded.value.has(row.key) || row.entries.some(e => isSelected(e))
  return [
    { kind: 'fold', key: row.key, count: row.entries.length, open },
    ...(open ? row.entries.map(entry => ({ kind: 'entry' as const, key: `${entry.kind}-${entry.id}`, entry, nested: true })) : []),
  ]
}))
function toggle(key: string) {
  const next = new Set(unfolded.value)
  if (!next.delete(key))
    next.add(key)
  unfolded.value = next
}

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
// The selected text as a Markdown file, named after the draft or the date of the entry.
function download() {
  if (to.value === null)
    return
  const entry = selectedEntry.value
  const name = entry
    ? `${props.slug}-${entry.kind === 'version' ? 'version' : 'snapshot'}-${new Date(entry.at).toISOString().slice(0, 10)}.md`
    : t('catalog.deck.draftFileName', { slug: props.slug })
  saveTextFile(name, to.value, 'text/markdown')
}
const firstEntry = computed(() => selected.value !== 'draft' && selected.value !== null && baseRef.value === null)

// The shape of the diff, from the two texts, before the editor draws it: the
// number of changed passages for the summary, and the rows of the skeleton.
// Kept per entry while the panel is open, so coming back to an entry whose
// texts the query cache holds shows it at once.
const selectionKey = (value: Selection) => value === 'draft' ? 'draft' : `${value.kind}:${value.id}`
const structure = computed(() => {
  if (selected.value === null || from.value === null || to.value === null)
    return null
  const key = selectionKey(selected.value)
  const cached = structures.get(key)
  if (cached && cached.from === from.value && cached.to === to.value)
    return cached.structure
  const computed = diffStructure(from.value, to.value)
  structures.set(key, { from: from.value, to: to.value, structure: computed })
  return computed
})
const chunks = computed(() => structure.value?.chunks ?? null)
const skeletonRows = computed(() => structure.value?.rows ?? [])
// The line numbers fill the gutter to its widest number, as the editor does.
const skeletonNumber = (number: number | undefined) => String(number ?? '').padStart(structure.value?.digits ?? 1, ' ')

// The diff area stays blank while the texts load, then the skeleton drawn from
// the diff itself takes the editor's grid for a moment, and the editor replaces
// it without moving anything. One skeleton, one shape.
const SKELETON_MIN_MS = 300
const skeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined
watch(structure, (now) => {
  clearTimeout(skeletonTimer)
  skeleton.value = now !== null
  if (now !== null)
    skeletonTimer = setTimeout(() => skeleton.value = false, SKELETON_MIN_MS)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(skeletonTimer))
const loading = computed(() => selected.value !== null && structure.value === null)

function when(at: number): string {
  return new Date(at).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}
// The versions are numbered in the order of their publication; the list holds the newest first.
const versionNumbers = computed(() => {
  const versions = entries.value.filter(e => e.kind === 'version')
  return new Map(versions.map((entry, index) => [entry.id, versions.length - index]))
})
function title(entry: HistoryEntry): string {
  if (entry.kind === 'version') {
    const version = versionNumbers.value.get(entry.id)
    return t(entry.current ? 'deck.history.versionOnline' : 'deck.history.version', { version })
  }
  return entry.label ? entry.label : when(entry.at)
}
function icon(entry: HistoryEntry): string {
  if (entry.kind === 'version')
    return 'i-lucide-send'
  return entry.label ? 'i-lucide-bookmark' : 'i-lucide-camera'
}
function detail(entry: HistoryEntry): string {
  if (entry.kind === 'version')
    return t('deck.history.detailVersion', { author: entry.publishedBy, when: when(entry.at) })
  const authors = entry.authors.join(', ')
  if (entry.label)
    return authors ? t('deck.history.detailLabeledSnapshotAuthors', { authors, when: when(entry.at) }) : when(entry.at)
  return authors || t('deck.history.detailSnapshotAutomatic')
}

const heading = computed(() => {
  if (selected.value === 'draft')
    return t('deck.history.draft')
  const entry = selectedEntry.value
  if (!entry)
    return ''
  if (entry.kind === 'version')
    return t(entry.current ? 'deck.history.headingCurrentVersion' : 'deck.history.headingVersion', { version: versionNumbers.value.get(entry.id), when: when(entry.at) })
  return entry.label
    ? t('deck.history.headingLabeledSnapshot', { label: entry.label, when: when(entry.at) })
    : t('deck.history.headingSnapshot', { when: when(entry.at) })
})
const summary = computed(() => {
  if (selected.value === 'draft' && !current.value)
    return t('deck.history.summaryNeverPublished')
  if (firstEntry.value)
    return t('deck.history.summaryFirstEntry')
  if (from.value === null || to.value === null)
    return ''
  const lines = changedLines(from.value, to.value)
  const against = selected.value === 'draft' ? 'current' : selectedEntry.value?.kind === 'version' ? 'version' : 'entry'
  if (lines === 0) {
    return t({
      current: 'deck.history.summaryIdenticalToCurrent',
      version: 'deck.history.summaryIdenticalToPreviousVersion',
      entry: 'deck.history.summaryIdenticalToPreviousEntry',
    }[against])
  }
  return t({
    current: 'deck.history.summaryChangedSinceCurrent',
    version: 'deck.history.summaryChangedByPublication',
    entry: 'deck.history.summaryChangedSincePreviousEntry',
  }[against], lines)
})
// The legend keeps its line whatever the state, so the diff never moves.
const baseEntry = computed(() => {
  const base = baseRef.value
  return base ? entries.value.find(e => same(e, base)) ?? null : null
})
function textName(entry: HistoryEntry | null): string {
  if (!entry)
    return t('deck.history.textDraft')
  return t(entry.kind === 'version' ? 'deck.history.textVersion' : 'deck.history.textSnapshot', { when: when(entry.at) })
}
const legend = computed(() => {
  if (chunks.value === null)
    return ''
  if (firstEntry.value)
    return t('deck.history.legendFirstEntry')
  if (chunks.value === 0)
    return t('deck.history.legendIdentical', { to: textName(selectedEntry.value), from: textName(baseEntry.value) })
  return selected.value === 'draft'
    ? t('deck.history.legendDraft')
    : t('deck.history.legendEntry')
})

// What a restore would put in the draft, and whether that changes anything.
const restoreRef = computed<HistoryRef | null>(() => selected.value === 'draft' ? (current.value ? { kind: 'version', id: current.value.id } : null) : targetRef.value)
const restoreLabel = computed(() => {
  if (restoreRef.value?.kind === 'version' && restoreRef.value.id === current.value?.id)
    return t('deck.history.restoreCurrent')
  return restoreRef.value?.kind === 'snapshot' ? t('deck.history.restoreSnapshot') : t('deck.history.restoreVersion')
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
      title: t('deck.history.restored'),
      description: t('deck.history.restoredDescription'),
      icon: 'i-lucide-check',
      color: 'success',
    })
    emit('restored', result.stamp)
    open.value = false
  },
  onError(error: any) {
    toast.add({ title: requestErrorMessage(error, t('deck.history.restoreFailed')), icon: 'i-lucide-triangle-alert', color: 'error' })
  },
})

const { capture, capturing } = useSnapshotCapture(props.slug, () => {
  naming.value = false
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('deck.history.title')"
    :description="t('deck.history.description')"
    :ui="{ content: 'max-w-5xl', body: 'p-0 sm:p-0' }"
  >
    <template #actions>
      <UButton
        v-if="!naming"
        :label="t('deck.history.captureSnapshot')"
        icon="i-lucide-camera"
        color="neutral"
        variant="outline"
        size="sm"
        class="ms-auto me-10"
        @click="() => { naming = true }"
      />
    </template>
    <template #body>
      <div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-rows-1 md:grid-cols-[18rem_minmax(0,1fr)]">
        <!-- The draft, then the entries, newest first. The served version is marked. -->
        <nav
          class="max-h-56 min-h-0 overflow-y-auto border-b border-default md:max-h-none md:border-b-0 md:border-r"
          :aria-label="t('deck.history.listLabel')"
        >
          <button
            type="button"
            class="flex w-full flex-col gap-0.5 border-b border-default px-4 py-3 text-left hover:bg-elevated"
            :class="selected === 'draft' ? 'bg-elevated' : ''"
            :aria-current="selected === 'draft' ? 'true' : undefined"
            @click="selected = 'draft'"
          >
            <span class="flex items-center justify-between gap-2">
              <span class="text-sm font-medium text-highlighted">{{ t('deck.history.draft') }}</span>
              <UBadge
                v-if="unpublished"
                :label="t('deck.history.unpublished')"
                color="warning"
                variant="subtle"
                size="sm"
              />
            </span>
            <span class="text-xs text-muted">{{ unpublished === false ? t('deck.history.draftIdentical') : t('deck.history.draftHint') }}</span>
          </button>
          <p
            v-if="listQ.status.value === 'pending'"
            class="p-4 text-sm text-muted"
          >
            {{ t('deck.history.loading') }}
          </p>
          <p
            v-else-if="!entries.length"
            class="p-4 text-sm text-muted"
          >
            {{ t('deck.history.empty') }}
          </p>
          <ul v-else>
            <li
              v-for="item in listItems"
              :key="item.key"
            >
              <button
                v-if="item.kind === 'fold'"
                type="button"
                class="flex w-full items-center gap-1.5 border-b border-default px-4 py-2 text-left text-xs text-muted hover:bg-elevated"
                :aria-expanded="item.open"
                @click="toggle(item.key)"
              >
                <UIcon
                  :name="item.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-3.5 shrink-0"
                />
                {{ t('deck.history.unnamedSnapshots', item.count) }}
              </button>
              <button
                v-else
                type="button"
                class="flex w-full flex-col gap-0.5 border-b border-default py-3 pr-4 text-left hover:bg-elevated"
                :class="[isSelected(item.entry) ? 'bg-elevated' : '', item.nested ? 'pl-9' : 'pl-4']"
                :aria-current="isSelected(item.entry) ? 'true' : undefined"
                @click="selected = { kind: item.entry.kind, id: item.entry.id }"
              >
                <span
                  class="flex min-w-0 items-center gap-1.5 text-sm text-highlighted"
                  :class="item.entry.kind === 'snapshot' && item.entry.label ? 'font-semibold' : 'font-medium'"
                >
                  <UIcon
                    :name="icon(item.entry)"
                    class="size-3.5 shrink-0"
                    :class="item.entry.kind === 'version' && item.entry.current ? 'text-primary' : 'text-muted'"
                  />
                  <span class="truncate">{{ title(item.entry) }}</span>
                </span>
                <span class="text-xs text-muted">{{ detail(item.entry) }}</span>
              </button>
            </li>
          </ul>
        </nav>

        <!-- The selected entry, what it changed, and its restoration. -->
        <section
          class="flex min-h-0 min-w-0 flex-col"
          :aria-label="t('deck.history.selectedLabel')"
        >
          <div
            v-if="heading"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-default px-4 py-2"
          >
            <div class="min-w-0 flex-1 basis-full sm:basis-0">
              <p class="text-sm font-medium text-highlighted">
                {{ heading }}
              </p>
              <USkeleton
                v-if="loading && !summary"
                class="mt-1 h-3 w-56 rounded-sm"
              />
              <p
                v-else
                class="text-xs text-muted"
              >
                {{ summary }}
              </p>
            </div>
            <UButton
              v-if="!confirming && !naming"
              :label="t('deck.history.download')"
              icon="i-lucide-file-down"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="to === null"
              @click="download"
            />
            <UButton
              v-if="!confirming && !naming"
              :label="restoreLabel"
              icon="i-lucide-history"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!restorable"
              @click="() => { confirming = true }"
            />
          </div>

          <!-- A named snapshot of the draft, kept out of the pruning. -->
          <SnapshotNameForm
            v-if="naming"
            class="border-b border-default px-4 py-3"
            :loading="capturing"
            cancelable
            @capture="capture"
            @cancel="() => { naming = false }"
          />

          <ActionNotice
            v-if="confirming && restoreRef !== null"
            class="m-4"
            :title="t('deck.history.confirmTitle')"
            :description="t('deck.history.confirmDescription')"
          >
            <UButton
              :label="t('common.actions.restore')"
              color="warning"
              size="sm"
              :loading="restoring"
              @click="() => { if (restoreRef) restore(restoreRef) }"
            />
            <UButton
              :label="t('common.actions.cancel')"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="() => { confirming = false }"
            />
          </ActionNotice>

          <div
            v-if="selected !== null"
            class="min-h-9 px-4 py-2"
          >
            <USkeleton
              v-if="loading"
              class="h-3 w-80 rounded-sm"
            />
            <p
              v-else
              class="text-xs text-muted"
            >
              {{ legend }}
            </p>
          </div>

          <!-- The diff mounts under the skeleton, which lifts once it settled. -->
          <div class="relative min-h-0 flex-1 overflow-hidden">
            <div
              v-if="skeleton"
              class="diff-skeleton absolute inset-0 z-10 bg-default"
              aria-hidden="true"
            >
              <template
                v-for="(row, index) in skeletonRows"
                :key="index"
              >
                <div
                  v-if="row.kind === 'band'"
                  class="diff-skeleton__line"
                >
                  <span class="diff-skeleton__number">{{ skeletonNumber(undefined) }}</span>
                  <div class="diff-skeleton__band" />
                </div>
                <div
                  v-else
                  class="diff-skeleton__line"
                  :class="`diff-skeleton__line--${row.tone}`"
                >
                  <span class="diff-skeleton__number">{{ skeletonNumber(row.number) }}</span>
                  <div class="diff-skeleton__text">
                    <span v-if="row.text">{{ row.text }}</span>
                    <template v-else>
                      &ZeroWidthSpace;
                    </template>
                  </div>
                </div>
              </template>
            </div>
            <DeckVersionDiff
              v-if="from !== null && to !== null"
              :from="from"
              :to="to"
              class="transition-opacity duration-200"
              :class="skeleton ? 'opacity-0' : 'opacity-100'"
            />
          </div>
        </section>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
/* The editor's grid: 8px above the first line, a number gutter sized by its
   widest number (40px at least, the bands after it too), lines in the writer's monospace at 21px that
   wrap like the editor's (same font, same width, same breaking rules, same
   paddings), a 26.8px band with 2px around it. The text of each line is drawn
   transparent on a grey run, so the rows wrap exactly where the editor will
   wrap them; the numbers stay invisible and only size the gutter. Nothing
   else: the colors of the diff belong to the diff. The skeleton scrolls like
   the editor, with the same room under the last line, so a classic scrollbar
   takes the same width on both. */
.diff-skeleton {
  padding: 8px 0 50vh;
  overflow-y: auto;
}

.diff-skeleton__line {
  display: flex;
  align-items: flex-start;
}

.diff-skeleton__number {
  flex: none;
  box-sizing: border-box;
  min-width: 40px;
  padding: 0 4px 0 12px;
  font: 13px/21px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  white-space: pre;
  text-align: right;
  color: transparent;
}

.diff-skeleton__text {
  flex: 1;
  min-width: 0;
  padding: 0 16px 0 8px;
  font: 13px/21px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  tab-size: 4;
  white-space: break-spaces;
  word-break: break-word;
  overflow-wrap: anywhere;
  color: transparent;
}

.diff-skeleton__text > span {
  border-radius: 3px;
  background: var(--ui-bg-elevated);
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.diff-skeleton__line--removed .diff-skeleton__text {
  padding: 0;
  margin-left: 6px;
}

.diff-skeleton__band {
  display: flex;
  align-items: center;
  flex: 1;
  height: 26.8px;
  margin: 2px 0;
  background: var(--ui-bg-elevated);
}
</style>

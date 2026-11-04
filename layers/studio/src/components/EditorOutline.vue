<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { OutlineEdit, OutlineSlide, ParserId } from '@vignettes/core/deck'
import type { EditorHistory } from '../composables/useEditorHistory'
import { runScopeHandlers } from '@codemirror/view'
import { deckOutline, duplicateEdit, moveStackEdit, parserIdFor, removeEdit, renameChange, splitFrontmatter } from '@vignettes/core/deck'
import { EDITOR_TEXT } from '../utils/editor-layout'
import { dropPlace, OUTLINE_DRAG_TYPE, outlineTransaction, undoNotices } from '../utils/editor-outline'

// The outline of the deck beside the source: one row per slide, the vertical
// slides under their stack. A row of a stack moves, copies and removes the
// whole stack; a vertical row copies and removes its slide. Every edit is a
// change of the text, computed by the deck core on the text of the editor.
const props = defineProps<{
  view?: EditorView
  /** The slide of the caret, which the outline marks. */
  cursorSlide: { h: number, v: number }
  writable: boolean
  history: EditorHistory
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const toast = useToast()
const { refused } = useRefusedText()
const text = inject(EDITOR_TEXT, ref(''))

interface Row extends OutlineSlide {
  number: number
  label: string
  /** The row stands for a stack of several slides. */
  stack: boolean
}

const outline = computed(() => deckOutline(text.value, parserIdFor(splitFrontmatter(text.value).data)))
const stackCount = computed(() => new Set(outline.value.map(slide => slide.h)).size)
const rows = computed<Row[]>(() => outline.value.map((slide, index) => ({
  ...slide,
  number: index + 1,
  label: slide.title?.text || t('editor.outline.untitled'),
  stack: slide.v === 0 && outline.value.some(other => other.h === slide.h && other.v > 0),
})))
const isCurrent = (row: Row) => row.h === props.cursorSlide.h && row.v === props.cursorSlide.v
// One row takes the focus at a time; the arrows move it.
const focused = ref<{ h: number, v: number } | null>(null)

// ── Edits ────────────────────────────────────────────────────────────────────

/** Sends the edit `build` computes on the text of the editor; an edit that would change the slides of the deck is refused. */
function send(build: (doc: string, parser: ParserId) => OutlineEdit | undefined): boolean {
  const view = props.view
  if (!view || !props.writable)
    return false
  const doc = view.state.doc.toString()
  const edit = build(doc, parserIdFor(splitFrontmatter(doc).data))
  if (!edit) {
    toast.add({ title: t('editor.outline.refused'), icon: 'i-lucide-triangle-alert', color: 'warning' })
    return false
  }
  props.history.write(view, outlineTransaction(edit))
  return true
}

function move(row: Row, to: number) {
  if (send((doc, parser) => moveStackEdit(doc, parser, row.h, to)))
    focusLater(to, 0)
}

function duplicate(row: Row) {
  if (send((doc, parser) => duplicateEdit(doc, parser, row.h, row.v)))
    focusLater(row.v === 0 ? row.h + 1 : row.h, row.v === 0 ? 0 : row.v + 1)
}

// The notice of a removal offers to undo it until the next change of this tab.
const notices = undoNotices(toast, () => props.history.changes())
function remove(row: Row) {
  if (!send((doc, parser) => removeEdit(doc, parser, row.h, row.v)))
    return
  notices.show({
    title: t(row.stack ? 'editor.outline.removedStack' : 'editor.outline.removed'),
    icon: 'i-lucide-trash-2',
    duration: 10000,
    actions: [{ label: t('editor.outline.undo'), icon: 'i-lucide-undo-2', color: 'neutral', variant: 'outline', onClick: () => props.history.undo() }],
  })
}

onBeforeUnmount(() => notices.close())

function select(row: Row) {
  focused.value = { h: row.h, v: row.v }
  props.view?.dispatch({ selection: { anchor: row.contentFrom }, scrollIntoView: true })
}

// ── Renaming ─────────────────────────────────────────────────────────────────

/**
 * A rename in progress: `written` is the source of the title it started from,
 * `shown` that source on one line, as the field shows it, and `value` the
 * text of the field.
 */
interface Renaming {
  h: number
  v: number
  value: string
  shown: string
  written: string
}

const renaming = ref<Renaming | null>(null)
const renameInput = useTemplateRef<{ inputRef?: HTMLInputElement }[]>('renameInput')

function startRename(row: Row) {
  if (!props.writable || !row.title)
    return
  const written = text.value.slice(row.title.from, row.title.to)
  const shown = written.replace(/\s*\n\s*/g, ' ')
  renaming.value = { h: row.h, v: row.v, value: shown, shown, written }
  nextTick(() => renameInput.value?.[0]?.inputRef?.select())
}

// Enter gives the focus back to the row; a blur leaves it where it goes.
function commitRename(refocus: boolean) {
  const current = renaming.value
  renaming.value = null
  if (!current)
    return
  if (refocus)
    focusLater(current.h, current.v)
  const view = props.view
  if (!view || !props.writable || current.value === current.shown)
    return
  const doc = view.state.doc.toString()
  const change = renameChange(doc, parserIdFor(splitFrontmatter(doc).data), current.h, current.v, current.written, current.value)
  if (typeof change === 'object')
    props.history.write(view, outlineTransaction({ changes: [change] }))
  else if (change)
    refused(change, current.value)
}

// A blur from leaving the window keeps the rename, which the field holds again on return.
function onRenameBlur() {
  if (document.hasFocus())
    commitRename(false)
}

function cancelRename() {
  const current = renaming.value
  renaming.value = null
  if (current)
    focusLater(current.h, current.v)
}

// ── Keyboard ─────────────────────────────────────────────────────────────────

const list = useTemplateRef<HTMLElement>('list')
const tabStop = (row: Row) => focused.value ? row.h === focused.value.h && row.v === focused.value.v : isCurrent(row)

function focusLater(h: number, v: number) {
  focused.value = { h, v }
  nextTick(() => list.value?.querySelector<HTMLElement>(`[data-slide="${h}.${v}"]`)?.focus())
}

function onKeydown(event: KeyboardEvent, row: Row, index: number) {
  // The undo and redo keys of the editor, which acts on the same text.
  if (props.view && (event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    if (runScopeHandlers(props.view, event, 'editor'))
      event.preventDefault()
    return
  }
  const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
  if (vertical && event.altKey) {
    event.preventDefault()
    const to = row.h + vertical
    if (props.writable && row.v === 0 && to >= 0 && to < stackCount.value)
      move(row, to)
    return
  }
  const next = vertical ? rows.value[index + vertical] : event.key === 'Home' ? rows.value[0] : event.key === 'End' ? rows.value.at(-1) : undefined
  if (next) {
    event.preventDefault()
    focusLater(next.h, next.v)
  }
  else if (event.key === 'F2') {
    event.preventDefault()
    startRename(row)
  }
}

// ── Drag and drop ────────────────────────────────────────────────────────────

const dragged = ref<number | null>(null)
const drop = ref<{ h: number, after: boolean } | null>(null)

function onDragStart(event: DragEvent, row: Row) {
  if (!event.dataTransfer)
    return
  event.dataTransfer.setData(OUTLINE_DRAG_TYPE, String(row.h))
  event.dataTransfer.effectAllowed = 'move'
  dragged.value = row.h
}

// A drop on the upper half of the first row of a stack goes before it, anywhere else on the stack after it.
function onDragOver(event: DragEvent, row: Row) {
  if (dragged.value === null || !event.dataTransfer?.types.includes(OUTLINE_DRAG_TYPE))
    return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  drop.value = { h: row.h, after: row.v > 0 || event.clientY > box.top + box.height / 2 }
}

function onDrop(event: DragEvent) {
  const from = dragged.value
  const target = drop.value
  onDragEnd()
  if (from === null || !target)
    return
  event.preventDefault()
  const to = dropPlace(from, target)
  const row = rows.value.find(entry => entry.h === from && entry.v === 0)
  if (row && to !== from)
    move(row, to)
}

function onDragEnd() {
  dragged.value = null
  drop.value = null
}

const lastOfStack = (row: Row) => !rows.value.some(other => other.h === row.h && other.v > row.v)
function dropClass(row: Row) {
  return {
    'is-drop-before': drop.value?.h === row.h && !drop.value.after && row.v === 0,
    'is-drop-after': drop.value?.h === row.h && drop.value.after && lastOfStack(row),
  }
}

// The row whose menu is open: an entry closes it before its edit changes the
// rows, so that the menu does not stay open on the row that takes its place.
const openMenu = ref<string | null>(null)
// A row is its place and its title: a menu open on a row closes when another
// person's edit gives that place to another slide.
const rowKey = (row: Row) => `${row.h}.${row.v}:${row.label}`

function menu(row: Row): DropdownMenuItem[][] {
  const entry = (action: () => void) => () => {
    openMenu.value = null
    action()
  }
  return [
    [
      ...(row.title ? [{ label: t('editor.outline.rename'), icon: 'i-lucide-pencil', onSelect: entry(() => startRename(row)) }] : []),
      { label: t(row.stack ? 'editor.outline.duplicateStack' : 'editor.outline.duplicate'), icon: 'i-lucide-copy', onSelect: entry(() => duplicate(row)) },
    ],
    ...(row.v === 0
      ? [[
          { label: t('editor.outline.moveUp'), icon: 'i-lucide-arrow-up', disabled: row.h === 0, onSelect: entry(() => move(row, row.h - 1)) },
          { label: t('editor.outline.moveDown'), icon: 'i-lucide-arrow-down', disabled: row.h === stackCount.value - 1, onSelect: entry(() => move(row, row.h + 1)) },
        ]]
      : []),
    [{ label: t(row.stack ? 'editor.outline.removeStack' : 'editor.outline.remove'), icon: 'i-lucide-trash-2', color: 'error' as const, disabled: row.v === 0 && stackCount.value === 1, onSelect: entry(() => remove(row)) }],
  ]
}

// A menu gives the focus back to its button when it closes, unless a rename takes it.
function keepRenameFocus(event: Event) {
  if (renaming.value)
    event.preventDefault()
}
</script>

<template>
  <nav
    class="editor-outline flex flex-col min-h-0 bg-default"
    :aria-label="t('editor.outline.title')"
  >
    <div class="flex items-center gap-1 h-10 ps-3 pe-1 shrink-0 border-b border-default">
      <span class="flex-1 text-sm font-medium text-highlighted">{{ t('editor.outline.title') }}</span>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :aria-label="t('editor.outline.close')"
        @click="emit('close')"
      />
    </div>
    <p
      v-if="!rows.length"
      class="p-3 text-sm text-muted"
    >
      {{ t('editor.outline.empty') }}
    </p>
    <ol
      v-else
      ref="list"
      class="flex-1 min-h-0 overflow-y-auto p-1.5"
      @dragleave.self="drop = null"
    >
      <li
        v-for="(row, index) in rows"
        :key="`${row.h}.${row.v}`"
      >
        <div
          class="editor-outline__row relative flex items-center h-8 pe-1 rounded-md text-sm"
          :class="[
            isCurrent(row) ? 'bg-elevated text-highlighted font-medium' : 'text-default hover:bg-elevated/60',
            { 'opacity-50': dragged === row.h },
            dropClass(row),
          ]"
          :draggable="writable && row.v === 0 && !renaming"
          @dragstart="onDragStart($event, row)"
          @dragover="onDragOver($event, row)"
          @drop="onDrop"
          @dragend="onDragEnd"
        >
          <div
            v-if="renaming && renaming.h === row.h && renaming.v === row.v"
            class="flex flex-1 min-w-0 items-center gap-2"
            :class="row.v > 0 ? 'ps-7' : 'ps-1.5'"
          >
            <span class="w-5 shrink-0 text-xs text-muted tabular-nums text-end">{{ row.number }}</span>
            <UInput
              ref="renameInput"
              v-model="renaming.value"
              size="xs"
              class="flex-1 min-w-0"
              :aria-label="t('editor.outline.renameLabel')"
              @keydown.enter.prevent="commitRename(true)"
              @keydown.escape.prevent="cancelRename"
              @blur="onRenameBlur"
            />
          </div>
          <button
            v-else
            type="button"
            :data-slide="`${row.h}.${row.v}`"
            class="editor-outline__slide flex flex-1 min-w-0 h-full items-center gap-2 text-start cursor-pointer focus:outline-none"
            :class="row.v > 0 ? 'ps-7' : 'ps-1.5'"
            :tabindex="tabStop(row) ? 0 : -1"
            :aria-current="isCurrent(row) ? 'true' : undefined"
            :aria-label="t('editor.outline.slide', { number: row.number, title: row.label })"
            @click="select(row)"
            @dblclick="startRename(row)"
            @keydown="onKeydown($event, row, index)"
          >
            <span class="w-5 shrink-0 text-xs text-muted tabular-nums text-end">{{ row.number }}</span>
            <span
              class="flex-1 min-w-0 truncate"
              :class="{ 'text-muted italic': !row.title }"
            >{{ row.label }}</span>
          </button>
          <UDropdownMenu
            v-if="writable"
            :open="openMenu === rowKey(row)"
            :items="menu(row)"
            :content="{ align: 'start', onCloseAutoFocus: keepRenameFocus }"
            @update:open="(open: boolean) => { openMenu = open ? rowKey(row) : null }"
          >
            <UButton
              icon="i-lucide-ellipsis"
              color="neutral"
              variant="ghost"
              size="xs"
              class="editor-outline__menu"
              :tabindex="tabStop(row) ? 0 : -1"
              :aria-label="t('editor.outline.actions', { title: row.label })"
            />
          </UDropdownMenu>
        </div>
      </li>
    </ol>
  </nav>
</template>

<style scoped>
.editor-outline__row:has(.editor-outline__slide:focus-visible) {
  outline: 2px solid var(--ui-primary);
  outline-offset: -2px;
}

/* The place a dragged stack takes: a straight line on the edge between two rows. */
.editor-outline__row.is-drop-before::before,
.editor-outline__row.is-drop-after::after {
  content: '';
  position: absolute;
  inset-inline: 0;
  height: 2px;
  background: var(--ui-primary);
  pointer-events: none;
}

.editor-outline__row.is-drop-before::before {
  top: -1px;
}

.editor-outline__row.is-drop-after::after {
  bottom: -1px;
}

/* With a pointer that hovers, the menu of a row shows on that row, its focus and the current slide. */
@media (hover: hover) {
  .editor-outline__row:not(:hover, :focus-within, :has([aria-current])) .editor-outline__menu {
    opacity: 0;
  }
}
</style>

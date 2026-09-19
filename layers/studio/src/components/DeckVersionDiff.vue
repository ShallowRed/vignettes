<script setup lang="ts">
import type { Extension } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { unifiedMergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { DIFF_CONFIG, diffFolding, foldIdenticalPassages } from '../utils/diff-folding'
import { editorTheme } from '../utils/editor-theme'

/**
 * A read-only unified diff of two markdown texts, in the writer's theme: the
 * lines of `from` that `to` lacks are struck, the lines `to` adds are marked.
 * Identical passages fold and unfold. Two identical texts are shown plainly.
 */
const props = defineProps<{ from: string, to: string }>()

const { t, locale } = useI18n()

// Lucide chevrons-up-down and chevrons-down-up, as masks so they take the text color.
const icon = (paths: string) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`)}")`
const UNFOLD_ICON = icon('<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>')
const FOLD_ICON = icon('<path d="m7 20 5-5 5 5"/><path d="m7 4 5 5 5-5"/>')

/**
 * The colors of the diff and of the fold bands. The changes carry the strong
 * colors, the bands stay neutral with the accent on their icon: reading the
 * diff matters more than folding it.
 */
function diffTheme(dark: boolean): Extension {
  const colors = dark
    ? {
        deletedLine: 'rgba(248, 81, 73, 0.16)',
        deletedText: 'rgba(248, 81, 73, 0.45)',
        deletedBar: '#f85149',
        addedLine: 'rgba(46, 160, 67, 0.16)',
        addedText: 'rgba(46, 160, 67, 0.45)',
        addedBar: '#3fb950',
        bandText: '#a1a1aa',
        bandBackground: '#ffffff0a',
        bandBorder: '#3f3f46',
        bandHover: '#ffffff14',
        accent: '#60a5fa',
      }
    : {
        deletedLine: '#ffebe9',
        deletedText: 'rgba(255, 129, 130, 0.45)',
        deletedBar: '#cf222e',
        addedLine: '#dafbe1',
        addedText: 'rgba(74, 194, 107, 0.45)',
        addedBar: '#1a7f37',
        bandText: '#6b7280',
        bandBackground: '#f9fafb',
        bandBorder: '#e5e7eb',
        bandHover: '#f3f4f6',
        accent: '#2563eb',
      }
  return EditorView.theme({
    // `&.cm-merge-b` matches the specificity of the library's own rules. The
    // bar is drawn on the line itself, so it starts where the background does,
    // instead of in the library's separate gutter.
    '&.cm-merge-b .cm-changeGutter': { width: '0', paddingLeft: '0' },
    '&.cm-merge-b .cm-changedLineGutter, &.cm-merge-b .cm-deletedLineGutter': { background: 'transparent' },
    '&.cm-merge-b .cm-deletedChunk': { background: colors.deletedLine, boxShadow: `inset 3px 0 0 ${colors.deletedBar}` },
    '&.cm-merge-b .cm-deletedChunk .cm-deletedText': { background: colors.deletedText },
    '&.cm-merge-b .cm-changedLine': { background: colors.addedLine, boxShadow: `inset 3px 0 0 ${colors.addedBar}` },
    '&.cm-merge-b .cm-changedText': { background: colors.addedText },
    '.diff-fold': {
      'display': 'flex',
      'alignItems': 'center',
      'gap': '8px',
      'width': '100%',
      'margin': '2px 0',
      'padding': '4px 10px',
      'font': '500 12px/1.4 system-ui, sans-serif',
      'textAlign': 'left',
      'color': colors.bandText,
      'background': colors.bandBackground,
      'border': 'none',
      'borderTop': `1px solid ${colors.bandBorder}`,
      'borderBottom': `1px solid ${colors.bandBorder}`,
      'cursor': 'pointer',
      '&:before': {
        content: '""',
        width: '14px',
        height: '14px',
        backgroundColor: colors.accent,
        maskImage: UNFOLD_ICON,
        WebkitMaskImage: UNFOLD_ICON,
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      },
      '&:hover': { background: colors.bandHover, color: colors.accent },
    },
    '.diff-fold--open:before': {
      maskImage: FOLD_ICON,
      WebkitMaskImage: FOLD_ICON,
    },
  }, { dark })
}

const host = ref<HTMLElement>()
const colorMode = useColorMode()
let view: EditorView | undefined

function mount() {
  view?.destroy()
  if (!host.value)
    return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.to,
      extensions: [
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        lineNumbers(),
        markdown(),
        ...(props.from === props.to ? [] : [unifiedMergeView({ original: props.from, mergeControls: false, diffConfig: DIFF_CONFIG }), diffFolding({ unfold: n => t('deck.diff.unfold', { n }), fold: n => t('deck.diff.fold', { n }) })]),
        ...editorTheme(colorMode.value === 'dark' ? 'dark' : 'light'),
        diffTheme(colorMode.value === 'dark'),
      ],
    }),
  })
  if (props.from !== props.to)
    foldIdenticalPassages(view)
}

onMounted(mount)
watch(() => [props.from, props.to, colorMode.value, locale.value], mount)
onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div
    ref="host"
    class="version-diff"
  />
</template>

<style scoped>
/* The editor owns the scrolling, so it knows its viewport from the first paint. */
.version-diff {
  height: 100%;
}

.version-diff :deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}
</style>

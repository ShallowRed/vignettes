<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { getChunks, unifiedMergeView } from '@codemirror/merge'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { editorTheme } from '../utils/editor-theme'

/**
 * A read-only unified diff of two markdown texts, in the writer's theme: the
 * lines of `from` that `to` lacks are struck, the lines `to` adds are marked.
 * Unchanged passages collapse. Reports the number of changed passages. Two
 * identical texts are shown plainly, without the collapse.
 */
const props = defineProps<{ from: string, to: string }>()
const emit = defineEmits<{ chunks: [count: number] }>()

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
        ...(props.from === props.to ? [] : [unifiedMergeView({ original: props.from, mergeControls: false, collapseUnchanged: { margin: 3, minSize: 4 } })]),
        ...editorTheme(colorMode.value === 'dark' ? 'dark' : 'light'),
      ],
    }),
  })
  emit('chunks', getChunks(view.state)?.chunks.length ?? 0)
}

onMounted(mount)
watch(() => [props.from, props.to, colorMode.value], mount)
onBeforeUnmount(() => view?.destroy())
</script>

<template>
  <div
    ref="host"
    class="version-diff"
  />
</template>

<style scoped>
.version-diff :deep(.cm-editor) {
  height: 100%;
  font-size: 13px;
}
</style>

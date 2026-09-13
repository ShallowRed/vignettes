<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import { foldOtherSlides, unfoldAll } from '../utils/editor-slides'

// The foot of the markdown pane: where the caret is in the deck, and how the
// source is shown (folds, line wrapping), with the help.
const props = defineProps<{
  view?: EditorView
  /** 1-based position of the slide under the caret. */
  slide: number
  slideCount: number
}>()

const emit = defineEmits<{ help: [] }>()

const wrap = defineModel<boolean>('wrap', { default: false })

function run(action: (view: EditorView) => unknown) {
  if (props.view) {
    action(props.view)
    props.view.focus()
  }
}
</script>

<template>
  <div class="flex items-center gap-1 h-8 px-2 shrink-0 border-t border-default text-xs text-muted">
    <span class="px-1 tabular-nums">Diapositive {{ slide }} sur {{ slideCount }}</span>
    <div class="flex-1" />
    <UButton
      icon="i-lucide-fold-vertical"
      label="Replier les autres"
      color="neutral"
      variant="ghost"
      size="xs"
      :disabled="!view"
      @click="run(foldOtherSlides)"
    />
    <UButton
      icon="i-lucide-unfold-vertical"
      label="Tout déplier"
      color="neutral"
      variant="ghost"
      size="xs"
      :disabled="!view"
      @click="run(unfoldAll)"
    />
    <USeparator
      orientation="vertical"
      class="h-4 mx-1"
    />
    <UButton
      icon="i-lucide-wrap-text"
      label="Retour à la ligne"
      color="neutral"
      :variant="wrap ? 'soft' : 'ghost'"
      size="xs"
      :aria-pressed="wrap"
      @click="wrap = !wrap"
    />
    <UButton
      icon="i-lucide-circle-help"
      label="Aide"
      color="neutral"
      variant="ghost"
      size="xs"
      @click="emit('help')"
    />
  </div>
</template>

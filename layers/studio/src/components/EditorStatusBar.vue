<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import { useInstanceLinks } from '../composables/useInstanceLinks'
import { foldOtherSlides, unfoldAll } from '../utils/editor-slides'

// The foot of the markdown pane: where the caret is in the deck, how the source
// is shown (folds, line wrapping), the help and the links of the instance.
const props = defineProps<{
  view?: EditorView
  /** 1-based position of the slide under the caret. */
  slide: number
  slideCount: number
}>()

const emit = defineEmits<{ help: [] }>()

const wrap = defineModel<boolean>('wrap', { default: false })

const { t } = useI18n()

const links = useInstanceLinks()

// The buttons show their label from the `@xl` container width; below it they
// keep their icon, with the padding of an icon button, and a tooltip names them.
// The tooltip follows the label the class shows or hides, so the width is
// written in the classes alone.
const BUTTON_UI = { base: '@max-xl:px-1', label: 'hidden @xl:inline' }
const bar = useTemplateRef<HTMLElement>('bar')
const compact = ref(true)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (!bar.value)
    return
  const element = bar.value
  observer = new ResizeObserver(() => {
    compact.value = !element.querySelector('[data-slot="label"]')?.checkVisibility()
  })
  observer.observe(element)
})
onBeforeUnmount(() => observer?.disconnect())

function run(action: (view: EditorView) => unknown) {
  if (props.view) {
    action(props.view)
    props.view.focus()
  }
}
</script>

<template>
  <div
    ref="bar"
    class="@container flex items-center gap-1 h-8 px-2 shrink-0 border-t border-default text-xs text-muted"
  >
    <span class="px-1 tabular-nums whitespace-nowrap">{{ t('editor.statusBar.slidePosition', { slide, total: slideCount }) }}</span>
    <div class="flex-1" />
    <UTooltip
      :text="t('editor.statusBar.foldOthers')"
      :disabled="!compact"
    >
      <UButton
        icon="i-lucide-fold-vertical"
        :label="t('editor.statusBar.foldOthers')"
        :aria-label="t('editor.statusBar.foldOthers')"
        :ui="BUTTON_UI"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!view"
        @click="run(foldOtherSlides)"
      />
    </UTooltip>
    <UTooltip
      :text="t('editor.statusBar.unfoldAll')"
      :disabled="!compact"
    >
      <UButton
        icon="i-lucide-unfold-vertical"
        :label="t('editor.statusBar.unfoldAll')"
        :aria-label="t('editor.statusBar.unfoldAll')"
        :ui="BUTTON_UI"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="!view"
        @click="run(unfoldAll)"
      />
    </UTooltip>
    <USeparator
      orientation="vertical"
      class="h-4 mx-1"
    />
    <UTooltip
      :text="t('editor.statusBar.wrapLines')"
      :disabled="!compact"
    >
      <UButton
        icon="i-lucide-wrap-text"
        :label="t('editor.statusBar.wrapLines')"
        :aria-label="t('editor.statusBar.wrapLines')"
        :ui="BUTTON_UI"
        color="neutral"
        :variant="wrap ? 'soft' : 'ghost'"
        size="xs"
        :aria-pressed="wrap"
        @click="() => { wrap = !wrap }"
      />
    </UTooltip>
    <UTooltip
      :text="t('editor.statusBar.help')"
      :disabled="!compact"
    >
      <UButton
        icon="i-lucide-circle-help"
        :label="t('editor.statusBar.help')"
        :aria-label="t('editor.statusBar.help')"
        :ui="BUTTON_UI"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="emit('help')"
      />
    </UTooltip>
    <!-- The links of the instance keep their icon at every width. -->
    <UTooltip
      v-for="link in links"
      :key="link.url"
      :text="link.label"
    >
      <UButton
        :icon="link.icon"
        :aria-label="link.label"
        :to="link.url"
        target="_blank"
        color="neutral"
        variant="ghost"
        size="xs"
      />
    </UTooltip>
  </div>
</template>

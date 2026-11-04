<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import { useInstanceLinks } from '../composables/useInstanceLinks'
import { formatJson, jsonFormatNotice } from '../utils/editor-json'
import { foldOtherSlides, unfoldAll } from '../utils/editor-slides'

// The foot of the markdown pane: the outline of the deck and where the caret is
// in it, how the source is shown (folds, line wrapping), the indentation of the
// JSON block under the caret and the links of the instance.
const props = defineProps<{
  view?: EditorView
  /** 1-based position of the slide under the caret. */
  slide: number
  slideCount: number
  /** The caret is in a `json` code block. */
  inJson?: boolean
  /** The text cannot be changed yet, or any more. */
  disabled?: boolean
}>()

const wrap = defineModel<boolean>('wrap', { default: false })
/** The outline of the slides is open beside the source. */
const outline = defineModel<boolean>('outline', { default: false })

const { t } = useI18n()
const toast = useToast()

function indentJson(view: EditorView) {
  const notice = jsonFormatNotice(formatJson(view), t)
  if (notice)
    toast.add({ ...notice, icon: 'i-lucide-braces' })
}

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
    <UTooltip
      :text="t('editor.outline.title')"
      :disabled="!compact"
    >
      <UButton
        icon="i-lucide-list-tree"
        :label="t('editor.outline.title')"
        :aria-label="t('editor.outline.title')"
        :ui="BUTTON_UI"
        color="neutral"
        :variant="outline ? 'soft' : 'ghost'"
        size="xs"
        :aria-pressed="outline"
        @click="() => { outline = !outline }"
      />
    </UTooltip>
    <span class="px-1 tabular-nums whitespace-nowrap">{{ t('editor.statusBar.slidePosition', { slide, total: slideCount }) }}</span>
    <div class="flex-1" />
    <template v-if="inJson">
      <UTooltip
        :text="t('editor.statusBar.formatJsonTooltip')"
        :kbds="['meta', 'alt', 'L']"
      >
        <UButton
          icon="i-lucide-braces"
          :label="t('editor.statusBar.formatJson')"
          :aria-label="t('editor.statusBar.formatJson')"
          :ui="BUTTON_UI"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="!view || disabled"
          @click="run(indentJson)"
        />
      </UTooltip>
      <USeparator
        orientation="vertical"
        class="h-4 mx-1"
      />
    </template>
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

<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import { IMAGE_MIME_TYPES } from '#shared/storage/media-s3'
import { useDocsAddress } from '../composables/useDocsAddress'
import { DOCS_SECTIONS, groupedEntries, inLanguage, SLIDE_TEMPLATES } from '../config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSlideTemplate, insertSnippet, setHeading, slideTemplateFor, toggleLinePrefix, wrapSelection } from '../utils/editor-commands'
import { btnHover, menuUi } from '../utils/toolbar-buttons'

// The markdown pane's bar: the commands that build the deck first (a slide, its
// layout, a component), then the formatting of the text; every action targets
// the live EditorView.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
  /** How the deck splits its slides, which the slide templates follow. */
  parser?: 'heading' | 'separator'
  /** The help panel is open. */
  helpOpen?: boolean
}>()

const emit = defineEmits<{ uploadImages: [files: File[]], help: [] }>()

function run(action: (view: EditorView) => void) {
  if (props.view)
    action(props.view)
}

// A menu gives the focus back to its button when it closes; after an item
// that writes into the text, the editor takes it back, so the author types at once.
let wroteFromMenu = false
function writeFromMenu(action: (view: EditorView) => void) {
  if (!props.view)
    return
  action(props.view)
  wroteFromMenu = true
}
function keepEditorFocus(event: Event) {
  if (!wroteFromMenu)
    return
  wroteFromMenu = false
  event.preventDefault()
  props.view?.focus()
}

const { t, locale } = useI18n()

const imageInput = useTemplateRef<HTMLInputElement>('imageInput')

function onImagesChosen() {
  const input = imageInput.value
  if (!input?.files?.length)
    return
  emit('uploadImages', [...input.files])
  // Choosing the same file again must fire `change` again.
  input.value = ''
}

const docsUrl = useDocsAddress()

// Discoverability menu: an image from a file, then every engine
// component/annotation by group, inserted as a tabbable snippet from the same
// reference the autocompletion uses, and the documentation of the components.
const insertItems = computed<DropdownMenuItem[][]>(() => {
  const docs = docsUrl(DOCS_SECTIONS.components)
  return [
    [{ label: t('editor.toolbar.uploadImage'), icon: 'i-lucide-image-up', onSelect: () => imageInput.value?.click() }],
    ...groupedEntries(locale.value).map(({ group, entries }) => [
      { type: 'label' as const, label: t(`reference.groups.${group}`) },
      ...entries.map(entry => ({
        label: entry.label,
        description: entry.description,
        syntax: entry.syntax,
        onSelect: () => writeFromMenu(view => insertSnippet(view, entry.snippet)),
      })),
    ]),
    ...(docs ? [[{ label: t('editor.toolbar.componentsDocs'), icon: 'i-lucide-book-open', to: docs, target: '_blank' }]] : []),
  ]
})

// A slide: empty, or from a template that fits the parser of the deck.
const slideItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('editor.toolbar.emptySlide'), icon: 'i-lucide-between-horizontal-start', onSelect: () => writeFromMenu(insertSlideBreak) }],
  [
    { type: 'label' as const, label: t('editor.toolbar.templates') },
    ...SLIDE_TEMPLATES.map(entry => ({
      label: t(entry.labelKey),
      description: t(entry.descriptionKey),
      onSelect: () => writeFromMenu(view => insertSlideTemplate(view, slideTemplateFor(inLanguage(entry.snippet, locale.value), props.parser ?? 'separator', entry.section))),
    })),
  ],
])

const headingItems = computed<DropdownMenuItem[]>(() => [1, 2, 3].map(level => ({
  label: t('editor.toolbar.heading', { level }),
  icon: `i-lucide-heading-${level}`,
  onSelect: () => writeFromMenu(view => setHeading(view, level)),
})))

const groups = computed<{ tooltip: string, kbds?: string[], icon: string, action: (view: EditorView) => void }[][]>(() => [
  [
    { tooltip: t('editor.toolbar.bold'), kbds: ['meta', 'B'], icon: 'i-lucide-bold', action: view => wrapSelection(view, '**', t('editor.placeholders.text')) },
    { tooltip: t('editor.toolbar.italic'), kbds: ['meta', 'I'], icon: 'i-lucide-italic', action: view => wrapSelection(view, '*', t('editor.placeholders.text')) },
    { tooltip: t('editor.toolbar.strikethrough'), icon: 'i-lucide-strikethrough', action: view => wrapSelection(view, '~~', t('editor.placeholders.text')) },
    { tooltip: t('editor.toolbar.code'), icon: 'i-lucide-code', action: view => wrapSelection(view, '`', t('editor.placeholders.code')) },
  ],
  [
    { tooltip: t('editor.toolbar.bulletList'), icon: 'i-lucide-list', action: view => toggleLinePrefix(view, '- ') },
    { tooltip: t('editor.toolbar.orderedList'), icon: 'i-lucide-list-ordered', action: view => toggleLinePrefix(view, '1. ') },
    { tooltip: t('editor.toolbar.quote'), icon: 'i-lucide-text-quote', action: view => toggleLinePrefix(view, '> ') },
  ],
  [
    { tooltip: t('editor.toolbar.link'), icon: 'i-lucide-link', action: view => insertLink(view, t('editor.placeholders.text')) },
    { tooltip: t('editor.toolbar.image'), icon: 'i-lucide-image', action: view => insertImage(view, t('editor.placeholders.imageDescription')) },
  ],
])
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1.5 px-2 py-1.5 border-b border-default">
    <div class="flex items-center gap-0.5 rounded-lg bg-elevated p-0.5">
      <UDropdownMenu
        :items="slideItems"
        :content="{ align: 'start', onCloseAutoFocus: keepEditorFocus }"
        :ui="menuUi"
      >
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          :label="t('editor.toolbar.slide')"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
      </UDropdownMenu>

      <EditorLayoutPanel
        :view="view"
        :disabled="disabled"
      />

      <input
        ref="imageInput"
        type="file"
        :accept="IMAGE_MIME_TYPES.join(',')"
        multiple
        hidden
        @change="onImagesChosen"
      >
      <UDropdownMenu
        :items="insertItems"
        :content="{ align: 'start', onCloseAutoFocus: keepEditorFocus }"
        :ui="menuUi"
      >
        <template #item-trailing="{ item }">
          <code
            v-if="item.syntax"
            class="font-mono text-xs text-dimmed"
          >{{ item.syntax }}</code>
        </template>
        <UButton
          icon="i-lucide-shapes"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          :label="t('editor.toolbar.insert')"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
      </UDropdownMenu>
    </div>

    <UTooltip :text="t('reference.help.title')">
      <UButton
        icon="i-lucide-circle-help"
        color="neutral"
        :variant="helpOpen ? 'soft' : 'ghost'"
        size="sm"
        class="ms-auto max-sm:order-last"
        :class="helpOpen ? 'text-primary' : ''"
        :label="t('editor.toolbar.help')"
        :aria-label="t('editor.toolbar.help')"
        :ui="{ label: 'max-sm:hidden' }"
        :aria-pressed="helpOpen"
        @click="emit('help')"
      />
    </UTooltip>

    <div class="sm:basis-full flex flex-wrap items-center gap-x-1 sm:gap-x-2">
      <UDropdownMenu
        :items="headingItems"
        :content="{ onCloseAutoFocus: keepEditorFocus }"
      >
        <UButton
          icon="i-lucide-heading"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
          :aria-label="t('editor.toolbar.headingMenu')"
        />
      </UDropdownMenu>
      <div
        v-for="(group, index) in groups"
        :key="index"
        class="flex items-center gap-0.5"
      >
        <UTooltip
          v-for="button in group"
          :key="button.icon"
          :text="button.tooltip"
          :kbds="button.kbds"
        >
          <UButton
            :icon="button.icon"
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="disabled || !view"
            :aria-label="button.tooltip"
            @click="run(button.action)"
          />
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import { IMAGE_MIME_TYPES } from '#shared/storage/media-s3'
import { useDocsAddress } from '../composables/useDocsAddress'
import { DOCS_SECTIONS, groupedEntries, inLanguage, SLIDE_TEMPLATES } from '../config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSlideTemplate, insertSnippet, setHeading, slideTemplateFor, toggleLinePrefix, wrapSelection } from '../utils/editor-commands'
import { formatJson, jsonFormatNotice } from '../utils/editor-json'
import { btnHover, menuUi } from '../utils/toolbar-buttons'

// The markdown pane's formatting and insertion bar; every action targets the
// live EditorView.
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

const toast = useToast()
const { t, locale } = useI18n()

function beautifyJson(view: EditorView) {
  const notice = jsonFormatNotice(formatJson(view), t)
  if (notice)
    toast.add({ ...notice, icon: 'i-lucide-braces' })
}

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

const templateItems = computed<DropdownMenuItem[]>(() =>
  SLIDE_TEMPLATES.map(entry => ({
    label: t(entry.labelKey),
    description: t(entry.descriptionKey),
    onSelect: () => writeFromMenu(view => insertSlideTemplate(view, slideTemplateFor(inLanguage(entry.snippet, locale.value), props.parser ?? 'separator', entry.section))),
  })))

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
  <div class="flex flex-wrap items-center gap-2 px-2 py-1.5 border-b border-default">
    <UDropdownMenu
      :items="headingItems"
      :content="{ onCloseAutoFocus: keepEditorFocus }"
    >
      <UButton
        icon="i-lucide-heading"
        color="neutral"
        variant="ghost"
        size="sm"
        :class="btnHover"
        trailing-icon="i-lucide-chevron-down"
        :disabled="disabled || !view"
        :aria-label="t('editor.toolbar.headingMenu')"
      />
    </UDropdownMenu>

    <!-- Formatting actions grouped into segmented clusters on a soft rail. -->
    <div
      v-for="(group, index) in groups"
      :key="index"
      class="flex items-center gap-0.5 rounded-lg bg-elevated p-0.5"
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
          :class="btnHover"
          :disabled="disabled || !view"
          :aria-label="button.tooltip"
          @click="run(button.action)"
        />
      </UTooltip>
    </div>

    <div class="flex items-center gap-0.5 rounded-lg bg-elevated p-0.5">
      <UTooltip :text="t('editor.toolbar.newSlide')">
        <UButton
          icon="i-lucide-between-horizontal-start"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          :label="t('editor.toolbar.newSlideShort')"
          :disabled="disabled || !view"
          @click="run(insertSlideBreak)"
        />
      </UTooltip>

      <UDropdownMenu
        :items="templateItems"
        :content="{ align: 'start', onCloseAutoFocus: keepEditorFocus }"
        :ui="menuUi"
      >
        <UButton
          icon="i-lucide-layout-template"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          :label="t('editor.toolbar.templates')"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
      </UDropdownMenu>

      <input
        ref="imageInput"
        type="file"
        :accept="IMAGE_MIME_TYPES.join(',')"
        multiple
        hidden
        @change="onImagesChosen"
      >
      <EditorLayoutPanel
        :view="view"
        :disabled="disabled"
      />

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

      <UTooltip
        :text="t('editor.toolbar.formatJson')"
        :kbds="['meta', 'alt', 'L']"
      >
        <UButton
          icon="i-lucide-braces"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          label="JSON"
          :disabled="disabled || !view"
          @click="run(beautifyJson)"
        />
      </UTooltip>
    </div>

    <UButton
      icon="i-lucide-circle-help"
      color="neutral"
      :variant="helpOpen ? 'soft' : 'ghost'"
      size="sm"
      :class="helpOpen ? 'text-primary' : ''"
      :label="t('editor.toolbar.help')"
      :aria-pressed="helpOpen"
      @click="emit('help')"
    />

    <div
      v-if="$slots.end"
      class="flex items-center gap-0.5 ms-auto"
    >
      <slot name="end" />
    </div>
  </div>
</template>

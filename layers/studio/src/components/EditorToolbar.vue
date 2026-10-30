<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { CommandPaletteGroup, CommandPaletteItem, DropdownMenuItem } from '@nuxt/ui'
import type { SketchShape } from '../config/editor-reference'
import { IMAGE_MIME_TYPES } from '#shared/storage/media-s3'
import { inLanguage } from '@vignettes/core/deck'
import { useDocsAddress } from '../composables/useDocsAddress'
import { DOCS_SECTIONS, groupedEntries, SLIDE_TEMPLATES } from '../config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSlideTemplate, insertSnippet, setHeading, slideTemplateFor, toggleLinePrefix, wrapSelection } from '../utils/editor-commands'
import { btnHover, menuWidth } from '../utils/toolbar-buttons'

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

// The two menus that write into the text close before the editor takes the focus back.
const open = reactive({ slide: false, insert: false })
function chooseImages() {
  open.insert = false
  imageInput.value?.click()
}
function writeFromPopover(menu: keyof typeof open, action: (view: EditorView) => void) {
  open[menu] = false
  writeFromMenu(action)
}

// A slide: empty, or from a template that fits the parser of the deck, each
// drawn as a sketch.
const slideChoices = computed<{ key: string, label: string, description?: string, sketch: readonly SketchShape[], action: (view: EditorView) => void }[]>(() => [
  { key: 'empty', label: t('editor.toolbar.emptySlide'), sketch: [], action: insertSlideBreak },
  ...SLIDE_TEMPLATES.map(entry => ({
    key: entry.labelKey,
    label: t(entry.labelKey),
    description: t(entry.descriptionKey),
    sketch: entry.sketch,
    action: (view: EditorView) => insertSlideTemplate(view, slideTemplateFor(inLanguage(entry.snippet, locale.value), props.parser ?? 'separator', entry.section)),
  })),
])

// Discoverability menu, searched by name, description and syntax: an image from
// a file, then every engine component/annotation by group, inserted as a
// tabbable snippet from the same reference the autocompletion uses, and the
// documentation of the components.
const insertGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => {
  const docs = docsUrl(DOCS_SECTIONS.components)
  return [
    { id: 'upload', items: [{ label: t('editor.toolbar.uploadImage'), icon: 'i-lucide-image-up', onSelect: () => chooseImages() }] },
    ...groupedEntries(locale.value).map(({ group, entries }) => ({
      id: group,
      label: t(`reference.groups.${group}`),
      items: entries.map(entry => ({
        label: entry.label,
        description: entry.description,
        suffix: entry.syntax,
        icon: entry.icon,
        onSelect: () => writeFromPopover('insert', view => insertSnippet(view, entry.snippet)),
      })),
    })),
    ...(docs ? [{ id: 'docs', ignoreFilter: true, items: [{ label: t('editor.toolbar.componentsDocs'), icon: 'i-lucide-book-open', to: docs, target: '_blank' }] }] : []),
  ]
})

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
    <div class="flex items-center gap-0.5">
      <UPopover
        v-model:open="open.slide"
        :content="{ align: 'start', onCloseAutoFocus: keepEditorFocus }"
      >
        <UButton
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('editor.toolbar.slide')"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
        <template #content>
          <div
            class="grid grid-cols-3 gap-1 p-3"
            :class="menuWidth"
          >
            <UTooltip
              v-for="choice in slideChoices"
              :key="choice.key"
              :text="choice.description"
              :disabled="!choice.description"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                class="flex-col items-stretch gap-1.5 px-1 py-1.5 text-center"
                :class="btnHover"
                @click="writeFromPopover('slide', choice.action)"
              >
                <SlideSketch
                  :shapes="choice.sketch"
                  class="w-full aspect-video"
                />
                <span class="text-xs text-toned">{{ choice.label }}</span>
              </UButton>
            </UTooltip>
          </div>
        </template>
      </UPopover>

      <EditorLayoutPanel
        :view="view"
        :disabled="disabled"
      />

      <EditorPropertiesPanel
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
      <UPopover
        v-model:open="open.insert"
        :content="{ align: 'start', onCloseAutoFocus: keepEditorFocus }"
      >
        <UButton
          icon="i-lucide-shapes"
          color="neutral"
          variant="ghost"
          size="sm"
          :label="t('editor.toolbar.insert')"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
        <template #content>
          <UCommandPalette
            :groups="insertGroups"
            :placeholder="t('editor.toolbar.insertSearch')"
            :close="false"
            class="max-h-[min(32rem,70vh)]"
            :class="menuWidth"
            :ui="{ itemDescription: 'whitespace-normal', itemLabelSuffix: 'font-mono text-xs' }"
          />
        </template>
      </UPopover>
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
        <USeparator
          orientation="vertical"
          class="h-5 me-0.5 sm:me-1.5"
        />
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

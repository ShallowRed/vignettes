<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import { IMAGE_MIME_TYPES } from '#shared/storage/media-s3'
import { annotationEntries, componentEntries, inLanguage, SLIDE_TEMPLATES } from '../config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSlideTemplate, insertSnippet, setHeading, toggleLinePrefix, wrapSelection } from '../utils/editor-commands'
import { formatJson, jsonFormatNotice } from '../utils/editor-json'

// The markdown pane's formatting and insertion bar; every action targets the
// live EditorView.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const emit = defineEmits<{ uploadImages: [files: File[]] }>()

function run(action: (view: EditorView) => void) {
  if (props.view)
    action(props.view)
}

const toast = useToast()
const { t, locale } = useI18n()

function beautifyJson(view: EditorView) {
  const notice = jsonFormatNotice(formatJson(view), t)
  if (notice)
    toast.add({ ...notice, icon: 'i-lucide-braces' })
}

// Ghost buttons sit on a bg-elevated rail, whose default ghost hover (also
// bg-elevated) is invisible; bump the hover a step to bg-accented so every
// control gives clear feedback. tailwind-merge lets this win over the variant.
const btnHover = 'hover:bg-accented'

const imageInput = useTemplateRef<HTMLInputElement>('imageInput')

function onImagesChosen() {
  const input = imageInput.value
  if (!input?.files?.length)
    return
  emit('uploadImages', [...input.files])
  // Choosing the same file again must fire `change` again.
  input.value = ''
}

// Discoverability menu: an image from a file, then every engine
// component/annotation, inserted as a tabbable snippet from the same reference
// the autocompletion uses.
const insertItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: t('editor.toolbar.uploadImage'), icon: 'i-lucide-image-up', onSelect: () => imageInput.value?.click() }],
  componentEntries(locale.value).map(entry => ({
    label: entry.label,
    description: entry.description,
    onSelect: () => run(view => insertSnippet(view, entry.snippet)),
  })),
  annotationEntries(locale.value).map(entry => ({
    label: entry.label,
    description: entry.description,
    onSelect: () => run(view => insertSnippet(view, entry.snippet)),
  })),
])

const templateItems = computed<DropdownMenuItem[]>(() =>
  SLIDE_TEMPLATES.map(entry => ({
    label: t(entry.labelKey),
    description: t(entry.descriptionKey),
    onSelect: () => run(view => insertSlideTemplate(view, inLanguage(entry.snippet, locale.value))),
  })))

const headingItems = computed<DropdownMenuItem[]>(() => [1, 2, 3].map(level => ({
  label: t('editor.toolbar.heading', { level }),
  icon: `i-lucide-heading-${level}`,
  onSelect: () => run(view => setHeading(view, level)),
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
    <UDropdownMenu :items="headingItems">
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
        :content="{ align: 'start' }"
        :ui="{ content: 'w-80 max-h-96 overflow-y-auto', itemDescription: 'whitespace-normal' }"
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
      <UDropdownMenu
        :items="insertItems"
        :content="{ align: 'start' }"
        :ui="{ content: 'w-80 max-h-96 overflow-y-auto', itemDescription: 'whitespace-normal' }"
      >
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

    <div
      v-if="$slots.end"
      class="flex items-center gap-0.5 ms-auto"
    >
      <slot name="end" />
    </div>
  </div>
</template>

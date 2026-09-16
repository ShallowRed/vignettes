<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import { ANNOTATION_SNIPPETS, COMPONENT_SNIPPETS, SLIDE_TEMPLATES } from '../config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSlideTemplate, insertSnippet, setHeading, toggleLinePrefix, wrapSelection } from '../utils/editor-commands'
import { formatJson, jsonFormatNotice } from '../utils/editor-json'

// The markdown pane's formatting and insertion bar; every action targets the
// live EditorView.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

function run(action: (view: EditorView) => void) {
  if (props.view)
    action(props.view)
}

const toast = useToast()

function beautifyJson(view: EditorView) {
  const notice = jsonFormatNotice(formatJson(view))
  if (notice)
    toast.add({ ...notice, icon: 'i-lucide-braces' })
}

// Ghost buttons sit on a bg-elevated rail, whose default ghost hover (also
// bg-elevated) is invisible; bump the hover a step to bg-accented so every
// control gives clear feedback. tailwind-merge lets this win over the variant.
const btnHover = 'hover:bg-accented'

// Discoverability menu: every engine component/annotation, inserted as a
// tabbable snippet from the same reference the autocompletion uses.
const insertItems = computed<DropdownMenuItem[][]>(() => [
  COMPONENT_SNIPPETS.map(entry => ({
    label: entry.label,
    onSelect: () => run(view => insertSnippet(view, entry.snippet)),
  })),
  ANNOTATION_SNIPPETS.map(entry => ({
    label: entry.label,
    onSelect: () => run(view => insertSnippet(view, entry.snippet)),
  })),
])

// Whole-slide starters (with lorem) — described in the tooltip for discoverability.
const templateItems = computed<DropdownMenuItem[]>(() =>
  SLIDE_TEMPLATES.map(entry => ({
    label: entry.label,
    onSelect: () => run(view => insertSlideTemplate(view, entry.snippet)),
  })))

const headingItems = [1, 2, 3].map(level => ({
  label: `Titre ${level}`,
  icon: `i-lucide-heading-${level}`,
  onSelect: () => run(view => setHeading(view, level)),
}))

const groups: { tooltip: string, kbds?: string[], icon: string, action: (view: EditorView) => void }[][] = [
  [
    { tooltip: 'Gras', kbds: ['meta', 'B'], icon: 'i-lucide-bold', action: view => wrapSelection(view, '**', 'texte') },
    { tooltip: 'Italique', kbds: ['meta', 'I'], icon: 'i-lucide-italic', action: view => wrapSelection(view, '*', 'texte') },
    { tooltip: 'Barré', icon: 'i-lucide-strikethrough', action: view => wrapSelection(view, '~~', 'texte') },
    { tooltip: 'Code', icon: 'i-lucide-code', action: view => wrapSelection(view, '`', 'code') },
    { tooltip: 'Mettre en forme le JSON', kbds: ['shift', 'alt', 'F'], icon: 'i-lucide-braces', action: beautifyJson },
  ],
  [
    { tooltip: 'Liste à puces', icon: 'i-lucide-list', action: view => toggleLinePrefix(view, '- ') },
    { tooltip: 'Liste numérotée', icon: 'i-lucide-list-ordered', action: view => toggleLinePrefix(view, '1. ') },
    { tooltip: 'Citation', icon: 'i-lucide-text-quote', action: view => toggleLinePrefix(view, '> ') },
  ],
  [
    { tooltip: 'Lien', icon: 'i-lucide-link', action: insertLink },
    { tooltip: 'Image', icon: 'i-lucide-image', action: insertImage },
  ],
]
</script>

<template>
  <div class="flex items-center gap-2 px-2 py-1.5 border-b border-default overflow-x-auto">
    <UDropdownMenu :items="headingItems">
      <UButton
        icon="i-lucide-heading"
        color="neutral"
        variant="ghost"
        size="sm"
        :class="btnHover"
        trailing-icon="i-lucide-chevron-down"
        :disabled="disabled || !view"
        aria-label="Titre"
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
      <UTooltip text="Nouvelle diapositive">
        <UButton
          icon="i-lucide-between-horizontal-start"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          label="Diapo"
          :disabled="disabled || !view"
          @click="run(insertSlideBreak)"
        />
      </UTooltip>

      <UDropdownMenu
        :items="templateItems"
        :content="{ align: 'start' }"
        :ui="{ content: 'max-h-96 overflow-y-auto' }"
      >
        <UButton
          icon="i-lucide-layout-template"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          label="Modèles"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
      </UDropdownMenu>

      <UDropdownMenu
        :items="insertItems"
        :content="{ align: 'start' }"
        :ui="{ content: 'max-h-96 overflow-y-auto' }"
      >
        <UButton
          icon="i-lucide-shapes"
          color="neutral"
          variant="ghost"
          size="sm"
          :class="btnHover"
          label="Insérer"
          trailing-icon="i-lucide-chevron-down"
          :disabled="disabled || !view"
        />
      </UDropdownMenu>
    </div>

    <template v-if="$slots.end">
      <div class="flex-1" />
      <slot name="end" />
    </template>
  </div>
</template>

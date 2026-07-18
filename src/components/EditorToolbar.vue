<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { DropdownMenuItem } from '@nuxt/ui'
import { ANNOTATION_SNIPPETS, COMPONENT_SNIPPETS } from '~/config/editor-reference'
import { insertImage, insertLink, insertSlideBreak, insertSnippet, setHeading, toggleLinePrefix, wrapSelection } from '~/utils/editor-commands'

// Markdown formatting bar; every action targets the live EditorView.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const emit = defineEmits<{ help: [] }>()

function run(action: (view: EditorView) => void) {
  if (props.view)
    action(props.view)
}

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
  <div class="flex items-center gap-1 px-2 py-1 border-b border-default bg-elevated/50 overflow-x-auto">
    <UDropdownMenu :items="headingItems">
      <UButton
        icon="i-lucide-heading"
        color="neutral"
        variant="ghost"
        size="xs"
        trailing-icon="i-lucide-chevron-down"
        :disabled="disabled || !view"
        aria-label="Titre"
      />
    </UDropdownMenu>

    <template
      v-for="(group, index) in groups"
      :key="index"
    >
      <USeparator
        orientation="vertical"
        class="h-5 mx-1"
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
          size="xs"
          :disabled="disabled || !view"
          :aria-label="button.tooltip"
          @click="run(button.action)"
        />
      </UTooltip>
    </template>

    <USeparator
      orientation="vertical"
      class="h-5 mx-1"
    />
    <UTooltip text="Nouvelle diapositive">
      <UButton
        icon="i-lucide-between-horizontal-start"
        color="neutral"
        variant="ghost"
        size="xs"
        label="Diapo"
        :disabled="disabled || !view"
        @click="run(insertSlideBreak)"
      />
    </UTooltip>

    <UDropdownMenu
      :items="insertItems"
      :content="{ align: 'start' }"
      :ui="{ content: 'max-h-96 overflow-y-auto' }"
    >
      <UButton
        icon="i-lucide-shapes"
        color="neutral"
        variant="ghost"
        size="xs"
        label="Insérer"
        trailing-icon="i-lucide-chevron-down"
        :disabled="disabled || !view"
      />
    </UDropdownMenu>

    <div class="flex-1" />
    <UTooltip text="Aide et syntaxe">
      <UButton
        icon="i-lucide-circle-help"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Aide et syntaxe"
        @click="emit('help')"
      />
    </UTooltip>
  </div>
</template>

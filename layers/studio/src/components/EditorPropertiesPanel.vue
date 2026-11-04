<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { ComponentAttribute } from '@vignettes/core/deck'
import { inLanguage } from '@vignettes/core/deck'
import { useCursorReading } from '../composables/useCursorReading'
import { directiveEntry } from '../config/editor-reference'
import { attributeChange, attributeValue, componentAt } from '../utils/editor-properties'
import { menuWidth } from '../utils/toolbar-buttons'

// The attributes of the component under the cursor. Each choice rewrites its
// `{…}` block, so the preview shows it at once.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const { t, locale } = useI18n()

const { open, current, refresh } = useCursorReading(() => props.view, componentAt)

const entry = computed(() => {
  const component = current.value
  if (!component)
    return undefined
  const colons = /^:+/.exec(component.syntax)![0]
  return directiveEntry(colons, component.syntax.slice(colons.length), locale.value)
})

function set(attribute: ComponentAttribute, value: string) {
  const view = props.view
  if (!view || view.state.readOnly)
    return
  view.dispatch(attributeChange(view.state, attribute, value))
  refresh()
}

const value = (attribute: ComponentAttribute) => current.value ? attributeValue(current.value, attribute) : ''
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start', collisionPadding: 8 }"
  >
    <UButton
      icon="i-lucide-sliders-horizontal"
      color="neutral"
      variant="ghost"
      size="sm"
      :label="t('editor.properties.open')"
      :ui="{ label: 'max-sm:sr-only' }"
      :disabled="disabled || !view"
    />

    <template #content>
      <div
        class="max-h-(--reka-popover-content-available-height) overflow-y-auto p-3 space-y-3 text-sm"
        :class="menuWidth"
      >
        <p
          v-if="!current"
          class="text-muted"
        >
          {{ t('editor.properties.none') }}
        </p>
        <template v-else>
          <p class="flex items-center gap-2">
            <span class="font-medium text-highlighted">{{ entry?.label }}</span>
            <code class="text-xs text-muted">{{ current.syntax }}</code>
          </p>

          <section
            v-for="attribute in current.directive.attributes"
            :key="attribute.name"
            class="space-y-1.5"
          >
            <div class="flex items-center justify-between gap-2">
              <code class="text-xs font-medium text-highlighted">{{ attribute.name }}</code>
              <USwitch
                v-if="attribute.boolean"
                size="sm"
                :model-value="value(attribute) === 'true'"
                :aria-label="attribute.name"
                @update:model-value="set(attribute, $event ? 'true' : 'false')"
              />
            </div>
            <CodeText
              :text="inLanguage(attribute.description, locale)"
              class="block text-xs text-muted [&_code]:text-default"
            />
            <ChoiceRow
              v-if="attribute.values"
              :choices="attribute.values.map(choice => ({ value: choice, label: choice, active: value(attribute) === choice }))"
              @choose="set(attribute, value(attribute) === $event && attribute.default === undefined ? '' : $event)"
            />
            <UInput
              v-else-if="!attribute.boolean"
              size="sm"
              class="w-full"
              :model-value="value(attribute)"
              :placeholder="attribute.default"
              @update:model-value="set(attribute, String($event ?? ''))"
            />
          </section>
        </template>
      </div>
    </template>
  </UPopover>
</template>

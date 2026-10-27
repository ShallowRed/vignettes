<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { ComponentAttribute } from '@vignettes/core/deck'
import { directiveEntry, inLanguage } from '../config/editor-reference'
import { EDITOR_TEXT } from '../utils/editor-layout'
import { attributeChange, attributeValue, componentAt } from '../utils/editor-properties'
import { codeParts } from '../utils/editor-tooltip'
import { btnActive, btnHover, menuWidth } from '../utils/toolbar-buttons'

// The attributes of the component under the cursor. Each choice rewrites its
// `{…}` block, so the preview shows it at once.
const props = defineProps<{
  view?: EditorView
  disabled?: boolean
}>()

const { t, locale } = useI18n()

const open = ref(false)
const current = shallowRef(props.view ? componentAt(props.view.state) : undefined)

function read() {
  if (props.view)
    current.value = componentAt(props.view.state)
}

watch(open, (opened) => {
  if (opened)
    read()
})

// Another author may change the block while the panel is open: the panel reads
// the component again on each change of the text.
const text = inject(EDITOR_TEXT, undefined)
watch(() => text?.value, () => {
  if (open.value)
    read()
})

const entry = computed(() => {
  const component = current.value
  if (!component)
    return undefined
  const colons = /^:+/.exec(component.syntax)![0]
  return directiveEntry(colons, component.syntax.slice(colons.length), locale.value)
})

function set(attribute: ComponentAttribute, value: string) {
  const view = props.view
  if (!view)
    return
  view.dispatch(attributeChange(view.state, attribute, value))
  read()
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
      :class="btnHover"
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
            <p class="text-xs text-muted">
              <template
                v-for="(part, index) in codeParts(inLanguage(attribute.description, locale))"
                :key="index"
              >
                <code
                  v-if="part.code"
                  class="font-mono text-default"
                >{{ part.text }}</code>
                <template v-else>
                  {{ part.text }}
                </template>
              </template>
            </p>
            <div
              v-if="attribute.values"
              class="flex flex-wrap gap-0.5 rounded-lg bg-elevated p-0.5"
            >
              <UButton
                v-for="choice in attribute.values"
                :key="choice"
                color="neutral"
                variant="ghost"
                size="xs"
                class="flex-1 justify-center"
                :class="value(attribute) === choice ? btnActive : btnHover"
                :aria-pressed="value(attribute) === choice"
                :label="choice"
                @click="set(attribute, value(attribute) === choice && attribute.default === undefined ? '' : choice)"
              />
            </div>
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

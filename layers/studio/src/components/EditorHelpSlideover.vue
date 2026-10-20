<script setup lang="ts">
import {
  annotationEntries,
  componentEntries,
  EDITOR_SHORTCUTS,
  FRONTMATTER_KEYS,
  LAYOUT_NAMES,
  STRUCTURE_HELP,
} from '../config/editor-reference'

/**
 * Syntax reference panel: everything the engine understands, insertable in one
 * click. Same dataset as the autocompletion and the toolbar menu.
 */
const props = withDefaults(defineProps<{
  parser?: 'heading' | 'separator'
}>(), {
  parser: 'separator',
})

const emit = defineEmits<{ insert: [snippet: string] }>()

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()

const components = computed(() => componentEntries(locale.value))
const annotations = computed(() => annotationEntries(locale.value))

const structure = computed(() => STRUCTURE_HELP[props.parser])
const otherParser = computed(() => (props.parser === 'heading' ? 'separator' : 'heading'))
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="t('reference.help.title')"
    :description="t('reference.help.description')"
  >
    <template #body>
      <div class="flex flex-col gap-6">
        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-rows-3"
              class="size-4"
            />
            {{ t('reference.help.structureHeading') }}
          </h3>
          <i18n-t
            keypath="reference.help.activeParser"
            tag="p"
            scope="global"
            class="text-xs text-muted mb-2"
          >
            <template #active>
              <code class="font-mono">parser: {{ parser }}</code>
            </template>
            <template #other>
              <code class="font-mono">parser: {{ otherParser }}</code>
            </template>
          </i18n-t>
          <ul class="flex flex-col gap-1">
            <li
              v-for="rule in structure"
              :key="rule"
              class="text-sm font-mono text-toned"
            >
              {{ t(rule) }}
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-shapes"
              class="size-4"
            />
            {{ t('reference.help.componentsHeading') }}
          </h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in components"
              :key="entry.label"
              class="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2"
            >
              <div class="flex-1 min-w-0">
                <code class="text-sm font-mono text-highlighted">{{ entry.label }}</code>
                <p class="text-xs text-muted mt-0.5">
                  {{ entry.description }}
                </p>
              </div>
              <UTooltip :text="t('reference.help.insertTooltip')">
                <UButton
                  icon="i-lucide-corner-down-left"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="t('reference.help.insert')"
                  @click="emit('insert', entry.snippet)"
                />
              </UTooltip>
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-at-sign"
              class="size-4"
            />
            {{ t('reference.help.annotationsHeading') }}
          </h3>
          <ul class="flex flex-col gap-2">
            <li
              v-for="entry in annotations"
              :key="entry.label"
              class="flex items-start gap-2 rounded-lg bg-elevated px-3 py-2"
            >
              <div class="flex-1 min-w-0">
                <code class="text-sm font-mono text-highlighted">{{ entry.label }}</code>
                <p class="text-xs text-muted mt-0.5">
                  {{ entry.description }}
                </p>
              </div>
              <UTooltip :text="t('reference.help.insertTooltip')">
                <UButton
                  icon="i-lucide-corner-down-left"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="t('reference.help.insert')"
                  @click="emit('insert', entry.snippet)"
                />
              </UTooltip>
            </li>
          </ul>
          <i18n-t
            keypath="reference.help.layoutsIntro"
            tag="p"
            scope="global"
            class="text-xs text-muted mt-2"
          >
            <template #annotation>
              <code class="font-mono">:layout</code>
            </template>
          </i18n-t>
          <div class="flex flex-wrap gap-1.5 mt-1.5">
            <UBadge
              v-for="name in LAYOUT_NAMES"
              :key="name"
              color="neutral"
              variant="subtle"
              size="sm"
              class="font-mono"
              :label="name"
            />
          </div>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-file-cog"
              class="size-4"
            />
            {{ t('reference.help.frontmatterHeading') }}
          </h3>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="entry in FRONTMATTER_KEYS"
              :key="entry.key"
              class="text-sm"
            >
              <code class="font-mono text-highlighted">{{ entry.key }}</code>
              <span
                v-if="entry.values"
                class="font-mono text-xs text-dimmed"
              > · {{ entry.values.join(' | ') }}</span>
              <p class="text-xs text-muted">
                {{ t(entry.descriptionKey) }}
              </p>
            </li>
          </ul>
        </section>

        <USeparator />

        <section>
          <h3 class="font-semibold text-highlighted mb-2 flex items-center gap-2">
            <UIcon
              name="i-lucide-keyboard"
              class="size-4"
            />
            {{ t('reference.help.shortcutsHeading') }}
          </h3>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="entry in EDITOR_SHORTCUTS"
              :key="entry.descriptionKey"
              class="flex items-center gap-2 text-sm"
            >
              <UKbd
                v-for="key in entry.keys"
                :key="key"
                :value="key"
              />
              <span class="text-muted">{{ t(entry.descriptionKey) }}</span>
            </li>
          </ul>
          <i18n-t
            keypath="reference.help.completionTriggers"
            tag="p"
            scope="global"
            class="text-xs text-muted mt-2"
          >
            <template #components>
              <code class="font-mono">::</code>
            </template>
            <template #annotations>
              <code class="font-mono">:</code>
            </template>
          </i18n-t>
        </section>
      </div>
    </template>
  </USlideover>
</template>

<script setup lang="ts">
import type { ParserId } from '@vignettes/core/deck'
import { useCompletionKeys } from '../composables/useCompletionKeys'
import { useDocsAddress } from '../composables/useDocsAddress'
import {
  componentAttributeEntries,
  DOCS_SECTIONS,
  EDITOR_SHORTCUTS,
  FRONTMATTER_KEYS,
  groupedEntries,
  STRUCTURE_HELP,
} from '../config/editor-reference'

/**
 * Syntax reference panel: everything the engine understands, insertable in one
 * click. Same dataset as the autocompletion and the toolbar menu.
 */
const props = withDefaults(defineProps<{
  parser?: ParserId
  /** The shared draft saves itself, so the save shortcut does nothing. */
  autosave?: boolean
}>(), {
  parser: 'separator',
})

const emit = defineEmits<{ insert: [snippet: string, name: string] }>()

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()
const completionKeys = useCompletionKeys()

const docsUrl = useDocsAddress()
const docsHome = docsUrl(DOCS_SECTIONS.home)

type Tab = 'components' | 'slides' | 'frontmatter' | 'shortcuts'
const tab = ref<Tab>('components')
const TAB_ICONS: Record<Tab, string> = {
  components: 'i-lucide-shapes',
  slides: 'i-lucide-gallery-horizontal-end',
  frontmatter: 'i-lucide-file-cog',
  shortcuts: 'i-lucide-keyboard',
}
const tabs = computed(() => (Object.keys(TAB_ICONS) as Tab[])
  .map(value => ({ label: t(`reference.help.tabs.${value}`), icon: TAB_ICONS[value], value, slot: value })))

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
const query = ref('')
const groups = computed(() => {
  const needle = fold(query.value.trim())
  return groupedEntries(locale.value)
    .map(({ group, entries }) => ({
      group,
      entries: needle ? entries.filter(entry => fold(`${entry.label} ${entry.syntax} ${entry.description}`).includes(needle)) : entries,
    }))
    .filter(({ entries }) => entries.length)
})
const layoutChoices = computed(() => componentAttributeEntries('layout', locale.value)?.filter(entry => entry.values) ?? [])

const structure = computed(() => STRUCTURE_HELP[props.parser])
const frontmatterKeys = FRONTMATTER_KEYS.filter(entry => !entry.advanced)
const shortcuts = computed(() => EDITOR_SHORTCUTS.map(entry => ({
  keys: entry.keys,
  descriptionKey: props.autosave ? entry.sharedDescriptionKey ?? entry.descriptionKey : entry.descriptionKey,
})))
</script>

<template>
  <USlideover
    v-model:open="open"
    :modal="false"
    :overlay="false"
    :title="t('reference.help.title')"
    :ui="{ content: 'max-w-xl', body: 'p-0 sm:p-0' }"
  >
    <template
      v-if="docsHome"
      #actions
    >
      <UButton
        icon="i-lucide-book-open"
        trailing-icon="i-lucide-arrow-up-right"
        color="neutral"
        variant="ghost"
        size="sm"
        :to="docsHome"
        target="_blank"
        :aria-label="t('reference.help.docsHome')"
        class="ms-auto me-10"
      >
        <span class="hidden sm:inline">{{ t('reference.help.docsHome') }}</span>
      </UButton>
    </template>
    <template #body>
      <UTabs
        v-model="tab"
        :items="tabs"
        variant="link"
        :ui="{ root: 'gap-0', list: 'sticky top-0 z-10 bg-default px-2 sm:px-4 overflow-x-auto', trigger: 'shrink-0', content: 'px-4 sm:px-6 py-4' }"
      >
        <template #components>
          <UInput
            v-model="query"
            icon="i-lucide-search"
            :placeholder="t('reference.help.search')"
            class="w-full"
          />
          <p
            v-if="!groups.length"
            class="mt-4 text-sm text-muted"
          >
            {{ t('reference.help.noMatch', { query }) }}
          </p>
          <section
            v-for="{ group, entries } in groups"
            :key="group"
            class="mt-5"
          >
            <h3 class="text-xs font-medium text-muted">
              {{ t(`reference.groups.${group}`) }}
            </h3>
            <ul class="divide-y divide-default">
              <li
                v-for="entry in entries"
                :key="entry.syntax"
                class="flex items-start gap-2 py-2.5"
              >
                <div class="flex-1 min-w-0">
                  <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span class="font-medium text-highlighted">{{ entry.label }}</span>
                    <code class="font-mono text-xs text-muted">{{ entry.syntax }}</code>
                  </p>
                  <p class="mt-0.5 text-sm text-muted">
                    {{ entry.description }}
                  </p>
                </div>
                <UTooltip
                  v-if="docsUrl(entry.docs)"
                  :text="t('reference.help.docsTooltip')"
                >
                  <UButton
                    icon="i-lucide-book-open"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :to="docsUrl(entry.docs)"
                    target="_blank"
                    :aria-label="t('reference.help.docs', { name: entry.label })"
                  />
                </UTooltip>
                <UTooltip :text="t('reference.help.insertTooltip')">
                  <UButton
                    icon="i-lucide-corner-down-left"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="t('reference.help.insert', { name: entry.label })"
                    @click="emit('insert', entry.snippet, entry.name)"
                  />
                </UTooltip>
              </li>
            </ul>
          </section>
        </template>

        <template #slides>
          <section>
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('reference.help.structureHeading') }}
            </h3>
            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <template
                v-for="rule in structure"
                :key="rule.descriptionKey"
              >
                <dt class="font-mono text-highlighted">
                  {{ rule.syntax }}
                </dt>
                <dd class="text-toned">
                  {{ t(rule.descriptionKey) }}
                </dd>
              </template>
            </dl>
          </section>
          <section class="mt-6">
            <h3 class="text-sm font-semibold text-highlighted">
              {{ t('reference.help.layoutHeading') }}
            </h3>
            <i18n-t
              keypath="reference.help.layoutsIntro"
              tag="p"
              scope="global"
              class="mt-1 text-sm text-muted"
            >
              <template #annotation>
                <code class="font-mono text-xs">:layout</code>
              </template>
            </i18n-t>
            <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2.5">
              <template
                v-for="entry in layoutChoices"
                :key="entry.name"
              >
                <dt class="font-mono text-sm text-highlighted">
                  {{ entry.name }}
                </dt>
                <dd class="flex flex-wrap gap-1.5">
                  <UBadge
                    v-for="value in entry.values"
                    :key="value"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-mono"
                    :label="value"
                  />
                </dd>
              </template>
            </dl>
          </section>
        </template>

        <template #frontmatter>
          <ul class="divide-y divide-default">
            <li
              v-for="entry in frontmatterKeys"
              :key="entry.key"
              class="py-2.5 first:pt-0"
            >
              <p class="flex flex-wrap items-baseline gap-x-2">
                <code class="font-mono text-sm font-medium text-highlighted">{{ entry.key }}</code>
                <span
                  v-if="entry.values"
                  class="font-mono text-xs text-muted"
                >{{ entry.values.join(' | ') }}</span>
              </p>
              <p class="mt-0.5 text-sm text-muted">
                {{ t(entry.descriptionKey) }}
              </p>
            </li>
          </ul>
        </template>

        <template #shortcuts>
          <ul class="divide-y divide-default">
            <li
              v-for="entry in shortcuts"
              :key="entry.descriptionKey"
              class="flex items-center justify-between gap-4 py-2 text-sm first:pt-0"
            >
              <span class="text-toned">{{ t(entry.descriptionKey) }}</span>
              <span class="flex shrink-0 gap-1">
                <UKbd
                  v-for="key in entry.keys"
                  :key="key"
                  :value="key === 'space' ? t('editor.keys.space') : key"
                />
              </span>
            </li>
          </ul>
          <i18n-t
            keypath="reference.help.completionTriggers"
            tag="p"
            scope="global"
            class="mt-4 text-sm text-muted"
          >
            <template #components>
              <code class="font-mono text-xs">::</code>
            </template>
            <template #annotations>
              <code class="font-mono text-xs">:</code>
            </template>
            <template #keys>
              {{ completionKeys }}
            </template>
          </i18n-t>
        </template>
      </UTabs>
    </template>
  </USlideover>
</template>

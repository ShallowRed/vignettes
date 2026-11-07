<script setup lang="ts">
import type { EditorView } from '@codemirror/view'
import type { SymbolKind } from '@vignettes/core/deck'
import type { Translate } from '../config/editor-reference'
import type { SymbolOption } from '../utils/editor-symbols'
import { normalizeIconName } from '@vignettes/core/deck'
import { EDITOR_TEXT } from '../utils/editor-layout'
import { attributeValue } from '../utils/editor-properties'
import { categoryLabel, loadIconDrawings, PICTOGRAM_LAYERS, pictogramLayer, searchFold, searchTerms, symbolChange, symbolInsertion, symbolList, symbolPlacement, symbolsInDeck, symbolValue } from '../utils/editor-symbols'

/**
 * Every Remix icon and every pictogram, searched by name and by category, and
 * written at the caret with a click: in the attribute of the component there
 * that takes it, else inline. Stays open beside the text, for the next one.
 */
const props = defineProps<{
  view?: EditorView
  /** The caret, whose component a click writes into. */
  cursor: number
  disabled?: boolean
}>()

const open = defineModel<boolean>('open', { required: true })
const kind = defineModel<SymbolKind>('kind', { default: 'icon' })

const { t, locale } = useI18n()
const translate = t as Translate
const text = inject(EDITOR_TEXT, undefined)

const lists = shallowRef<Record<SymbolKind, SymbolOption[]>>({ icon: [], pictogram: [] })
const status = ref<'loading' | 'ready' | 'failed'>('loading')

watch(open, async (opened) => {
  if (!opened || status.value === 'ready')
    return
  status.value = 'loading'
  try {
    const [icon, pictogram] = await Promise.all([symbolList('icon'), symbolList('pictogram'), loadIconDrawings()])
    lists.value = { icon, pictogram }
    status.value = icon.length ? 'ready' : 'failed'
  }
  catch {
    status.value = 'failed'
  }
}, { immediate: true })

const IN_DECK = '#deck'
const ALL = '#all'
const query = ref('')
const category = ref(ALL)
const style = ref<'line' | 'fill'>('line')
watch(kind, () => {
  category.value = ALL
})

const STYLE_SUFFIX = /-(?:line|fill)$/

const indexed = computed(() => lists.value[kind.value].map(option => ({
  ...option,
  label: kind.value === 'icon' ? option.name.replace(STYLE_SUFFIX, '') : option.name.split('/').at(-1)!,
  haystack: searchFold(`${option.name} ${option.category} ${categoryLabel(kind.value, option.category, translate)}`),
})))

const used = computed(() => symbolsInDeck(text?.value ?? ''))

// The symbols the search keeps, before the style and the category: each typed
// word, or a name part it stands for in the language of the interface.
const matching = computed(() => {
  const words = searchFold(query.value).split(/\s+/).filter(Boolean).map(word => searchTerms(word, locale.value))
  return indexed.value.filter(option => words.every(terms => terms.some(term => option.haystack.includes(term))))
})
const inStyle = (option: SymbolOption) => kind.value === 'pictogram' || !STYLE_SUFFIX.test(option.name) || option.name.endsWith(`-${style.value}`)
const inDeck = computed(() => matching.value.filter(option => used.value[kind.value].includes(option.name)))

const categories = computed(() => {
  const counts = new Map(indexed.value.map(option => [option.category, 0]))
  for (const option of matching.value.filter(inStyle))
    counts.set(option.category, counts.get(option.category)! + 1)
  return [
    { value: ALL, label: t('editor.symbols.all'), count: [...counts.values()].reduce((sum, count) => sum + count, 0) },
    { value: IN_DECK, label: t('editor.symbols.deck'), count: inDeck.value.length },
    ...[...counts].map(([value, count]) => ({ value, label: categoryLabel(kind.value, value, translate), count })),
  ]
})

const shown = computed(() => category.value === IN_DECK
  ? inDeck.value
  : matching.value.filter(option => inStyle(option) && (category.value === ALL || option.category === category.value)))

const kinds = computed(() => (['icon', 'pictogram'] as const).map(value => ({
  value,
  label: t(`editor.symbols.tabs.${value}`),
  badge: lists.value[value].length ? { label: lists.value[value].length.toLocaleString(locale.value), color: 'neutral' as const, variant: 'soft' as const } : undefined,
})))
const styles = computed(() => (['line', 'fill'] as const).map(value => ({ value, label: t(`editor.symbols.style.${value}`), active: style.value === value })))

// Where a click writes, read again as the caret or the text moves.
const placement = computed(() => {
  void props.cursor
  void text?.value
  return props.view ? symbolPlacement(props.view.state, kind.value) : undefined
})
const target = computed(() => {
  const at = placement.value
  if (!at)
    return t('editor.symbols.target.insert', { syntax: `\`${symbolInsertion(kind.value, '…')}\`` })
  return t(`editor.symbols.target.${at.written ? 'replace' : 'add'}`, { attribute: `\`${at.attribute.name}\``, component: `\`${at.component.syntax}\`` })
})
// The value the component at the caret writes already, whose tile the grid marks.
const current = computed(() => {
  const at = placement.value
  return at?.written ? attributeValue(at.component, at.attribute) : undefined
})
function isCurrent(option: SymbolOption) {
  return current.value !== undefined
    && (kind.value === 'icon' ? normalizeIconName(current.value) : current.value) === symbolValue(kind.value, option.name)
}

function choose(option: SymbolOption) {
  const view = props.view
  if (!view || view.state.readOnly)
    return
  view.dispatch(symbolChange(view.state, kind.value, option.name))
  view.focus()
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :modal="false"
    :overlay="false"
    :title="t('editor.symbols.title')"
    :ui="{ content: 'max-w-xl', body: 'p-0 sm:p-0 flex flex-col', footer: 'py-3' }"
  >
    <template #body>
      <div class="space-y-3 border-b border-default px-4 sm:px-6 pb-3">
        <UTabs
          v-model="kind"
          :items="kinds"
          :content="false"
          variant="link"
          :ui="{ root: 'gap-0', list: '-mx-4 sm:-mx-6 px-2 sm:px-4' }"
        />
        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            :placeholder="t(`editor.symbols.search.${kind}`)"
            autofocus
            class="flex-1 min-w-48"
          />
          <ChoiceRow
            v-if="kind === 'icon' && category !== IN_DECK"
            :choices="styles"
            size="sm"
            @choose="style = $event as typeof style"
          />
        </div>
        <USelect
          v-model="category"
          :items="categories"
          :aria-label="t('editor.symbols.category')"
          class="w-full sm:hidden"
        />
      </div>

      <div class="flex flex-1 min-h-0">
        <nav
          class="max-sm:hidden w-48 shrink-0 overflow-y-auto border-e border-default p-2"
          :aria-label="t('editor.symbols.category')"
        >
          <UButton
            v-for="entry in categories"
            :key="entry.value"
            color="neutral"
            :variant="category === entry.value ? 'soft' : 'ghost'"
            size="sm"
            block
            class="justify-between"
            :class="category === entry.value ? 'text-highlighted' : entry.count ? 'text-toned' : 'text-dimmed'"
            :aria-current="category === entry.value ? 'true' : undefined"
            @click="() => { category = entry.value }"
          >
            <span class="truncate">{{ entry.label }}</span>
            <span class="text-xs text-muted tabular-nums">{{ entry.count }}</span>
          </UButton>
        </nav>

        <div class="flex-1 min-w-0 overflow-y-auto p-2 sm:p-3">
          <p
            v-if="status !== 'ready'"
            class="p-2 text-sm text-muted"
            role="status"
          >
            {{ t(`editor.symbols.${status}`) }}
          </p>
          <p
            v-else-if="!shown.length"
            class="p-2 text-sm text-muted"
          >
            {{ category === IN_DECK && !query ? t(`editor.symbols.emptyDeck.${kind}`) : t('editor.symbols.empty', { query }) }}
          </p>
          <ul
            v-else
            class="grid grid-cols-[repeat(auto-fill,minmax(5rem,1fr))] gap-1"
          >
            <li
              v-for="option in shown"
              :key="option.name"
              class="symbol-tile"
            >
              <button
                type="button"
                class="flex w-full flex-col items-center gap-2 rounded-md px-1 pt-3 pb-2 text-toned hover:bg-elevated hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary disabled:pointer-events-none"
                :class="isCurrent(option) ? 'bg-elevated text-highlighted ring ring-default' : ''"
                :aria-pressed="isCurrent(option)"
                :title="symbolValue(kind, option.name)"
                :disabled="disabled"
                @click="choose(option)"
              >
                <UIcon
                  v-if="kind === 'icon'"
                  :name="symbolValue(kind, option.name)"
                  class="size-6"
                />
                <svg
                  v-else
                  aria-hidden="true"
                  viewBox="0 0 80 80"
                  class="pictogram size-10"
                >
                  <use
                    v-for="layer in PICTOGRAM_LAYERS"
                    :key="layer"
                    :class="`pictogram-${layer}`"
                    :href="pictogramLayer(option.name, layer)"
                  />
                </svg>
                <span class="line-clamp-2 min-h-8 w-full break-words text-center text-xs leading-4">{{ option.label }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #footer>
      <CodeText
        :key="locale"
        :text="target"
        class="block text-xs text-muted [&_code]:text-default"
      />
    </template>
  </USlideover>
</template>

<style scoped>
/* A tile off screen skips its layout and its drawing until the list scrolls to it. */
.symbol-tile {
  content-visibility: auto;
  contain-intrinsic-size: auto 5rem;
}
</style>

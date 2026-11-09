import type { Completion, CompletionResult } from '@codemirror/autocomplete'
import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { ComponentAttribute, SymbolKind } from '@vignettes/core/deck'
import type { Translate } from '../config/editor-reference'
import type { ComponentAtCursor } from './editor-properties'
import { insertCompletionText, pickedCompletion } from '@codemirror/autocomplete'
import { addCollection, buildIcon, loadIcon } from '@iconify/vue'
import { attributedDirective, attributeNamed, normalizeIconName, splitFrontmatter, valueMentions } from '@vignettes/core/deck'
import { deckThemeName, themeLineage } from '@vignettes/core/theme'
import { SYMBOL_WORDS } from '../config/symbol-words'
import { attributeChange, componentAt } from './editor-properties'

/**
 * The theme whose family the editor completes symbols for: its components draw
 * the pictograms and the Remix icons.
 */
const SYMBOL_THEME = 'dsfr'

const ICON_PREFIX = 'ri:'

export interface SymbolOption {
  /** The name written after the prefix: `home-line`, `digital/coding`. */
  name: string
  /** The Remix category of an icon (`User & Faces`), the folder of a pictogram (`digital`). */
  category: string
}

const lists = new Map<SymbolKind, SymbolOption[]>()
const pending = new Map<SymbolKind, Promise<SymbolOption[]>>()

async function fetchList(kind: SymbolKind): Promise<SymbolOption[]> {
  if (kind === 'pictogram')
    return (await $fetch<string[]>('/api/pictograms')).map(name => ({ name, category: name.split('/')[0]! }))
  // The names and categories of the set, without the drawings.
  const { default: metadata } = await import('@iconify-json/ri/metadata.json')
  return Object.entries(metadata.categories as Record<string, string[]>)
    .flatMap(([category, names]) => names.map(name => ({ name, category })))
}

/** The list of a kind: at once when it is loaded, else its loading; a failed loading is tried again on the next request. */
export function symbolList(kind: SymbolKind): SymbolOption[] | Promise<SymbolOption[]> {
  const list = lists.get(kind)
  if (list)
    return list
  let loading = pending.get(kind)
  if (!loading) {
    loading = fetchList(kind)
      .then((options) => {
        lists.set(kind, options)
        return options
      })
      .catch(() => [])
      .finally(() => pending.delete(kind))
    pending.set(kind, loading)
  }
  return loading
}

let drawings: Promise<void> | undefined

/**
 * The drawings of the whole Remix set, added with `addCollection` to the icons
 * `UIcon` draws from memory, for a view that shows them all: one file of 250 kB
 * compressed. `@nuxt/icon` registers its server as an Iconify API provider,
 * whose requests `@iconify/vue` cuts at 500 characters of URL, about eighty
 * requests for the 3,000 names of the set.
 */
export function loadIconDrawings(): Promise<void> {
  drawings ??= import('@iconify-json/ri/icons.json').then(({ default: set }) => {
    addCollection(set)
  }, (error) => {
    drawings = undefined
    throw error
  })
  return drawings
}

/** The theme a deck declares builds on `dsfr`; a deck without `theme` takes the instance's fallback. */
export function offersSymbols(text: string): boolean {
  return themeLineage(deckThemeName(splitFrontmatter(text).data)).includes(SYMBOL_THEME)
}

/** The value a deck writes for a symbol: `ri:home-line`, `digital/coding`. */
export function symbolValue(kind: SymbolKind, name: string): string {
  return kind === 'icon' ? `${ICON_PREFIX}${name}` : name
}

/** The translation key of a category, its words joined by hyphens: `editor.symbols.categories.user-faces`. */
export function categoryKey(kind: SymbolKind, category: string): string {
  return `editor.symbols.${kind === 'icon' ? 'categories' : 'folders'}.${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

/**
 * The name of a category in the interface, else as the set or the folder
 * writes it: vue-i18n gives back the key of a missing message, which the
 * completion's `Translate` reads without `te`.
 */
export function categoryLabel(kind: SymbolKind, category: string, t: Translate): string {
  const key = categoryKey(kind, category)
  const label = t(key)
  return label === key ? category : label
}

/** A text as the search compares it: lowercase, without accents, hyphens and slashes as spaces. */
export function searchFold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').toLowerCase().replace(/[-/]/g, ' ')
}

const folded = new Map<string, [string, string[]][]>()

/**
 * The name parts a typed word matches: the word itself, and in the author's
 * language the parts listed for each dictionary word that starts with it or
 * that it extends by at most two letters, as a plural (`mais` and `maisons`
 * both match `home` and `house`).
 */
export function searchTerms(word: string, lang: string): string[] {
  let words = folded.get(lang)
  if (!words) {
    words = Object.entries(SYMBOL_WORDS[lang] ?? {}).map(([key, parts]) => [searchFold(key), parts.map(searchFold)])
    folded.set(lang, words)
  }
  if (word.length < 3)
    return [word]
  return [word, ...words.flatMap(([key, parts]) => key.startsWith(word) || (word.startsWith(key) && word.length - key.length <= 2) ? parts : [])]
}

/** The symbols a deck names in the attributes of its components, in their order of first appearance. */
export function symbolsInDeck(text: string): Record<SymbolKind, string[]> {
  const found: Record<SymbolKind, Set<string>> = { icon: new Set(), pictogram: new Set() }
  for (const { tag, name, value } of valueMentions(text)) {
    const directive = attributedDirective(tag)
    const attribute = directive && attributeNamed(directive, name)
    const kind = attribute?.symbol
    if (kind === 'pictogram')
      found.pictogram.add(value)
    else if (kind === 'icon' && /^ri[:-]./.test(value))
      found.icon.add(normalizeIconName(value).slice(ICON_PREFIX.length))
  }
  return { icon: [...found.icon], pictogram: [...found.pictogram] }
}

/** The component at the caret and its attribute that names a symbol of a kind. */
export interface SymbolPlacement {
  component: ComponentAtCursor
  attribute: ComponentAttribute
  /** The attribute is written already. */
  written: boolean
}

export function symbolPlacement(state: EditorState, kind: SymbolKind): SymbolPlacement | undefined {
  const component = componentAt(state)
  const attribute = component?.directive.attributes?.find(entry => entry.symbol === kind)
  return component && attribute
    ? { component, attribute, written: component.written.some(entry => entry.attribute === attribute) }
    : undefined
}

/** The syntax a symbol takes where no component around the caret has an attribute for it. */
export function symbolInsertion(kind: SymbolKind, name: string): string {
  return kind === 'icon' ? `:i{name="${symbolValue(kind, name)}"}` : `![](/pictograms/${name}.svg)`
}

/**
 * The symbol written at the caret: the value of the attribute of the component
 * there that names this kind of symbol, else an inline icon or the image of the
 * pictogram at the caret.
 */
export function symbolChange(state: EditorState, kind: SymbolKind, name: string): TransactionSpec {
  const placement = symbolPlacement(state, kind)
  if (placement)
    return attributeChange(state, placement.attribute, symbolValue(kind, name))
  const { from, to } = state.selection.main
  const insert = symbolInsertion(kind, name)
  return { changes: { from, to, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true, userEvent: 'input' }
}

/**
 * The layers of a DSFR pictogram file, back to front, each a symbol its file
 * names `artwork-<layer>`, colored by the class `pictogram-<layer>` in each color mode.
 */
export const PICTOGRAM_LAYERS = ['decorative', 'minor', 'major'] as const

/** The address of a layer of a pictogram. */
export function pictogramLayer(name: string, layer: typeof PICTOGRAM_LAYERS[number]): string {
  return `/pictograms/${name}.svg#artwork-${layer}`
}

const SVG = 'http://www.w3.org/2000/svg'

function preview(kind: SymbolKind, name: string): Element | Promise<Element | null> {
  if (kind === 'pictogram') {
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('class', 'cm-symbol-preview cm-symbol-preview--pictogram pictogram')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('viewBox', '0 0 80 80')
    for (const layer of PICTOGRAM_LAYERS) {
      const use = document.createElementNS(SVG, 'use')
      use.setAttribute('class', `pictogram-${layer}`)
      use.setAttribute('href', pictogramLayer(name, layer))
      svg.append(use)
    }
    return svg
  }
  return loadIcon(symbolValue(kind, name)).then((icon) => {
    const { attributes, body } = buildIcon(icon)
    const svg = document.createElementNS(SVG, 'svg')
    svg.setAttribute('class', 'cm-symbol-preview')
    svg.setAttribute('aria-hidden', 'true')
    for (const [key, value] of Object.entries(attributes))
      svg.setAttribute(key, String(value))
    // The drawing comes from the Remix set the server bundles.
    svg.innerHTML = body
    return svg
  }, () => null)
}

/** The card beside a symbol: its image, then its name as the deck writes it. */
async function symbolCard(kind: SymbolKind, option: SymbolOption): Promise<HTMLElement> {
  const dom = document.createElement('div')
  dom.className = 'cm-source-tooltip'
  const image = await preview(kind, option.name)
  if (image)
    dom.append(image)
  const name = document.createElement('p')
  const code = document.createElement('code')
  code.className = 'cm-source-tooltip__key'
  code.textContent = symbolValue(kind, option.name)
  name.append(code)
  dom.append(name)
  return dom
}

export interface SymbolCompletionOptions {
  t: Translate
  /** Opens the view of all the symbols of a kind; without it, the list leaves it out. */
  browse?: (kind: SymbolKind) => void
}

/**
 * The completion of a symbol value typed from `start` to the caret, the
 * attributes that name a symbol being `icon`, `picto` and the `name` of `:i`:
 * the view of all the symbols of the kind first, then the Remix icons or the
 * pictograms, the card beside the list showing the image of each. `typed` may
 * open with a quote, which stays, and with `ri:` or `ri-`, which becomes `ri:`.
 * `quote` surrounds the value when the attribute has no quotes yet.
 */
export function symbolCompletions(state: EditorState, kind: SymbolKind, start: number, typed: string, quote: string, { t, browse }: SymbolCompletionOptions): CompletionResult | Promise<CompletionResult> | null {
  if (!offersSymbols(state.doc.toString()))
    return null
  const opening = /^["']?/.exec(typed)![0]
  const prefix = kind === 'icon' ? /^ri[:-]/.exec(typed.slice(opening.length))?.[0] ?? '' : ''
  const replaceFrom = start + opening.length
  const browsing: Completion[] = browse
    ? [{ label: t(`editor.symbols.browse.${kind}`), type: 'text', boost: 99, apply: () => browse(kind) }]
    : []
  const result = (options: SymbolOption[]): CompletionResult => ({
    from: replaceFrom + prefix.length,
    options: [...browsing, ...options.map((option): Completion => ({
      label: option.name,
      detail: categoryLabel(kind, option.category, t),
      type: kind === 'icon' ? 'constant' : 'variable',
      info: () => symbolCard(kind, option),
      apply: (view, completion, _from, to) => view.dispatch({
        ...insertCompletionText(view.state, `${quote}${symbolValue(kind, option.name)}${quote}`, replaceFrom, to),
        annotations: pickedCompletion.of(completion),
      }),
    }))],
    // Typing a prefix after the list opened runs the completion again, from after the prefix.
    validFor: kind === 'icon' && !prefix ? /^(?!ri[:-])[\w/-]*$/ : /^[\w/-]*$/,
  })
  const list = symbolList(kind)
  return list instanceof Promise ? list.then(result) : result(list)
}

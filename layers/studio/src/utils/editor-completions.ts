import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type { EditorState, Extension } from '@codemirror/state'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import type { ComponentAttributeEntry, FrontmatterKey, ReferenceEntry, Translate } from '../config/editor-reference'
import { autocompletion, CompletionContext, completionStatus, snippet, snippetCompletion, startCompletion } from '@codemirror/autocomplete'
import { Decoration, keymap, ViewPlugin, WidgetType } from '@codemirror/view'
import { attributedDirective, blocksAround, codeLines, componentKey } from '@vignettes/core/deck'
import { annotationEntries, childEntries, componentAttributeEntries, componentEntries } from '../config/editor-reference'
import { emptyValueKey, frontmatterGuide, inFrontmatter as inFrontmatterLine } from './editor-frontmatter'
import { directiveAt } from './editor-properties'
import { referenceCard } from './editor-tooltip'

/**
 * Writer autocompletion, driven by the declarative authoring reference:
 * frontmatter keys and their closed values inside the leading `---` block,
 * `::` components and `:` annotations in the body, the attributes of the
 * components and of the annotations, and their closed values. Everything is
 * data from editor-reference.ts.
 */

export interface CompletionOptions {
  /** Project slugs completable on `project:`. */
  projects?: readonly string[]
  /** Interface language of the snippets and descriptions. */
  lang: string
  /** Published themes compiled with other theme packages than the studio's, marked on `theme:`. */
  staleThemes?: readonly string[]
  /** The address of a documentation section, none when the instance has no documentation. */
  docsUrl: (docs?: string) => string | undefined
}

/** The tooltip beside a completion: its name, its description and its documentation. */
function entryInfo(entry: ReferenceEntry, options: CompletionOptions, t: Translate) {
  return () => referenceCard({ syntax: entry.syntax, label: entry.label, description: entry.description, docs: options.docsUrl(entry.docs) }, t)
}

/**
 * The completion of a component attribute. A `true`/`false` attribute goes in
 * as the form that changes it: alone when it is false by default, as
 * `:name="false"` when it is true by default. An attribute with closed values
 * goes in with empty quotes and opens the list of its values.
 */
function attributeCompletion(attribute: ComponentAttributeEntry, bound: boolean, docs: string | undefined, t: Translate): Completion {
  const prefix = bound ? ':' : ''
  const text = attribute.boolean
    ? attribute.default === 'true' ? `:${attribute.name}="false"` : `${prefix}${attribute.name}${bound ? '="true"' : ''}`
    : `${prefix}${attribute.name}="\${${attribute.values ? '' : attribute.default ?? ''}}"`
  const insert = snippet(text)
  return {
    label: `${prefix}${attribute.name}`,
    detail: attribute.default === undefined ? undefined : t('editor.attributeDefault', { value: attribute.default }),
    info: () => referenceCard({ syntax: attribute.name, description: attribute.description, values: attribute.values, default: attribute.default, docs }, t),
    type: 'property',
    apply: (view, completion, from, to) => {
      insert(view, completion, from, to)
      if (attribute.values)
        startCompletion(view)
    },
  }
}

/** The closed values of an attribute, in their declared order, the default marked; `quote` surrounds each one. */
function valueCompletions(values: readonly string[], fallback: string | undefined, quote: string, t: Translate): Completion[] {
  return values.map((value, index) => ({
    label: value,
    apply: `${quote}${value}${quote}`,
    boost: -index,
    detail: value === fallback ? t('editor.attributeDefault', { value }) : undefined,
    type: 'enum',
  }))
}

/**
 * The component whose YAML attributes the 1-based `line` sits in: the lines
 * between a `---` right under the opening line of a component and the next `---`.
 */
function propsBlockTag(state: EditorState, line: number): string | undefined {
  for (let n = line - 1; n > 1; n--) {
    const text = state.doc.line(n).text
    if (!text.trim())
      return undefined
    if (text.trim() === '---') {
      const block = blocksAround(state.doc.toString(), n).at(-1)
      return block?.line === n - 1 ? block.name : undefined
    }
  }
  return undefined
}

/** The keys written in the YAML attributes around the 1-based `line`. */
function propsBlockKeys(state: EditorState, line: number): Set<string> {
  const keys = new Set<string>()
  const add = (text: string) => {
    const key = /^\s*([\w-]+):/.exec(text)?.[1]
    if (key)
      keys.add(componentKey(key))
  }
  for (let n = line - 1; n > 1 && state.doc.line(n).text.trim() !== '---'; n--)
    add(state.doc.line(n).text)
  for (let n = line + 1; n <= state.doc.lines && state.doc.line(n).text.trim() !== '---'; n++)
    add(state.doc.line(n).text)
  return keys
}

/** The position sits inside the leading frontmatter block. */
function inFrontmatter(context: CompletionContext): boolean {
  const doc = context.state.doc
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---')
    return false
  const here = doc.lineAt(context.pos).number
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === '---')
      return here > 1 && here < n
  }
  return here > 1
}

// Completions are built on each query so they follow a locale change and the
// components registered since the editor opened.
export function bodySource(options: CompletionOptions, t: Translate) {
  const { lang, docsUrl } = options
  const build = (entries: readonly ReferenceEntry[], type: string): Completion[] =>
    entries.map(entry => snippetCompletion(entry.snippet, {
      label: entry.syntax,
      detail: entry.label,
      info: entryInfo(entry, options, t),
      type,
    }))

  return (context: CompletionContext): CompletionResult | null => {
    if (inFrontmatter(context))
      return null

    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)

    // The closed values of an attribute, inside `::Name{… size="…`, or after
    // `size=` before its quotes, which the value then brings.
    const valueOf = before.match(/(?:^|[\s([]):{1,3}([\w-]+)\{(?:(?:[^}"]|"[^"]*")*\s)?(:?[\w-]+)=("?)([^"\s}]*)$/)
    if (valueOf) {
      const [, tag = '', name = '', quote, typed = ''] = valueOf
      const attribute = componentAttributeEntries(tag, lang)?.find(entry => componentKey(entry.name) === componentKey(name.replace(/^:/, '')))
      const values = attribute?.values ?? (attribute?.boolean && name.startsWith(':') ? ['true', 'false'] : undefined)
      return attribute && values
        ? { from: context.pos - typed.length, options: valueCompletions(values, attribute.default, quote ? '' : '"', t) }
        : null
    }

    // The attributes of a component or an annotation, after its brace or a
    // space inside it, but those written already on either side of the caret.
    const blockOf = before.match(/(?:^|[\s([]):{1,3}([\w-]+)\{((?:[^}"]|"[^"]*")*)$/)
    const attributeWord = blockOf?.[2]!.match(/(?:^|\s)(:?[\w-]*)$/)?.[1]
    const attributes = blockOf && componentAttributeEntries(blockOf[1]!, lang)
    if (blockOf && attributeWord !== undefined && attributes) {
      // The attribute the caret is in is the one being typed.
      const caret = context.pos - line.from
      const written = new Set(directiveAt(context.state, line.number, caret)?.written.filter(entry => !(entry.column < caret && caret <= entry.column + entry.text.length)).map(entry => componentKey(entry.name.replace(/^:/, ''))))
      const docs = docsUrl(attributedDirective(blockOf[1]!)?.docs)
      return {
        from: context.pos - attributeWord.length,
        options: attributes
          .filter(attribute => !written.has(componentKey(attribute.name)))
          .map((attribute, index) => ({ ...attributeCompletion(attribute, attributeWord.startsWith(':'), docs, t), boost: -index })),
        validFor: /^:?[\w-]*$/,
      }
    }

    // The attributes written as YAML between `---` lines under the opening line of a component.
    const yamlTag = propsBlockTag(context.state, line.number)
    const yamlAttributes = yamlTag ? componentAttributeEntries(yamlTag, lang) : undefined
    if (yamlTag && yamlAttributes) {
      const yamlValue = /^\s*([\w-]+):\s*(\S*)$/.exec(before)
      if (yamlValue) {
        const attribute = yamlAttributes.find(entry => componentKey(entry.name) === componentKey(yamlValue[1]!))
        const values = attribute?.values ?? (attribute?.boolean ? ['true', 'false'] : undefined)
        return attribute && values
          ? { from: context.pos - yamlValue[2]!.length, options: valueCompletions(values, attribute.default, '', t), validFor: /^\S*$/ }
          : null
      }
      const yamlKey = /^\s*([\w-]*)$/.exec(before)
      if (!yamlKey)
        return null
      const written = propsBlockKeys(context.state, line.number)
      return {
        from: context.pos - yamlKey[1]!.length,
        options: yamlAttributes
          .filter(attribute => !written.has(componentKey(attribute.name)))
          .map((attribute, index) => ({ label: attribute.name, apply: `${attribute.name}: `, detail: attribute.default === undefined ? undefined : t('editor.attributeDefault', { value: attribute.default }), type: 'property', boost: -index })),
        validFor: /^[\w-]*$/,
      }
    }

    // `::` and `:::` open the block components; inside a component that has
    // its own (`:::Scheme` and its `::Step`), those only. A lone `:` opens the
    // annotations at the start of a line, and the components written in a
    // sentence (`:i`) after a letter: in a sentence, a colon alone is punctuation.
    const directiveMatch = before.match(/(^|\s)(:{1,3})([\w-]*)$/)
    if (!directiveMatch)
      return null
    const [, lead = '', colons = '', word = ''] = directiveMatch
    const lineStart = !before.slice(0, directiveMatch.index! + lead.length).trim()
    if (colons.length === 1 && !lineStart && !word && !context.explicit)
      return null
    const from = context.pos - word.length - colons.length
    const enclosing = blocksAround(context.state.doc.toString(), line.number).at(-1)
    const children = enclosing ? childEntries(enclosing.name, lang) : []
    const inline = componentEntries(lang).filter(entry => /^:[^:]/.test(entry.syntax))
    const options = children.length
      ? build(children, 'class')
      : colons.length >= 2
        ? build(componentEntries(lang).filter(entry => !inline.includes(entry)), 'class')
        : [...(lineStart ? build(annotationEntries(lang), 'keyword') : []), ...build(inline, 'class')]
    // Another colon asks the list again, for the components of that many colons.
    return { from, options, validFor: new RegExp(`^${colons}[\\w-]*$`) }
  }
}

/** Where the caret line shows a hint: suggestions the shortcut opens, the component list, or what a free value takes. */
export type HintKind = 'settings' | 'attributes' | 'values' | 'insert' | 'free'

export interface Hint {
  kind: HintKind
  /** The frontmatter key of a free value, whose description the hint shows. */
  key?: FrontmatterKey
  /** On an empty line, the component around it whose own components the hint names. */
  parent?: string
}

/** The completion sources the hint asks whether they have something to offer. */
export interface HintSources {
  frontmatter: CompletionSource
  body: CompletionSource
}

function offers(source: CompletionSource, state: EditorState, pos: number) {
  const result = source(new CompletionContext(state, pos, true))
  return Boolean(result && !(result instanceof Promise) && result.options.length)
}

/**
 * The hint of the caret: on an empty line of the frontmatter, after the colon
 * of a key without a value, after the brace or a space in the attributes of a
 * component or of `:layout`, between the empty quotes of an attribute with
 * closed values, and on an empty line of the body outside code. Nothing while
 * the suggestions are open.
 */
export function hintAt(state: EditorState, sources: HintSources): Hint | null {
  const { head, empty } = state.selection.main
  if (!empty || completionStatus(state))
    return null
  const line = state.doc.lineAt(head)
  if (inFrontmatterLine(state, line.number)) {
    if (!line.text.trim())
      return { kind: 'settings' }
    const key = emptyValueKey(state, head)
    if (!key || (key.children && !key.values))
      return null
    return offers(sources.frontmatter, state, head) ? { kind: 'values' } : { kind: 'free', key }
  }
  const raw = state.doc.toString()
  if (codeLines(raw).has(line.number - 1))
    return null
  if (!line.text.trim()) {
    const enclosing = blocksAround(raw, line.number).at(-1)
    return enclosing ? { kind: 'insert', parent: enclosing.name } : { kind: 'insert' }
  }
  const before = line.text.slice(0, head - line.from)
  const kind = /[{\s]$/.test(before) ? 'attributes' : before.endsWith('="') && line.text[head - line.from] === '"' ? 'values' : null
  return kind && offers(sources.body, state, head) ? { kind } : null
}

/** What a hint offers to type: `::` and the name of what it opens. */
interface HintChoice { colons: string, label: string }

class HintWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: HintKind, readonly choices: readonly HintChoice[] = []) {
    super()
  }

  override toDOM(view: EditorView) {
    const hint = document.createElement('span')
    hint.className = this.kind === 'free' ? 'cm-hint cm-hint--text' : 'cm-hint'
    if (this.kind === 'free') {
      hint.textContent = this.text
      return hint
    }
    // A click opens what the shortcut opens; a choice writes its colons first.
    const open = (event: MouseEvent, colons = '') => {
      event.preventDefault()
      event.stopPropagation()
      if (colons) {
        const at = view.state.selection.main.head
        view.dispatch({ changes: { from: at, insert: colons }, selection: { anchor: at + colons.length } })
      }
      view.focus()
      startCompletion(view)
    }
    if (!this.choices.length) {
      hint.textContent = this.text
      hint.addEventListener('mousedown', event => open(event))
      return hint
    }
    for (const choice of this.choices) {
      const item = document.createElement('span')
      item.className = 'cm-hint__choice'
      const key = document.createElement('kbd')
      key.className = 'cm-hint__key'
      key.textContent = choice.colons
      item.append(key, ` ${choice.label}`)
      item.addEventListener('mousedown', event => open(event, choice.colons))
      hint.append(item)
    }
    return hint
  }

  override eq(other: HintWidget) {
    return other.text === this.text && other.kind === this.kind && JSON.stringify(other.choices) === JSON.stringify(this.choices)
  }
}

/**
 * The hint at the end of the caret line. An empty value with closed values
 * opens its list as soon as the author reaches it or empties it.
 */
function completionHint(sources: HintSources, t: Translate, lang: string): Extension {
  // On an empty line: the components of the block around it, or the annotations and the components.
  function choices(hint: Hint): HintChoice[] {
    const children = hint.parent ? childEntries(hint.parent, lang) : []
    return children.length
      ? [{ colons: '::', label: children.map(entry => entry.label.toLowerCase()).join(' · ') }]
      : [{ colons: ':', label: t('editor.hints.annotation') }, { colons: '::', label: t('editor.hints.component') }]
  }

  function decorate(view: EditorView, hint: Hint | null): DecorationSet {
    if (!hint)
      return Decoration.none
    const text = hint.kind === 'free' ? t(hint.key!.descriptionKey) : hint.kind === 'insert' ? '' : t(`editor.hints.${hint.kind}`)
    const widget = new HintWidget(text, hint.kind, hint.kind === 'insert' ? choices(hint) : [])
    return Decoration.set([Decoration.widget({ widget, side: 1 }).range(view.state.doc.lineAt(view.state.selection.main.head).to)])
  }

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorate(view, view.hasFocus ? hintAt(view.state, sources) : null)
    }

    update(update: ViewUpdate) {
      const hint = update.view.hasFocus ? hintAt(update.state, sources) : null
      this.decorations = decorate(update.view, hint)
      const moved = update.selectionSet || update.transactions.some(tr => tr.isUserEvent('input') || tr.isUserEvent('delete'))
      if (hint?.kind === 'values' && moved)
        setTimeout(() => startCompletion(update.view))
    }
  }, { decorations: plugin => plugin.decorations })
}

/** The full autocompletion extension for the writer, its shortcut and its hint. */
export function deckCompletions(options: CompletionOptions, t: Translate): Extension {
  const frontmatter = frontmatterGuide({ ...options, t })
  const sources = { frontmatter: frontmatter.source, body: bodySource(options, t) }
  return [
    autocompletion({
      override: [sources.frontmatter, sources.body],
      icons: false,
    }),
    // macOS keeps Ctrl-Space to switch the input source.
    keymap.of([{ key: 'Mod-Shift-Space', run: startCompletion }]),
    frontmatter.extension,
    completionHint(sources, t, options.lang),
  ]
}

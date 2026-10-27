import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete'
import type { EditorState, Extension } from '@codemirror/state'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import type { ComponentAttributeEntry, FrontmatterKey, ReferenceEntry, Translate } from '../config/editor-reference'
import { autocompletion, CompletionContext, completionStatus, snippet, snippetCompletion, startCompletion } from '@codemirror/autocomplete'
import { Decoration, keymap, ViewPlugin, WidgetType } from '@codemirror/view'
import { componentKey, deckComponentNamed } from '@vignettes/core/deck'
import { annotationEntries, componentAttributeEntries, componentEntries, layoutAttributeEntries } from '../config/editor-reference'
import { emptyValueKey, frontmatterGuide, inFrontmatter as inFrontmatterLine } from './editor-frontmatter'
import { referenceCard } from './editor-tooltip'

/**
 * Writer autocompletion, driven by the declarative authoring reference:
 * frontmatter keys and their closed values inside the leading `---` block,
 * `::` components and `:` annotations in the body, the attributes of
 * `:layout{…}` and of the components, and their closed values. Everything is
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

    // The closed values of a `:layout` attribute, inside `:layout{… media="…`.
    const valueMatch = before.match(/:layout\{[^}]*?\b([\w-]+)="([^"]*)$/)
    if (valueMatch) {
      const values = layoutAttributeEntries(lang).find(entry => entry.name === valueMatch[1])?.values
      return values
        ? { from: context.pos - valueMatch[2]!.length, options: values.map(value => ({ label: value, type: 'enum' })) }
        : null
    }

    // The attributes of `:layout`, after its brace or a space inside it.
    const inside = before.match(/:layout\{((?:[^}"]|"[^"]*")*)$/)?.[1]
    const attributeMatch = inside?.match(/(?:^|\s)([\w-]*)$/)
    if (attributeMatch) {
      return {
        from: context.pos - attributeMatch[1]!.length,
        options: layoutAttributeEntries(lang).map(entry => snippetCompletion(
          entry.flag ? entry.name : `${entry.name}="\${${entry.default ?? ''}}"`,
          { label: entry.name, info: entry.description, type: 'property' },
        )),
        validFor: /^[\w-]*$/,
      }
    }

    // The closed values of a component attribute, inside `::Name{… size="…`.
    const valueOf = before.match(/(?:^|[\s([]):{1,3}([\w-]+)\{(?:(?:[^}"]|"[^"]*")*\s)?(:?[\w-]+)="([^"]*)$/)
    if (valueOf) {
      const [, tag = '', name = '', typed = ''] = valueOf
      const attribute = componentAttributeEntries(tag, lang)?.find(entry => componentKey(entry.name) === componentKey(name.replace(/^:/, '')))
      const values = attribute?.values ?? (attribute?.boolean && name.startsWith(':') ? ['true', 'false'] : undefined)
      return attribute && values
        ? { from: context.pos - typed.length, options: values.map((value, index) => ({ label: value, boost: -index, detail: value === attribute.default ? t('editor.attributeDefault', { value }) : undefined, type: 'enum' })) }
        : null
    }

    // The attributes of a component, after its brace or a space inside it, but those written already.
    const blockOf = before.match(/(?:^|[\s([]):{1,3}([\w-]+)\{((?:[^}"]|"[^"]*")*)$/)
    const attributeWord = blockOf?.[2]!.match(/(?:^|\s)(:?[\w-]*)$/)?.[1]
    const attributes = blockOf && componentAttributeEntries(blockOf[1]!, lang)
    if (blockOf && attributeWord !== undefined && attributes) {
      const written = new Set([...blockOf[2]!.replace(/"[^"]*"/g, '""').matchAll(/(?:^|\s):?([\w-]+)/g)].map(match => componentKey(match[1]!)))
      const typed = componentKey(attributeWord.replace(/^:/, ''))
      const docs = docsUrl(deckComponentNamed(blockOf[1]!)?.docs)
      return {
        from: context.pos - attributeWord.length,
        options: attributes
          .filter(attribute => !written.has(componentKey(attribute.name)) || componentKey(attribute.name) === typed)
          .map((attribute, index) => ({ ...attributeCompletion(attribute, attributeWord.startsWith(':'), docs, t), boost: -index })),
        validFor: /^:?[\w-]*$/,
      }
    }

    // `::` (and `:::`) opens the component list; a lone `:` offers annotations too.
    const directiveMatch = before.match(/(^|\s)(:{1,3})([\w-]*)$/)
    if (!directiveMatch)
      return null
    const colons = directiveMatch[2]!
    const word = directiveMatch[3]!
    const from = context.pos - word.length - colons.length
    const components = build(componentEntries(lang), 'class')
    const options = colons.length >= 2
      ? components
      : [...build(annotationEntries(lang), 'keyword'), ...components]
    return { from, options, validFor: /^:{0,3}[\w-]*$/ }
  }
}

/**
 * Slash menu: typing `/` at the start of a line offers every block by a plain
 * name (`/quote`, `/columns`, `/layout`) and inserts the exact snippet. It gives
 * newcomers one discoverable entry point without knowing the `::`/`:` syntax.
 */
function slashSource(options: CompletionOptions, t: Translate) {
  const { lang } = options
  const name = (label: string) => label.replace(/^:+/, '').toLowerCase()
  const build = (entries: readonly ReferenceEntry[], type: string): Completion[] =>
    entries.map(entry => snippetCompletion(entry.snippet, {
      label: `/${name(entry.syntax)}`,
      detail: entry.label,
      info: entryInfo(entry, options, t),
      type,
    }))

  return (context: CompletionContext): CompletionResult | null => {
    if (inFrontmatter(context))
      return null
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    const match = before.match(/^\s*\/([\w-]*)$/)
    if (!match)
      return null
    return {
      from: context.pos - match[1]!.length - 1,
      options: [
        ...build(componentEntries(lang), 'class'),
        ...build(annotationEntries(lang), 'keyword'),
      ],
      validFor: /^\/[\w-]*$/,
    }
  }
}

/** The 1-based line sits inside fenced code. */
function inFence(state: EditorState, line: number): boolean {
  let fenced = false
  for (let n = 1; n < line; n++) {
    if (/^\s*(?:```|~~~)/.test(state.doc.line(n).text))
      fenced = !fenced
  }
  return fenced
}

/** Where the caret line shows a hint: suggestions the shortcut opens, the slash menu, or what a free value takes. */
export type HintKind = 'settings' | 'attributes' | 'values' | 'insert' | 'free'

export interface Hint {
  kind: HintKind
  /** The frontmatter key of a free value, whose description the hint shows. */
  key?: FrontmatterKey
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
  if (inFence(state, line.number))
    return null
  if (!line.text.trim())
    return { kind: 'insert' }
  const before = line.text.slice(0, head - line.from)
  const kind = /[{\s]$/.test(before) ? 'attributes' : before.endsWith('="') && line.text[head - line.from] === '"' ? 'values' : null
  return kind && offers(sources.body, state, head) ? { kind } : null
}

class HintWidget extends WidgetType {
  constructor(readonly text: string, readonly kind: HintKind) {
    super()
  }

  override toDOM(view: EditorView) {
    const hint = document.createElement('span')
    hint.className = this.kind === 'free' ? 'cm-hint cm-hint--text' : 'cm-hint'
    hint.textContent = this.text
    if (this.kind === 'free')
      return hint
    // A click opens what the shortcut opens; the slash menu needs its slash.
    hint.addEventListener('mousedown', (event) => {
      event.preventDefault()
      if (this.kind === 'insert') {
        const at = view.state.selection.main.head
        view.dispatch({ changes: { from: at, insert: '/' }, selection: { anchor: at + 1 } })
      }
      view.focus()
      startCompletion(view)
    })
    return hint
  }

  override eq(other: HintWidget) {
    return other.text === this.text && other.kind === this.kind
  }
}

/**
 * The hint at the end of the caret line. An empty value with closed values
 * opens its list as soon as the author reaches it or empties it.
 */
function completionHint(sources: HintSources, t: Translate): Extension {
  function decorate(view: EditorView, hint: Hint | null): DecorationSet {
    if (!hint)
      return Decoration.none
    const text = hint.kind === 'free' ? t(hint.key!.descriptionKey) : t(`editor.hints.${hint.kind}`)
    const widget = new HintWidget(text, hint.kind)
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
      override: [sources.frontmatter, slashSource(options, t), sources.body],
      icons: false,
    }),
    // macOS keeps Ctrl-Space to switch the input source.
    keymap.of([{ key: 'Mod-Shift-Space', run: startCompletion }]),
    frontmatter.extension,
    completionHint(sources, t),
  ]
}

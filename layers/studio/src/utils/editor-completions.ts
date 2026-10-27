import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { ReferenceEntry, Translate } from '../config/editor-reference'
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import { annotationEntries, componentEntries, layoutAttributeEntries } from '../config/editor-reference'
import { frontmatterGuide } from './editor-frontmatter'
import { referenceCard } from './editor-tooltip'

/**
 * Writer autocompletion, driven by the declarative authoring reference:
 * frontmatter keys and their closed values inside the leading `---` block,
 * `::` components and `:` annotations in the body, the attributes of
 * `:layout{…}` and their closed values. Everything is data from
 * editor-reference.ts.
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
function bodySource(options: CompletionOptions, t: Translate) {
  const { lang } = options
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

/** The full autocompletion extension for the writer. */
export function deckCompletions(options: CompletionOptions, t: Translate): Extension {
  const frontmatter = frontmatterGuide({ ...options, t })
  return [
    autocompletion({
      override: [frontmatter.source, slashSource(options, t), bodySource(options, t)],
      icons: false,
    }),
    frontmatter.extension,
  ]
}

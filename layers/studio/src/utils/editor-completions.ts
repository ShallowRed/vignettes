import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { ReferenceSnippet, Translate } from '../config/editor-reference'
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import {
  ANNOTATION_SNIPPETS,
  COMPONENT_SNIPPETS,
  LAYOUT_NAMES,
  referenceLabel,
} from '../config/editor-reference'
import { frontmatterGuide } from './editor-frontmatter'

/**
 * Writer autocompletion, driven by the declarative authoring reference:
 * frontmatter keys and their closed values inside the leading `---` block,
 * `::` components and `:` annotations in the body, layout names inside
 * `:layout{name="…"}`. Everything is data from editor-reference.ts.
 */

export interface CompletionOptions {
  /** Project slugs completable on `project:`. */
  projects?: readonly string[]
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

// Completions are built on each query so they follow a locale change.
function bodySource(t: Translate) {
  const build = (entries: readonly ReferenceSnippet[], type: string): Completion[] =>
    entries.map(entry => snippetCompletion(entry.snippet, {
      label: referenceLabel(entry, t),
      info: t(entry.descriptionKey),
      type,
    }))

  return (context: CompletionContext): CompletionResult | null => {
    if (inFrontmatter(context))
      return null

    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)

    // Layout names inside `:layout{name="…`.
    const layoutMatch = before.match(/:layout\{name="([\w-]*)$/)
    if (layoutMatch) {
      return {
        from: context.pos - layoutMatch[1]!.length,
        options: LAYOUT_NAMES.map(name => ({ label: name, type: 'enum' })),
      }
    }

    // `::` (and `:::`) opens the component list; a lone `:` offers annotations too.
    const directiveMatch = before.match(/(^|\s)(:{1,3})([\w-]*)$/)
    if (!directiveMatch)
      return null
    const colons = directiveMatch[2]!
    const word = directiveMatch[3]!
    const from = context.pos - word.length - colons.length
    const options = colons.length >= 2
      ? build(COMPONENT_SNIPPETS, 'class')
      : [...build(ANNOTATION_SNIPPETS, 'keyword'), ...build(COMPONENT_SNIPPETS, 'class')]
    return { from, options, validFor: /^:{0,3}[\w-]*$/ }
  }
}

/**
 * Slash menu: typing `/` at the start of a line offers every block by a plain
 * name (`/quote`, `/columns`, `/layout`) and inserts the exact snippet. It gives
 * newcomers one discoverable entry point without knowing the `::`/`:` syntax.
 */
function slashSource(t: Translate) {
  const name = (label: string) => label.replace(/^:+/, '').toLowerCase()
  const build = (entries: readonly ReferenceSnippet[], type: string): Completion[] =>
    entries.map(entry => snippetCompletion(entry.snippet, {
      label: `/${name(entry.label)}`,
      detail: referenceLabel(entry, t),
      info: t(entry.descriptionKey),
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
        ...build(COMPONENT_SNIPPETS, 'class'),
        ...build(ANNOTATION_SNIPPETS, 'keyword'),
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
      override: [frontmatter.source, slashSource(t), bodySource(t)],
      icons: false,
    }),
    frontmatter.extension,
  ]
}

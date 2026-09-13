import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import {
  ANNOTATION_SNIPPETS,
  COMPONENT_SNIPPETS,
  LAYOUT_NAMES,
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

function bodySource() {
  const componentCompletions: Completion[] = COMPONENT_SNIPPETS.map(entry =>
    snippetCompletion(entry.snippet, {
      label: entry.label,
      info: entry.description,
      type: 'class',
    }))
  const annotationCompletions: Completion[] = ANNOTATION_SNIPPETS.map(entry =>
    snippetCompletion(entry.snippet, {
      label: entry.label,
      info: entry.description,
      type: 'keyword',
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
      ? componentCompletions
      : [...annotationCompletions, ...componentCompletions]
    return { from, options, validFor: /^:{0,3}[\w-]*$/ }
  }
}

/**
 * Slash menu: typing `/` at the start of a line offers every block by a plain
 * name (`/quote`, `/columns`, `/layout`) and inserts the exact snippet. It gives
 * newcomers one discoverable entry point without knowing the `::`/`:` syntax.
 */
function slashSource() {
  const name = (label: string) => label.replace(/^:+/, '').split(/\s/)[0]!.toLowerCase()
  const build = (entries: readonly { label: string, description: string, snippet: string }[], type: string) =>
    entries.map(entry => snippetCompletion(entry.snippet, {
      label: `/${name(entry.label)}`,
      detail: entry.label,
      info: entry.description,
      type,
    }))
  const options: Completion[] = [
    ...build(COMPONENT_SNIPPETS, 'class'),
    ...build(ANNOTATION_SNIPPETS, 'keyword'),
  ]

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
      options,
      validFor: /^\/[\w-]*$/,
    }
  }
}

/** The full autocompletion extension for the writer. */
export function deckCompletions(options: CompletionOptions = {}): Extension {
  const frontmatter = frontmatterGuide(options)
  return [
    autocompletion({
      override: [frontmatter.source, slashSource(), bodySource()],
      icons: false,
    }),
    frontmatter.extension,
  ]
}

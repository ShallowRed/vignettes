import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import {
  ANNOTATION_SNIPPETS,
  COMPONENT_SNIPPETS,
  FRONTMATTER_KEYS,
  LAYOUT_NAMES,
} from '~/config/editor-reference'

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

function frontmatterSource(options: CompletionOptions) {
  const keyCompletions: Completion[] = FRONTMATTER_KEYS.map(entry =>
    snippetCompletion(entry.snippet, {
      label: entry.key,
      detail: entry.values ? entry.values.join(' | ') : undefined,
      info: entry.description,
      type: 'property',
    }))

  const valuesByKey = new Map<string, readonly string[]>(
    FRONTMATTER_KEYS.filter(entry => entry.values).map(entry => [entry.key, entry.values!]),
  )
  if (options.projects?.length)
    valuesByKey.set('project', options.projects)

  return (context: CompletionContext): CompletionResult | null => {
    if (!inFrontmatter(context))
      return null

    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)

    // Value position: `key: partial` for a key with a closed value set.
    const valueMatch = before.match(/^(\w+):\s+(\S*)$/)
    if (valueMatch) {
      const values = valuesByKey.get(valueMatch[1]!)
      if (!values)
        return null
      return {
        from: context.pos - valueMatch[2]!.length,
        options: values.map(value => ({ label: value, type: 'enum' })),
      }
    }

    // Key position: start of line (allow nested keys to stay unbothered).
    const keyMatch = before.match(/^(\w*)$/)
    if (!keyMatch || (!context.explicit && keyMatch[1] === ''))
      return null
    return {
      from: line.from,
      options: keyCompletions,
      validFor: /^\w*$/,
    }
  }
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
  return autocompletion({
    override: [frontmatterSource(options), slashSource(), bodySource()],
    icons: false,
  })
}

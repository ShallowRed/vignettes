import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { Extension, Range } from '@codemirror/state'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import type { FrontmatterKey, Translate } from '../config/editor-reference'
import type { LineProblem, Problem } from './editor-problems'
import { snippetCompletion } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { Decoration, hoverTooltip, ViewPlugin } from '@codemirror/view'
import { DECK_URL_MESSAGE, DeckMetaSchema, FRONTMATTER_EMBED_KEYS, isRefusedEmbedUrl, RevealConfigSchema, unclosedFrontmatterLine } from '@vignettes/core/deck'
import { isKnownTheme, knownThemes, resolveThemeName } from '@vignettes/core/theme'
import { load, YAMLException } from 'js-yaml'
import { DOCS_SECTIONS, FRONTMATTER_KEYS, inLanguage, LEGACY_FRONTMATTER_KEYS } from '../config/editor-reference'
import { problemMarks, problemMessage } from './editor-problems'
import { docsLink, referenceCard } from './editor-tooltip'

/**
 * The guide to a deck's frontmatter in the source pane: completion of keys,
 * nested keys and closed values, a tooltip describing the key under the
 * pointer, and marks on invalid YAML, unknown keys, values outside their set
 * and addresses the deck refuses.
 */

export interface FrontmatterOptions {
  /** Folder slugs completable on `project:`. */
  projects?: readonly string[]
  /** Interface language of the snippets. */
  lang: string
  /** Published themes compiled with other theme packages than the studio's, marked on `theme:`. */
  staleThemes?: readonly string[]
  t: Translate
  /** The address of a documentation section, none when the instance has no documentation. */
  docsUrl: (docs?: string) => string | undefined
}

/** Last line of the frontmatter block (1-based), or 0 without a closed block. */
export function frontmatterEnd(state: EditorState): number {
  const doc = state.doc
  if (doc.lines < 2 || doc.line(1).text.trim() !== '---')
    return 0
  for (let n = 2; n <= doc.lines; n++) {
    if (doc.line(n).text.trim() === '---')
      return n
  }
  return 0
}

/** A block still being typed, with no closing fence yet, counts until the end. */
export function inFrontmatter(state: EditorState, line: number): boolean {
  if (state.doc.line(1).text.trim() !== '---')
    return false
  const end = frontmatterEnd(state)
  return line > 1 && (end === 0 || line < end)
}

const KEY_LINE_RE = /^(\s*)([\w.-]+)\s*:(.*)$/
const indentOf = (text: string) => text.length - text.trimStart().length

/** The keys that a line at `indent` completes among: top-level, or its parent's children. */
function fieldsAt(state: EditorState, line: number, indent: number): { fields: readonly FrontmatterKey[], parent?: FrontmatterKey } | null {
  if (indent === 0)
    return { fields: FRONTMATTER_KEYS }
  for (let n = line - 1; n > 1; n--) {
    const text = state.doc.line(n).text
    if (!text.trim())
      continue
    if (indentOf(text) < indent) {
      const match = KEY_LINE_RE.exec(text)
      const parent = match ? FRONTMATTER_KEYS.find(field => field.key === match[2]) : undefined
      return parent?.children ? { fields: parent.children, parent } : null
    }
  }
  return null
}

function fieldAt(state: EditorState, line: number): FrontmatterKey | undefined {
  const match = KEY_LINE_RE.exec(state.doc.line(line).text)
  if (!match)
    return undefined
  return fieldsAt(state, line, match[1]!.length)?.fields.find(field => field.key === match[2])
}

/** Keys already written at the same level, which the completion leaves out. */
function siblingKeys(state: EditorState, line: number, indent: number): Set<string> {
  const keys = new Set<string>()
  const end = frontmatterEnd(state) || state.doc.lines + 1
  for (let n = 2; n < end; n++) {
    if (n === line)
      continue
    const match = KEY_LINE_RE.exec(state.doc.line(n).text)
    if (match && match[1]!.length === indent)
      keys.add(match[2]!)
  }
  return keys
}

/** The key whose value is empty at `pos`, the caret after its colon: `storybook:`, `theme: `. */
export function emptyValueKey(state: EditorState, pos: number): FrontmatterKey | undefined {
  const line = state.doc.lineAt(pos)
  const match = KEY_LINE_RE.exec(line.text)
  if (!match || match[3]!.trim() || pos < line.from + line.text.indexOf(':') + 1 || !inFrontmatter(state, line.number))
    return undefined
  return fieldsAt(state, line.number, match[1]!.length)?.fields.find(field => field.key === match[2])
}

function describe(field: FrontmatterKey, t: Translate): string {
  const description = t(field.descriptionKey)
  const value = field.defaultKey ? t(field.defaultKey) : field.default
  return value ? t('editor.frontmatter.describeWithDefault', { description, value }) : `${description}.`
}

function completionSource(options: FrontmatterOptions) {
  const { t } = options
  const defaultLabel = t('editor.frontmatter.defaultValue')
  const blockLabel = t('editor.frontmatter.block')
  return (context: CompletionContext): CompletionResult | null => {
    const { state } = context
    const line = state.doc.lineAt(context.pos)
    if (!inFrontmatter(state, line.number))
      return null
    const before = line.text.slice(0, context.pos - line.from)

    // A value written right after the colon gets the space YAML needs.
    const valueMatch = /^(\s*)([\w.-]+):(\s*)(\S*)$/.exec(before)
    if (valueMatch) {
      const [, indent = '', key, space, typed = ''] = valueMatch
      const field = fieldsAt(state, line.number, indent.length)?.fields.find(f => f.key === key)
      const values = field?.key === 'project' && indent === '' ? options.projects : field?.values
      if (!values?.length)
        return null
      return {
        from: context.pos - typed.length,
        options: values.map(value => ({ label: value, apply: space ? value : ` ${value}`, type: 'enum', detail: value === field?.default ? defaultLabel : undefined })),
        validFor: /^\S*$/,
      }
    }

    const keyMatch = /^(\s*)([\w-]*)$/.exec(before)
    if (!keyMatch || (!context.explicit && keyMatch[2] === ''))
      return null
    const indent = keyMatch[1]!.length
    const scope = fieldsAt(state, line.number, indent)
    if (!scope)
      return null
    const written = siblingKeys(state, line.number, indent)
    const completions: Completion[] = scope.fields
      .filter(field => !written.has(field.key))
      .map(field => snippetCompletion(inLanguage(field.snippet, options.lang).replaceAll('\n', `\n${' '.repeat(indent)}`), {
        label: field.key,
        detail: field.values ? field.values.join(' | ') : field.children ? blockLabel : undefined,
        info: describe(field, t),
        type: 'property',
      }))
    return { from: line.from + indent, options: completions, validFor: /^[\w-]*$/ }
  }
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** Values checked against their set; the others take free text. */
const OPEN_VALUES = new Set(['theme', 'lang', 'slideNumber', 'project'])

/** The types a schema issue may expect, each with its message. */
const EXPECTED_TYPES = new Set(['number', 'boolean', 'string'])

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, '$2')

/**
 * The problems of the frontmatter block of `state`. Each one but the unknown
 * keys carries a `short` text, which the editor lists with the problems the
 * preview finds.
 */
export function frontmatterProblems(state: EditorState, t: Translate, staleThemes: readonly string[] = []): Problem[] {
  const end = frontmatterEnd(state)
  if (!end)
    return []
  const problems: Problem[] = []
  const yaml = state.sliceDoc(state.doc.line(2).from, state.doc.line(end).from)
  let data: unknown
  try {
    data = load(yaml)
  }
  catch (error) {
    if (error instanceof YAMLException) {
      const line = state.doc.line(Math.min(end - 1, Math.max(2, (error.mark?.line ?? 0) + 2)))
      // A value with a colon in it, such as a title, is the most frequent case.
      const colon = /^(\s*[\w-]+):\s+([^"'\s].*:\s.*)$/.exec(line.text)
      problems.push({
        from: line.from,
        to: Math.max(line.to, line.from + 1),
        severity: 'error',
        message: colon
          ? t('editor.frontmatter.quoteValue', { line: `${colon[1]}: "${colon[2]!.trim()}"` })
          : t('editor.frontmatter.invalidYaml'),
        short: t(colon ? 'editor.frontmatter.quoteValueShort' : 'editor.frontmatter.invalidYamlShort', { line: line.number }),
      })
      return problems
    }
  }
  const unclosed = unclosedFrontmatterLine(state.doc.toString())
  if (unclosed) {
    const line = state.doc.line(unclosed)
    problems.push({
      from: line.from,
      to: line.to,
      severity: 'error',
      message: t('editor.frontmatter.unclosed'),
      short: t('editor.frontmatter.unclosedShort', { line: unclosed }),
    })
    return problems
  }
  const parsed = DeckMetaSchema.safeParse(data ?? {})
  const schemaIssues = new Map(parsed.success ? [] : parsed.error.issues.map(issue => [issue.path.join('.'), issue]))

  for (let n = 2; n < end; n++) {
    const line = state.doc.line(n)
    const match = KEY_LINE_RE.exec(line.text)
    if (!match)
      continue
    const indent = match[1]!.length
    const keyFrom = line.from + indent
    const keyTo = keyFrom + match[2]!.length
    const scope = fieldsAt(state, n, indent)
    const field = scope?.fields.find(f => f.key === match[2])
    const path = indent === 0 ? match[2]! : `${scope?.parent?.key ?? ''}.${match[2]}`
    const value = match[3]!.replace(/\s#.*$/, '').trim()
    const valueFrom = line.from + line.text.indexOf(value, keyTo - line.from + 1)
    const onValue = (severity: Problem['severity'], message: string, short: string) =>
      problems.push({ from: valueFrom, to: valueFrom + value.length, severity, message, short })

    const issue = value ? schemaIssues.get(path) : undefined
    if (issue) {
      if (issue.message === DECK_URL_MESSAGE) {
        onValue('error', t('editor.diagnostics.refusedUrl'), t('editor.diagnostics.refusedUrlShort', { line: n }))
      }
      else {
        const expected = 'expected' in issue && EXPECTED_TYPES.has(String(issue.expected)) ? String(issue.expected) : null
        onValue('error', expected ? t(`editor.frontmatter.expected.${expected}`) : t('editor.frontmatter.invalidValue'), t('editor.frontmatter.invalidValueShort', { line: n, key: path }))
      }
      continue
    }
    if (value && FRONTMATTER_EMBED_KEYS.includes(path.split('.')[0]!) && isRefusedEmbedUrl(unquote(value))) {
      onValue('warning', t('editor.diagnostics.refusedEmbed'), t('editor.diagnostics.refusedEmbedShort', { line: n }))
      continue
    }
    if (!field) {
      // Under `reveal`, the deck passes the options `RevealConfigSchema` names,
      // more than the guide lists.
      const known = indent === 0
        ? LEGACY_FRONTMATTER_KEYS.includes(match[2]!)
        : scope?.parent?.key === 'reveal' && Object.hasOwn(RevealConfigSchema.shape, match[2]!)
      if (!known && scope)
        problems.push({ from: keyFrom, to: keyTo, severity: 'info', message: t('editor.frontmatter.unknownKey', { key: match[2] }) })
      continue
    }
    if (indent === 0 && field.key === 'theme' && value && !isKnownTheme(unquote(value))) {
      onValue('warning', t('editor.frontmatter.unknownTheme', { themes: knownThemes().join(', ') }), t('editor.frontmatter.unknownThemeShort', { line: n, theme: unquote(value) }))
      continue
    }
    if (indent === 0 && field.key === 'theme' && value && staleThemes.includes(resolveThemeName(unquote(value)))) {
      onValue('warning', t('editor.frontmatter.themeVersionGap', { theme: unquote(value) }), t('editor.frontmatter.themeVersionGapShort', { line: n, theme: unquote(value) }))
      continue
    }
    if (field.values && value && !OPEN_VALUES.has(field.key) && !field.values.map(unquote).includes(unquote(value)))
      onValue('warning', t('editor.frontmatter.expectedValue', { values: field.values.join(', ') }), t('editor.frontmatter.expectedValueShort', { line: n, key: path }))
  }
  return problems
}

/** The problems of the frontmatter of `text` that the editor lists, placed by line. */
export function listedFrontmatterProblems(text: string, t: Translate, staleThemes: readonly string[] = []): Array<LineProblem & { short: string }> {
  const state = EditorState.create({ doc: text })
  return frontmatterProblems(state, t, staleThemes).flatMap((problem) => {
    if (!problem.short)
      return []
    const line = state.doc.lineAt(problem.from)
    return [{ line: line.number, column: problem.from - line.from, length: problem.to - problem.from, severity: problem.severity, message: problem.message, short: problem.short }]
  })
}

// ── Marks ───────────────────────────────────────────────────────────────────

function checks(t: Translate, staleThemes: readonly string[]): Extension {
  function decorate(state: EditorState): DecorationSet {
    const ranges: Range<Decoration>[] = frontmatterProblems(state, t, staleThemes).map(problem => problemMarks[problem.severity].range(problem.from, problem.to))
    return Decoration.set(ranges, true)
  }

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = decorate(view.state)
    }

    update(update: ViewUpdate) {
      if (update.docChanged)
        this.decorations = decorate(update.state)
    }
  }, { decorations: plugin => plugin.decorations })
}

// ── Tooltip ─────────────────────────────────────────────────────────────────

function tooltip(t: Translate, staleThemes: readonly string[], docsUrl: FrontmatterOptions['docsUrl']): Extension {
  return hoverTooltip((view, pos) => {
    const { state } = view
    const line = state.doc.lineAt(pos)
    if (!inFrontmatter(state, line.number))
      return null
    const problem = frontmatterProblems(state, t, staleThemes).find(p => p.from <= pos && pos <= p.to)
    const match = KEY_LINE_RE.exec(line.text)
    const keyFrom = match ? line.from + match[1]!.length : 0
    const onKey = match && pos >= keyFrom && pos <= keyFrom + match[2]!.length
    const field = onKey ? fieldAt(state, line.number) : undefined
    if (!problem && !field)
      return null
    const docs = docsUrl(DOCS_SECTIONS.frontmatter)
    return {
      pos: problem?.from ?? keyFrom,
      end: problem?.to ?? keyFrom + match![2]!.length,
      above: true,
      create: () => {
        const dom = field
          ? referenceCard({ syntax: field.key, description: describe(field, t), values: field.values }, t)
          : document.createElement('div')
        dom.className = 'cm-source-tooltip'
        if (problem)
          dom.append(...problemMessage(problem, t))
        if (docs)
          dom.append(docsLink(docs, t('editor.docsLink')))
        return { dom }
      },
    }
  })
}

export function frontmatterGuide(options: FrontmatterOptions): { source: ReturnType<typeof completionSource>, extension: Extension } {
  return { source: completionSource(options), extension: [checks(options.t, options.staleThemes ?? []), tooltip(options.t, options.staleThemes ?? [], options.docsUrl)] }
}

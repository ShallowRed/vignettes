import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorState, Extension, Range } from '@codemirror/state'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'
import type { FrontmatterKey } from '../config/editor-reference'
import { snippetCompletion } from '@codemirror/autocomplete'
import { Decoration, hoverTooltip, ViewPlugin, WidgetType } from '@codemirror/view'
import { load, YAMLException } from 'js-yaml'
import { FRONTMATTER_KEYS, LEGACY_FRONTMATTER_KEYS } from '../config/editor-reference'

/**
 * The guide to a deck's frontmatter in the source pane: completion of keys,
 * nested keys and closed values, a tooltip describing the key under the
 * pointer, marks on invalid YAML, unknown keys and values outside their set,
 * and a hint on an empty line of the block.
 */

export interface FrontmatterOptions {
  /** Folder slugs completable on `project:`. */
  projects?: readonly string[]
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
function inFrontmatter(state: EditorState, line: number): boolean {
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

function describe(field: FrontmatterKey): string {
  return field.default ? `${field.description}. Par défaut : ${field.default}.` : `${field.description}.`
}

function completionSource(options: FrontmatterOptions) {
  return (context: CompletionContext): CompletionResult | null => {
    const { state } = context
    const line = state.doc.lineAt(context.pos)
    if (!inFrontmatter(state, line.number))
      return null
    const before = line.text.slice(0, context.pos - line.from)

    const valueMatch = /^(\s*)([\w.-]+):\s+(\S*)$/.exec(before)
    if (valueMatch) {
      const field = fieldsAt(state, line.number, valueMatch[1]!.length)?.fields.find(f => f.key === valueMatch[2])
      const values = field?.key === 'project' && valueMatch[1] === '' ? options.projects : field?.values
      if (!values?.length)
        return null
      return {
        from: context.pos - valueMatch[3]!.length,
        options: values.map(value => ({ label: value, type: 'enum', detail: value === field?.default ? 'par défaut' : undefined })),
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
      .map(field => snippetCompletion(field.snippet.replaceAll('\n', `\n${' '.repeat(indent)}`), {
        label: field.key,
        detail: field.values ? field.values.join(' | ') : field.children ? 'bloc' : undefined,
        info: describe(field),
        type: 'property',
      }))
    return { from: line.from + indent, options: completions, validFor: /^[\w-]*$/ }
  }
}

// ── Checks ──────────────────────────────────────────────────────────────────

interface Problem {
  from: number
  to: number
  severity: 'error' | 'warning' | 'info'
  message: string
}

/** Values checked against their set; the others take free text. */
const OPEN_VALUES = new Set(['theme', 'lang', 'slideNumber', 'project'])

const unquote = (value: string) => value.replace(/^(["'])(.*)\1$/, '$2')

export function frontmatterProblems(state: EditorState): Problem[] {
  const end = frontmatterEnd(state)
  if (!end)
    return []
  const problems: Problem[] = []
  const yaml = state.sliceDoc(state.doc.line(2).from, state.doc.line(end).from)
  try {
    load(yaml)
  }
  catch (error) {
    if (error instanceof YAMLException) {
      const line = state.doc.line(Math.min(end - 1, Math.max(2, error.mark.line + 2)))
      problems.push({ from: line.from, to: Math.max(line.to, line.from + 1), severity: 'error', message: `YAML invalide : ${error.reason}` })
      return problems
    }
  }

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
    if (!field) {
      const known = indent === 0 && LEGACY_FRONTMATTER_KEYS.includes(match[2]!)
      // Reveal takes many more options than the guide lists.
      if (!known && scope && scope.parent?.key !== 'reveal')
        problems.push({ from: keyFrom, to: keyTo, severity: 'info', message: `Clé inconnue : « ${match[2]} » n'a aucun effet.` })
      continue
    }
    const value = match[3]!.replace(/\s#.*$/, '').trim()
    if (field.values && value && !OPEN_VALUES.has(field.key) && !field.values.map(unquote).includes(unquote(value))) {
      const valueFrom = line.from + line.text.indexOf(value, keyTo - line.from + 1)
      problems.push({
        from: valueFrom,
        to: valueFrom + value.length,
        severity: 'warning',
        message: `Valeur attendue : ${field.values.join(', ')}.`,
      })
    }
  }
  return problems
}

const problemMarks = {
  error: Decoration.mark({ class: 'cm-fm-problem cm-fm-problem--error' }),
  warning: Decoration.mark({ class: 'cm-fm-problem cm-fm-problem--warning' }),
  info: Decoration.mark({ class: 'cm-fm-problem cm-fm-problem--info' }),
}

// ── Hint ────────────────────────────────────────────────────────────────────

class HintWidget extends WidgetType {
  override toDOM() {
    const hint = document.createElement('span')
    hint.className = 'cm-fm-hint'
    hint.textContent = 'Ctrl + Espace : réglages disponibles'
    return hint
  }

  override eq() {
    return true
  }
}

const hint = Decoration.widget({ widget: new HintWidget(), side: 1 })

function decorate(state: EditorState, focused: boolean): DecorationSet {
  const ranges: Range<Decoration>[] = frontmatterProblems(state).map(problem => problemMarks[problem.severity].range(problem.from, problem.to))
  const { head, empty } = state.selection.main
  const line = state.doc.lineAt(head)
  if (focused && empty && !line.text.trim() && inFrontmatter(state, line.number))
    ranges.push(hint.range(line.to))
  return Decoration.set(ranges, true)
}

const checks = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) {
    this.decorations = decorate(view.state, view.hasFocus)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.focusChanged)
      this.decorations = decorate(update.state, update.view.hasFocus)
  }
}, { decorations: plugin => plugin.decorations })

// ── Tooltip ─────────────────────────────────────────────────────────────────

const tooltip = hoverTooltip((view, pos) => {
  const { state } = view
  const line = state.doc.lineAt(pos)
  if (!inFrontmatter(state, line.number))
    return null
  const problem = frontmatterProblems(state).find(p => p.from <= pos && pos <= p.to)
  const match = KEY_LINE_RE.exec(line.text)
  const keyFrom = match ? line.from + match[1]!.length : 0
  const onKey = match && pos >= keyFrom && pos <= keyFrom + match[2]!.length
  const field = onKey ? fieldAt(state, line.number) : undefined
  if (!problem && !field)
    return null
  return {
    pos: problem?.from ?? keyFrom,
    end: problem?.to ?? keyFrom + match![2]!.length,
    above: true,
    create: () => {
      const dom = document.createElement('div')
      dom.className = 'cm-fm-tooltip'
      if (field) {
        const title = document.createElement('code')
        title.className = 'cm-fm-tooltip__key'
        title.textContent = field.key
        const text = document.createElement('p')
        text.textContent = describe(field)
        dom.append(title, text)
        if (field.values) {
          const values = document.createElement('p')
          values.className = 'cm-fm-tooltip__values'
          values.textContent = field.values.join(' · ')
          dom.append(values)
        }
      }
      if (problem) {
        const text = document.createElement('p')
        text.className = `cm-fm-tooltip__problem cm-fm-tooltip__problem--${problem.severity}`
        text.textContent = problem.message
        dom.append(text)
      }
      return { dom }
    },
  }
})

export function frontmatterGuide(options: FrontmatterOptions = {}): { source: ReturnType<typeof completionSource>, extension: Extension } {
  return { source: completionSource(options), extension: [checks, tooltip] }
}

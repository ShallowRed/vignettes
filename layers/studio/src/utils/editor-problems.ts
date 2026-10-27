import type { EditorState, Extension } from '@codemirror/state'
import type { Translate } from '../config/editor-reference'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, hoverTooltip } from '@codemirror/view'
import { docsLink } from './editor-tooltip'

/**
 * Problems marked in the source pane: a wavy underline on the range, and the
 * message in a tooltip under the pointer. The frontmatter guide computes its
 * problems from the text; the problems the preview finds while it parses the
 * deck arrive through `setPreviewProblems`.
 */

export type Severity = 'error' | 'warning' | 'info'

export interface Problem {
  from: number
  to: number
  severity: Severity
  message: string
  /** The problem in a few words, with its line, for the list under the preview. */
  short?: string
  /** Address of the documentation section that explains the fix. */
  docs?: string
}

/** A problem placed by line, as the parse of the preview reports it. */
export interface LineProblem {
  /** 1-based line. */
  line: number
  /** 0-based column, and length of the marked text. */
  column: number
  length: number
  severity: Severity
  message: string
  docs?: string
}

export const problemMarks = {
  error: Decoration.mark({ class: 'cm-problem cm-problem--error' }),
  warning: Decoration.mark({ class: 'cm-problem cm-problem--warning' }),
  info: Decoration.mark({ class: 'cm-problem cm-problem--info' }),
}

/** The paragraph of a tooltip that states a problem, and the link to its documentation. */
export function problemMessage(problem: Problem, t: Translate): HTMLElement[] {
  const text = document.createElement('p')
  text.className = `cm-source-tooltip__problem cm-source-tooltip__problem--${problem.severity}`
  text.textContent = problem.message
  return problem.docs ? [text, docsLink(problem.docs, t('editor.docsLink'))] : [text]
}

/** Line problems as ranges of `state`; a line beyond the end of the text is left out. */
export function placeProblems(state: EditorState, problems: readonly LineProblem[]): Problem[] {
  return problems
    .filter(problem => problem.line >= 1 && problem.line <= state.doc.lines)
    .map((problem) => {
      const line = state.doc.line(problem.line)
      const from = Math.min(line.from + problem.column, line.to)
      const to = Math.min(from + problem.length, line.to)
      return { from, to, severity: problem.severity, message: problem.message, docs: problem.docs }
    })
    .filter(problem => problem.to > problem.from)
}

export const setPreviewProblems = StateEffect.define<Problem[]>()

// Until the next parse, the marks follow the text typed around them.
const previewProblems = StateField.define<Problem[]>({
  create: () => [],
  update(problems, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setPreviewProblems))
        return effect.value
    }
    if (!transaction.docChanged)
      return problems
    return problems
      .map(problem => ({ ...problem, from: transaction.changes.mapPos(problem.from, 1), to: transaction.changes.mapPos(problem.to, -1) }))
      .filter(problem => problem.to > problem.from)
  },
  provide: field => EditorView.decorations.from(field, problems =>
    Decoration.set(problems.map(problem => problemMarks[problem.severity].range(problem.from, problem.to)), true)),
})

function previewProblemTooltip(t: Translate): Extension {
  return hoverTooltip((view, pos) => {
    const problems = view.state.field(previewProblems).filter(problem => problem.from <= pos && pos <= problem.to)
    if (!problems.length)
      return null
    return {
      pos: Math.min(...problems.map(problem => problem.from)),
      end: Math.max(...problems.map(problem => problem.to)),
      above: true,
      create: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-source-tooltip'
        dom.append(...problems.flatMap(problem => problemMessage(problem, t)))
        return { dom }
      },
    }
  })
}

export function previewProblemMarks(t: Translate): Extension {
  return [previewProblems, previewProblemTooltip(t)]
}

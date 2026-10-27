import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { LayoutAnnotation } from '@vignettes/core/deck'
import { layoutAnnotations, layoutAnnotationValues, layoutSource, modernLayoutAttributes, readLayout } from '@vignettes/core/deck'
import { frontmatterEnd } from './editor-frontmatter'
import { HEADING_RE, slideContentAt } from './editor-slides'

/**
 * The layout of the slide under the cursor, read from and written to its
 * `:layout` line, for the layout panel of the toolbar. The text stays the one
 * source: a choice in the panel rewrites the annotation.
 */

export interface SlideLayoutAtCursor {
  /** The annotation of the slide, when it has one. */
  annotation?: LayoutAnnotation
  /** Its attributes in their current form. */
  attributes: Record<string, unknown>
  /** The annotation uses attributes of the decks written before `media` and `size`. */
  legacy: boolean
  /** 1-based lines of the slide. */
  startLine: number
  endLine: number
  /** The cursor sits in the frontmatter, out of any slide. */
  outside: boolean
}

/** Reads the slide under the cursor; the state carries `deckStructure` of `editor-slides`. */
export function slideLayoutAt(state: EditorState): SlideLayoutAtCursor {
  const line = state.doc.lineAt(state.selection.main.head).number
  const block = slideContentAt(state, line)
  const startLine = block?.from ?? 1
  const endLine = block?.to ?? state.doc.lines
  const annotation = layoutAnnotations(state.doc.toString()).find(found => found.line >= startLine && found.line <= endLine)
  const written = annotation ? layoutAnnotationValues(annotation) : {}
  return {
    annotation,
    attributes: modernLayoutAttributes(written),
    legacy: readLayout(written).issues.some(issue => issue.kind === 'legacy'),
    startLine,
    endLine,
    outside: line <= frontmatterEnd(state),
  }
}

/**
 * The change that gives the slide under the cursor these attributes: the
 * annotation is rewritten, removed with its line when no attribute is left,
 * or written under the heading of the slide, before its first text without one.
 */
export function slideLayoutChange(state: EditorState, attributes: Record<string, unknown>): TransactionSpec {
  const at = slideLayoutAt(state)
  const source = layoutSource(attributes)
  const { annotation } = at
  if (annotation) {
    const line = state.doc.line(annotation.line)
    const from = line.from + annotation.column
    const to = from + annotation.length
    if (source)
      return { changes: { from, to, insert: source } }
    // A line that holds the annotation alone goes with the blank line after it.
    if (line.text.trim() === state.sliceDoc(from, to)) {
      const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : undefined
      const end = next && !next.text.trim() ? next.to : line.to
      return { changes: { from: line.from, to: Math.min(end + 1, state.doc.length), insert: '' } }
    }
    return { changes: { from, to, insert: '' } }
  }
  if (!source)
    return {}
  for (let n = at.startLine; n <= at.endLine && n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (HEADING_RE.test(line.text)) {
      // A blank line sets the annotation apart from a text right under the heading.
      const next = n < state.doc.lines ? state.doc.line(n + 1) : undefined
      return { changes: { from: line.to, insert: `\n\n${source}${next?.text.trim() ? '\n' : ''}` } }
    }
  }
  let first = Math.min(at.startLine, state.doc.lines)
  while (first < Math.min(at.endLine, state.doc.lines) && !state.doc.line(first).text.trim())
    first++
  return { changes: { from: state.doc.line(first).from, insert: `${source}\n\n` } }
}

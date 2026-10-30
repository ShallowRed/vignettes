import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { LayoutAnnotation, MediaPlacement } from '@vignettes/core/deck'
import type { InjectionKey, Ref } from 'vue'
import type { SketchShape } from '../config/editor-reference'
import { layoutAnnotationChange, layoutAnnotations, layoutAnnotationValues, layoutSource, modernLayoutAttributes, readLayout } from '@vignettes/core/deck'
import { SKETCH_FRAME, text as sketchText, title } from '../config/editor-reference'
import { frontmatterEnd } from './editor-frontmatter'
import { HEADING_RE, slideContentAt } from './editor-slides'

/**
 * The layout of the slide under the cursor, read from and written to its
 * `:layout` line, for the layout panel of the toolbar. The text stays the one
 * source: a choice in the panel rewrites the annotation.
 */

/** The text of the editor, which the editor page gives the panels of the toolbar. */
export const EDITOR_TEXT: InjectionKey<Readonly<Ref<string>>> = Symbol('editorText')

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
  if (annotation)
    return { changes: layoutAnnotationChange(state.doc.toString(), annotation, source) }
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

/**
 * The sketch of a placement in the layout panel: the media, at `share` of the
 * width on a side, and three lines of text, on a card over a media behind.
 */
export function placementSketch(at: MediaPlacement | 'none', share: number): SketchShape[] {
  const { width: W, height: H } = SKETCH_FRAME
  const side = (W - 2) * share
  const media: Record<MediaPlacement, Omit<SketchShape, 'kind'>> = {
    right: { x: W - 1 - side, y: 1, width: side, height: H - 2 },
    left: { x: 1, y: 1, width: side, height: H - 2 },
    top: { x: 1, y: 1, width: W - 2, height: 28 },
    bottom: { x: 1, y: H - 29, width: W - 2, height: 28 },
    behind: { x: 1, y: 1, width: W - 2, height: H - 2 },
  }
  const lines = {
    none: { x: 10, y: 16, width: 60 },
    right: { x: 8, y: 17, width: W - side - 16 },
    left: { x: side + 8, y: 17, width: W - side - 16 },
    top: { x: 10, y: 35, width: 50 },
    bottom: { x: 10, y: 8, width: 50 },
    behind: { x: 12, y: 33, width: 26 },
  }[at]
  return [
    ...(at === 'none' ? [] : [{ ...media[at], kind: 'media' as const }]),
    ...(at === 'behind' ? [{ x: lines.x - 4, y: lines.y - 4, width: lines.width + 8, height: 17, kind: 'card' as const }] : []),
    title(lines.x, lines.y, lines.width * 0.7, 3),
    sketchText(lines.x, lines.y + 6, lines.width),
    sketchText(lines.x, lines.y + 11, lines.width * 0.85),
  ]
}

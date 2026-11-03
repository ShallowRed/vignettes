import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { BodyMedia, LayoutAnnotation, MediaPlacement, MediaSize, MediaType } from '@vignettes/core/deck'
import type { InjectionKey, Ref } from 'vue'
import type { SketchShape } from '../config/editor-reference'
import { bodyMedia, bodyMediaLayout, DEFAULT_SIDE_MEDIA_SIZE, inferMediaType, layoutAnnotationChange, layoutAnnotations, layoutAnnotationValues, layoutPlacement, layoutSource, MEDIA_SIZES, modernLayoutAttributes, readLayout } from '@vignettes/core/deck'
import { SKETCH_FRAME, text as sketchText, title } from '../config/editor-reference'
import { frontmatterEnd } from './editor-frontmatter'
import { HEADING_RE, slideContentAt } from './editor-slides'
import { OVERFLOW_THRESHOLD } from './preview-overflow'

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

/** The media of the slide under the cursor, written in its `:layout` or alone in its body. */
export interface SlideMediaAtCursor {
  source: 'layout' | 'body'
  placement: MediaPlacement
  kind: MediaType
  /** The media of the body, its lines in the whole document. */
  body?: BodyMedia
  /** The panel may propose a size beside the text. */
  proposable: boolean
}

/** Reads the media of the slide under the cursor; none outside a slide or on a slide without one. */
export function slideMediaAt(state: EditorState): SlideMediaAtCursor | undefined {
  const at = slideLayoutAt(state)
  if (at.outside)
    return undefined
  const lines = Array.from({ length: Math.max(0, Math.min(at.endLine, state.doc.lines) - at.startLine + 1) }, (_, n) => state.doc.line(at.startLine + n).text)
  const found = bodyMedia(lines.join('\n')).map(media => ({ ...media, from: media.from + at.startLine - 1, to: media.to + at.startLine - 1 }))
  const placement = layoutPlacement(at.attributes)
  if (placement) {
    const { src, story, type } = at.attributes as { src?: string, story?: string, type?: string }
    return { source: 'layout', placement, kind: inferMediaType(src ?? '', type, Boolean(story)), proposable: (placement === 'right' || placement === 'left') && !found.length }
  }
  const [body] = found
  if (!body)
    return undefined
  const { src = '', story, type } = bodyMediaLayout(body) as { src?: string, story?: string, type?: string }
  return { source: 'body', placement: 'right', kind: inferMediaType(src, type, Boolean(story)), body, proposable: body.movable }
}

/** A size of the media the panel measures: the attributes the slide takes with it, and the change that writes them. */
export interface LayoutCandidate {
  size: MediaSize
  attributes: Record<string, unknown>
  change: TransactionSpec
}

/**
 * The sizes of the media of the slide under the cursor, in its placement: each
 * one with the change the panel makes when the author takes it. A media of the
 * body goes to the right of the text. None behind the text, or for a media of
 * the body that `:layout` cannot take.
 */
export function layoutCandidates(state: EditorState): LayoutCandidate[] {
  const media = slideMediaAt(state)
  if (!media || media.placement === 'behind' || (media.body && !media.proposable))
    return []
  const written = slideLayoutAt(state).attributes
  const base = media.body ? { ...written, ...bodyMediaLayout(media.body), media: 'right' } : written
  return MEDIA_SIZES.map((size) => {
    const attributes = { ...base, size }
    return { size, attributes, change: slideLayoutProposal(state, attributes) }
  })
}

/**
 * The change that gives the slide under the cursor these attributes, and takes
 * out of its body the media they show, with a blank line beside it.
 */
export function slideLayoutProposal(state: EditorState, attributes: Record<string, unknown>): TransactionSpec {
  const layout = slideLayoutChange(state, attributes).changes
  const body = slideMediaAt(state)?.body
  if (!body || !layout)
    return { changes: layout }
  const doc = state.doc
  const blank = (n: number) => n >= 1 && n <= doc.lines && !doc.line(n).text.trim()
  let first = body.from
  let last = body.to
  if (blank(last + 1))
    last++
  else if (blank(first - 1))
    first--
  // The lines go with their line break: the one after them, or before them at the end of the text.
  const removed = last < doc.lines
    ? { from: doc.line(first).from, to: doc.line(last + 1).from }
    : { from: first > 1 ? doc.line(first - 1).to : doc.line(first).from, to: doc.line(last).to }
  return { changes: [layout, removed].flat() }
}

/** What the panel measures of a size of the media: the overflow of the text, in slide pixels, and the share its body text keeps. */
export interface LayoutReading {
  overflow: number
  textScale: number
}

/** The size the panel proposes, or that the text overflows the slide at every size beside it. */
export type LayoutProposal = { kind: 'size', size: MediaSize } | { kind: 'too-long' }

/**
 * The size the panel proposes for a media beside the text, from what it
 * measured: for an image, the half of the slide, else its third; for a page
 * or a story, which shrinks a wide screen, two thirds, else the half. None
 * when the written size fits.
 */
export function proposeLayout(media: SlideMediaAtCursor, writtenSize: MediaSize | undefined, readings: Partial<Record<MediaSize, LayoutReading>>): LayoutProposal | undefined {
  if (!media.proposable)
    return undefined
  const fits = (size: MediaSize) => (readings[size]?.overflow ?? Number.POSITIVE_INFINITY) <= OVERFLOW_THRESHOLD
  if (media.source === 'layout' && fits(writtenSize ?? DEFAULT_SIDE_MEDIA_SIZE))
    return undefined
  const order: MediaSize[] = media.kind === 'image' ? ['1/2', '1/3'] : ['2/3', '1/2']
  const size = order.find(fits)
  return size ? { kind: 'size', size } : { kind: 'too-long' }
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

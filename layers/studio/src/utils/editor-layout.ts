import type { EditorState, TransactionSpec } from '@codemirror/state'
import type { BodyMedia, LayoutAnnotation, MediaPlacement, MediaSize, MediaType, TextStep } from '@vignettes/core/deck'
import type { InjectionKey, Ref } from 'vue'
import type { SketchShape } from '../config/editor-reference'
import { bodyMedia, bodyMediaLayout, DEFAULT_SIDE_MEDIA_SIZE, DEFAULT_TEXT_STEP, inferMediaType, layoutAnnotationChange, layoutAnnotations, layoutAnnotationValues, layoutForPlacement, layoutPlacement, layoutSource, MEDIA_PLACEMENTS, MEDIA_SIZES, modernLayoutAttributes, PLACEHOLDER_IMAGE, readLayout, TEXT_STEPS } from '@vignettes/core/deck'
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
  /** The body is a screen or a gallery of screens, as the parser reads `:layout`: the text has no step and no inset there. */
  screen: boolean
}

/** Reads the slide under the cursor; the state carries `deckStructure` of `editor-slides`. */
export function slideLayoutAt(state: EditorState): SlideLayoutAtCursor {
  const line = state.doc.lineAt(state.selection.main.head).number
  const block = slideContentAt(state, line)
  const startLine = block?.from ?? 1
  const endLine = block?.to ?? state.doc.lines
  const annotation = layoutAnnotations(state.doc.toString()).find(found => found.line >= startLine && found.line <= endLine)
  const written = annotation ? layoutAnnotationValues(annotation) : {}
  const read = readLayout(written)
  return {
    annotation,
    attributes: modernLayoutAttributes(written),
    legacy: read.issues.some(issue => issue.kind === 'legacy'),
    screen: Boolean(read.layout.screen),
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
  /** The number of media written in the body of the slide. */
  bodyCount: number
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
    return { source: 'layout', placement, kind: inferMediaType(src ?? '', type, Boolean(story)), bodyCount: found.length, proposable: (placement === 'right' || placement === 'left') && !found.length }
  }
  const [body] = found
  if (!body)
    return undefined
  const { src = '', story, type } = bodyMediaLayout(body) as { src?: string, story?: string, type?: string }
  return { source: 'body', placement: 'right', kind: inferMediaType(src, type, Boolean(story)), body, bodyCount: found.length, proposable: body.movable }
}

/**
 * Why the media of a slide cannot take a placement: the slide has several media
 * in its body, its media has a caption or a setting `:layout` does not take, or
 * it is a page or a story, which an image behind the text cannot show.
 */
export type BlockedPlacement = 'several' | 'kept' | 'not-behind'

/**
 * The placements a media written in the body of the slide under the cursor
 * cannot take: none when `:layout` cannot show it as its component does, and
 * behind the text for a page or a story.
 */
export function blockedPlacements(state: EditorState): Partial<Record<MediaPlacement, BlockedPlacement>> {
  if (layoutPlacement(slideLayoutAt(state).attributes))
    return {}
  const media = slideMediaAt(state)
  if (!media?.body)
    return {}
  if (!media.body.movable)
    return Object.fromEntries(MEDIA_PLACEMENTS.map(placement => [placement, media.bodyCount > 1 ? 'several' : 'kept']))
  return media.kind === 'image' ? {} : { behind: 'not-behind' }
}

/**
 * The change that places the media of the slide under the cursor: a media
 * written alone in the body moves into `:layout` at this placement, and a
 * placement without a source takes the placeholder image, which the author then
 * replaces. No change for a placement the media cannot take.
 */
export function slidePlacementChange(state: EditorState, placement: MediaPlacement | 'none'): TransactionSpec {
  const written = slideLayoutAt(state).attributes
  if (placement === 'none')
    return slideLayoutChange(state, layoutForPlacement(written, placement))
  if (!layoutPlacement(written)) {
    if (blockedPlacements(state)[placement])
      return {}
    const media = slideMediaAt(state)
    if (media?.body)
      return slideLayoutProposal(state, layoutForPlacement({ ...written, ...bodyMediaLayout(media.body) }, placement))
  }
  const next = layoutForPlacement(written, placement)
  if (!next.src && !next.story)
    next.src = PLACEHOLDER_IMAGE
  return slideLayoutChange(state, next)
}

/** A setting of the slide the panel measures: its attributes, the change that writes them, and the text of the annotation, which names it. */
export interface LayoutCandidate {
  key: string
  attributes: Record<string, unknown>
  change: TransactionSpec
}

/** The candidate that gives the slide under the cursor these attributes; a `text` at the theme's step is left out. */
function candidate(state: EditorState, attributes: Record<string, unknown>): LayoutCandidate {
  const next = { ...attributes }
  if (next.text === DEFAULT_TEXT_STEP)
    delete next.text
  return { key: layoutSource(next), attributes: next, change: slideLayoutProposal(state, next) }
}

/** The attributes that move a media of the body to the right of the text, as its component draws it. */
function movedMedia(written: Record<string, unknown>, media: SlideMediaAtCursor): Record<string, unknown> {
  return media.body ? { ...written, ...bodyMediaLayout(media.body), media: 'right' } : written
}

/**
 * The settings the panel marks, measured together: each size of the media in
 * its placement, a media of the body moved to the right of the text, and each
 * step of the text with the other settings as written. No size behind the
 * text or for a media of the body that `:layout` cannot take, and no step on
 * a slide of screens.
 */
export function layoutCandidates(state: EditorState): { sizes: Partial<Record<MediaSize, LayoutCandidate>>, steps: Partial<Record<TextStep, LayoutCandidate>> } {
  const at = slideLayoutAt(state)
  if (at.outside)
    return { sizes: {}, steps: {} }
  const written = at.attributes
  const media = slideMediaAt(state)
  const sized = media && media.placement !== 'behind' && !(media.body && !media.proposable)
  const sizes = sized ? Object.fromEntries(MEDIA_SIZES.map(size => [size, candidate(state, { ...movedMedia(written, media), size })])) : {}
  const steps = at.screen ? {} : Object.fromEntries(TEXT_STEPS.map(step => [step, candidate(state, { ...written, text: step })]))
  return { sizes, steps }
}

/**
 * The change that gives the slide under the cursor these attributes, and takes
 * out of its body the media they move into `:layout`, with a blank line beside it.
 */
export function slideLayoutProposal(state: EditorState, attributes: Record<string, unknown>): TransactionSpec {
  const layout = slideLayoutChange(state, attributes).changes
  const body = slideMediaAt(state)?.body
  // The change takes the media out of the body when the attributes give the slide a media it had not.
  const moving = body && layoutPlacement(attributes) && !layoutPlacement(slideLayoutAt(state).attributes)
  if (!moving || !layout)
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

/**
 * What the panel measures of a setting: the overflow of the text, in slide
 * pixels; the size of the body, in slide pixels; the share of it a media beside
 * the text keeps, at the same step; the height the body fills; and the ratio
 * between two steps of the theme.
 */
export interface LayoutReading {
  overflow: number
  bodySize: number
  textScale: number
  fill: number
  ratio: number
}

/** The setting the panel proposes, and whether it makes a short text larger; or that the text overflows at every setting. */
export type LayoutProposal = { kind: 'layout', attributes: Record<string, unknown>, grow?: true } | { kind: 'too-long' }

/** Below this share of the room of the body, a text that fits may take the step above. */
const ROOMY_FILL = 0.5

const fits = (reading: LayoutReading) => reading.overflow <= OVERFLOW_THRESHOLD

/** Whether the floor of the theme holds `step` at the size of `from`: it stays within a third of a step of it. */
export function heldByFloor(step: LayoutReading, from: LayoutReading): boolean {
  return step.bodySize > from.bodySize * (1 - (1 - 1 / from.ratio) / 3)
}

/**
 * The path of the proposal, from the least visible change to the most: the
 * size of a media beside the text, for an image the half of the slide then
 * its third, for a page or a story two thirds then the half; a heading on one
 * line; a step of the text below; the tight inset; a second step below. Each
 * change keeps the ones before it, a step that the floor holds is passed, and
 * the path stops at the first setting that fits. A text that fits as written,
 * at the size of the theme and in less than half its room, takes the step
 * above when it fits too. The generator gives each setting to measure and
 * receives its reading; it returns the proposal, or none when the text fits
 * as written.
 */
export function* proposalSteps(state: EditorState): Generator<LayoutCandidate, LayoutProposal | undefined, LayoutReading> {
  const at = slideLayoutAt(state)
  if (at.outside)
    return undefined
  const written = at.attributes
  const screen = at.screen
  const media = slideMediaAt(state)
  const current = yield candidate(state, written)
  const proposal = (attributes: Record<string, unknown>) => ({ kind: 'layout' as const, attributes: candidate(state, attributes).attributes })

  if (fits(current)) {
    // A slide without a body, a title alone, has no text to make larger.
    if (screen || (written.text && written.text !== DEFAULT_TEXT_STEP) || !current.bodySize || current.fill >= ROOMY_FILL)
      return undefined
    const larger = { ...written, text: TEXT_STEPS[TEXT_STEPS.indexOf(DEFAULT_TEXT_STEP) + 1] }
    return fits(yield candidate(state, larger)) ? { ...proposal(larger), grow: true } : undefined
  }

  let attributes = written
  let previous = current
  const sided = media?.proposable && (media.placement === 'right' || media.placement === 'left')
  if (sided) {
    const moved = movedMedia(written, media)
    const order: MediaSize[] = media.kind === 'image' ? ['1/2', '1/3'] : ['2/3', '1/2']
    // A media of `:layout` only gives room to the text by a smaller size than its own.
    const own = (written.size as MediaSize | undefined) ?? DEFAULT_SIDE_MEDIA_SIZE
    const sizes = media.source === 'layout' ? order.filter(size => MEDIA_SIZES.indexOf(size) < MEDIA_SIZES.indexOf(own)) : order
    for (const size of sizes) {
      previous = yield candidate(state, { ...moved, size })
      if (fits(previous))
        return proposal({ ...moved, size })
    }
    attributes = sizes.length ? { ...moved, size: sizes.at(-1) } : moved
  }

  if (!written.heading && !screen) {
    attributes = { ...attributes, heading: 'compact' }
    previous = yield candidate(state, attributes)
    if (fits(previous))
      return proposal(attributes)
  }

  let step = TEXT_STEPS.indexOf((written.text as TextStep | undefined) ?? DEFAULT_TEXT_STEP)
  // A step that the floor holds leaves the steps below it at the floor too: the
  // path passes them all and goes on to the tight inset.
  function* smaller(): Generator<LayoutCandidate, LayoutProposal | undefined, LayoutReading> {
    if (step > 0) {
      step--
      const next = { ...attributes, text: TEXT_STEPS[step] }
      const reading = yield candidate(state, next)
      if (heldByFloor(reading, previous)) {
        step = 0
        return undefined
      }
      attributes = next
      previous = reading
      return fits(reading) ? proposal(attributes) : undefined
    }
    return undefined
  }

  // The steps size the body: a slide without one has none to try.
  const sizable = !screen && current.bodySize > 0
  if (sizable) {
    const once = yield* smaller()
    if (once)
      return once
  }
  if (!written.inset && !screen) {
    attributes = { ...attributes, inset: 'tight' }
    previous = yield candidate(state, attributes)
    if (fits(previous))
      return proposal(attributes)
  }
  if (sizable) {
    const twice = yield* smaller()
    if (twice)
      return twice
  }
  return { kind: 'too-long' }
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

import type { MediaSize } from '@vignettes/core/deck'
import type { Block, PaneMedia, Paragraph, SlideRole } from './blocks.ts'
import type { PptxMaster } from './theme.ts'

/** A box on the slide, in slide pixels. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A layout of the master: its name, and the boxes of its title, its body and its media. */
export interface LayoutPlan {
  name: string
  role: SlideRole
  title: Box
  body: Box
  media?: Box
}

const SIZES: Record<MediaSize, number> = { '1/3': 1 / 3, '1/2': 1 / 2, '2/3': 2 / 3, '3/4': 3 / 4 }
const PLACEMENT_NAMES: Record<PaneMedia['placement'], string> = { right: 'à droite', left: 'à gauche', top: 'en haut', bottom: 'en bas' }
const ROLE_NAMES: Record<SlideRole, string> = { title: 'Titre', section: 'Section', content: 'Contenu' }

/** The layout a slide takes: one per role, and one per media placement and size on a content slide. */
export function layoutFor(role: SlideRole, media: PaneMedia | undefined, master: PptxMaster): LayoutPlan {
  const { width: W, height: H, padding } = master
  const m = padding.x
  // The title and the section slides center their title and its paragraph on the height, as the theme does.
  if (role === 'title' || role === 'section') {
    const width = W - 2 * m
    return { name: ROLE_NAMES[role], role, title: { x: m, y: H * 0.2, w: width, h: H * 0.3 }, body: { x: m, y: H * 0.52, w: width, h: H * 0.3 } }
  }
  const titleTop = padding.y
  const bodyTop = titleTop + H * 0.17
  const title: Box = { x: m, y: titleTop, w: W - 2 * m, h: H * 0.15 }
  const body: Box = { x: m, y: bodyTop, w: W - 2 * m, h: H - bodyTop - padding.y - H * 0.05 }
  if (!media)
    return { name: ROLE_NAMES.content, role, title, body }
  const share = SIZES[media.size]
  const name = `${ROLE_NAMES.content}, média ${PLACEMENT_NAMES[media.placement]} ${media.size}`
  if (media.placement === 'right' || media.placement === 'left') {
    const mediaWidth = W * share
    const textX = media.placement === 'left' ? mediaWidth + m : m
    const textWidth = W - mediaWidth - 2 * m
    return {
      name,
      role,
      title: { ...title, x: textX, w: textWidth },
      body: { ...body, x: textX, w: textWidth },
      media: { x: media.placement === 'left' ? 0 : W - mediaWidth, y: 0, w: mediaWidth, h: H },
    }
  }
  const mediaHeight = H * share
  if (media.placement === 'top') {
    const titleY = mediaHeight + H * 0.03
    return {
      name,
      role,
      title: { ...title, y: titleY, h: H * 0.1 },
      body: { ...body, y: titleY + H * 0.11, h: Math.max(H * 0.1, H - titleY - H * 0.11 - H * 0.05) },
      media: { x: 0, y: 0, w: W, h: mediaHeight },
    }
  }
  const bodyBottom = H - mediaHeight - H * 0.03
  return {
    name,
    role,
    title,
    body: { ...body, h: Math.max(H * 0.1, bodyBottom - body.y) },
    media: { x: 0, y: H - mediaHeight, w: W, h: mediaHeight },
  }
}

/** The text size of a paragraph, in slide pixels. */
export function paragraphSize(paragraph: Paragraph, master: PptxMaster, base = master.sizes.body): number {
  if (paragraph.kind === 'heading')
    return Math.round(base * 1.2)
  if (paragraph.kind === 'subtitle')
    return Math.max(base, master.sizes.subtitle)
  if (paragraph.kind === 'caption')
    return Math.round(base * 0.8)
  return base
}

const LINE_HEIGHT = 1.25
const PARAGRAPH_SPACE = 0.4
const BLOCK_SPACE = 0.8
// The width of an average character, in font sizes: the heights are estimates.
const CHARACTER_WIDTH = 0.5

function textHeight(paragraphs: readonly Paragraph[], width: number, master: PptxMaster, base: number): number {
  return paragraphs.reduce((total, paragraph) => {
    const size = paragraphSize(paragraph, master, base)
    const indent = paragraph.kind === 'item' ? size * (1.2 + (paragraph.level ?? 0)) : 0
    const characters = paragraph.runs.reduce((count, run) => count + run.text.length, 0)
    const forced = paragraph.runs.filter(run => run.newline).length
    const lines = Math.max(1, Math.ceil(characters * size * CHARACTER_WIDTH / Math.max(1, width - indent))) + forced
    return total + lines * size * LINE_HEIGHT + paragraphSpace(size)
  }, 0)
}

/** The space between two groups of text, a quote and a key message for instance, for this body size. */
export function blockSpace(base: number): number {
  return base * BLOCK_SPACE
}

/** The space after a paragraph of this text size. */
export function paragraphSpace(size: number): number {
  return size * PARAGRAPH_SPACE
}

/** The height a block takes in a box of this width, or none for an image or a frame, which share the height left. */
export function blockHeight(block: Block, width: number, master: PptxMaster, base = master.sizes.body): number | undefined {
  switch (block.kind) {
    case 'text':
      return textHeight(block.paragraphs, width, master, base)
    case 'code':
      return (block.text.split('\n').length * LINE_HEIGHT + 1) * master.sizes.code
    case 'table':
      return block.rows.length * base * 0.85 * 2
    case 'columns': {
      const columnWidth = columnBoxWidth(width, block.columns.length)
      return Math.max(0, ...block.columns.map(column => flowHeight(column, columnWidth, master, base)))
    }
    default:
      return undefined
  }
}

const GAP = 24

function columnBoxWidth(width: number, count: number): number {
  return (width - GAP * (count - 1)) / Math.max(1, count)
}

/** The boxes of `count` columns side by side in a box, apart by the gap of the body. */
export function columnBoxes(box: Box, count: number): Box[] {
  const w = columnBoxWidth(box.w, count)
  return Array.from({ length: count }, (_, at) => ({ x: box.x + at * (w + GAP), y: box.y, w, h: box.h }))
}

function flowHeight(blocks: readonly Block[], width: number, master: PptxMaster, base: number): number {
  return blocks.reduce((total, block) => total + (blockHeight(block, width, master, base) ?? master.height * 0.25) + GAP, 0)
}

/**
 * The boxes of the blocks of a body, one under the other from the top of the
 * body box. A block of text, code, a table or columns takes its estimated
 * height; the images and the frames share the height left, a quarter of the
 * box at least. A body taller than its box runs past the bottom of the slide.
 */
export function flow(blocks: readonly Block[], box: Box, master: PptxMaster, base = master.sizes.body): Box[] {
  if (!blocks.length)
    return []
  const heights = blocks.map(block => blockHeight(block, box.w, master, base))
  const flexible = heights.filter(height => height === undefined).length
  const gaps = GAP * (blocks.length - 1)
  const fixed = heights.reduce<number>((total, height) => total + (height ?? 0), 0)
  const minimum = box.h * 0.25
  const left = box.h - gaps - fixed
  const share = flexible ? Math.max(minimum, left / flexible) : 0
  let y = box.y
  return heights.map((height) => {
    const h = height ?? share
    const placed = { x: box.x, y, w: box.w, h }
    y += h + GAP
    return placed
  })
}

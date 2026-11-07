import type { Slide } from '@vignettes/core/deck'
import type { Block, Frame, Paragraph, ParagraphKind, Run, SlidePlan } from './blocks.ts'
import type { PptxFont } from './font.ts'
import type { Box, LayoutPlan } from './layout.ts'
import type { PptxMaster, PptxSlideBoxes, PptxStyle } from './theme.ts'
import { deckMessages } from '@vignettes/core/render'
import PptxGenJS from 'pptxgenjs'
import { cleanText, readSlide, runsText, shownSlides } from './blocks.ts'
import { conformPptx } from './conform.ts'
import { embedFont } from './font.ts'
import { blockSpace, columnBoxes, flow, layoutFor, paragraphSize, paragraphSpace } from './layout.ts'
import { pptxMaster } from './theme.ts'

/** An image the host loaded: a `data:` URL of a PNG, a JPEG or a GIF, and its size in pixels. */
export interface PptxImage {
  data: string
  width: number
  height: number
}

export interface WritePptxOptions {
  /** Loads the image at a resolved address, at most `maxWidth` pixels wide; none when it cannot. */
  loadImage: (url: string, options: { maxWidth: number }) => Promise<PptxImage | undefined>
  /** The absolute address of an address of the deck. */
  resolveUrl: (url: string) => string
  /** The French orthotypography, for a French deck. */
  transformText?: (text: string) => string
  /** The look of the deck, measured on its rendered slides; a fixed master without it. */
  style?: PptxStyle
  /** The font of the theme, embedded in the file: the slides name its family. */
  font?: PptxFont
}

/** The deck to write: its slides and its frontmatter, read without trusting its values. */
export interface PptxDeck {
  slides: readonly Slide[]
  meta: Readonly<Record<string, unknown>>
}

// A PowerPoint slide is 13.333 inches wide at 16:9; the deck keeps its own ratio.
const SLIDE_INCHES = 13.333

interface Writer {
  pptx: PptxGenJS
  master: PptxMaster
  /** Slide pixels to inches, and to points. */
  inch: (px: number) => number
  point: (px: number) => number
  /** The images of the deck by their address as written: the resolved address, and the image when the host loaded it. */
  images: Map<string, { url?: string, image?: PptxImage }>
}

function boxInches(writer: Writer, box: Box): { x: number, y: number, w: number, h: number } {
  return { x: writer.inch(box.x), y: writer.inch(box.y), w: writer.inch(box.w), h: writer.inch(box.h) }
}

function textProps(runs: readonly Run[], writer: Writer, base: Partial<PptxGenJS.TextPropsOptions> = {}): PptxGenJS.TextProps[] {
  const props: PptxGenJS.TextProps[] = runs.map(run => ({
    text: run.text,
    options: {
      ...(run.bold ? { bold: true } : {}),
      ...(run.italic ? { italic: true } : {}),
      ...(run.code ? { fontFace: writer.master.mono } : {}),
      ...(run.href ? { hyperlink: { url: run.href }, color: writer.master.accent } : {}),
    },
  }))
  // A line break inside a paragraph: pptxgenjs writes it before the next run, in the same paragraph.
  runs.forEach((run, index) => {
    if (run.newline && props[index + 1])
      props[index + 1]!.options = { ...props[index + 1]!.options, softBreakBefore: true }
  })
  if (!props.length)
    props.push({ text: '', options: {} })
  // Paragraph options go on the first run: on a later run, pptxgenjs opens a new paragraph.
  props[0]!.options = { ...base, ...props[0]!.options }
  return props
}

// A quote and its author, or a run of list items, read as one group; a change of kind opens a new group, apart by the block space.
function opensGroup(previous: ParagraphKind | undefined, kind: ParagraphKind): boolean {
  if (previous === undefined || previous === kind)
    return false
  return !(previous === 'quote' && kind === 'caption') && !(previous === 'text' && kind === 'item')
}

/**
 * The runs of the paragraphs of a text block. On a surface with its own text
 * color, a dark section or a veil, every paragraph takes that color.
 */
function paragraphProps(paragraphs: readonly Paragraph[], writer: Writer, color: string, base: number): PptxGenJS.TextProps[] {
  const { master } = writer
  const ownSurface = color !== master.text
  return paragraphs.flatMap((paragraph, index) => {
    const size = paragraphSize(paragraph, master, base)
    const kindColor = ownSurface
      ? color
      : paragraph.kind === 'highlight' ? master.accent : paragraph.kind === 'quote' ? master.quote.color : paragraph.kind === 'caption' ? master.mention : color
    const options: Partial<PptxGenJS.TextPropsOptions> = {
      fontSize: writer.point(size),
      color: kindColor,
      paraSpaceAfter: writer.point(paragraphSpace(size)),
      ...(opensGroup(paragraphs[index - 1]?.kind, paragraph.kind) ? { paraSpaceBefore: writer.point(blockSpace(base)) } : {}),
      ...(paragraph.kind === 'item' ? { bullet: paragraph.ordered ? { type: 'number' } : true, indentLevel: paragraph.level ?? 0 } : {}),
      ...(paragraph.kind === 'heading' || paragraph.kind === 'highlight' || (paragraph.kind === 'quote' && master.quote.bold) ? { bold: true } : {}),
      ...((paragraph.kind === 'quote' && master.quote.italic) || paragraph.kind === 'caption' ? { italic: true } : {}),
    }
    const runs = textProps(paragraph.runs, writer, options)
    for (const run of runs.slice(1))
      run.options = { fontSize: options.fontSize, color: kindColor, ...run.options }
    runs.at(-1)!.options = { ...runs.at(-1)!.options, breakLine: true }
    return runs
  })
}

function defineLayout(writer: Writer, layout: LayoutPlan): void {
  const { master } = writer
  const role = master.roles[layout.role]
  const image = role.backgroundImage ? writer.images.get(role.backgroundImage)?.image : undefined
  writer.pptx.defineSlideMaster({
    title: layout.name,
    background: image ? { data: image.data } : { color: role.background },
    ...(master.slideNumber
      ? { slideNumber: { ...boxInches(writer, { x: master.width - master.padding.x - master.width * 0.06, y: master.height * 0.93, w: master.width * 0.06, h: master.height * 0.05 }), fontFace: master.font, fontSize: writer.point(master.sizes.small), color: role.text, align: 'right' } }
      : {}),
    objects: [
      { placeholder: { options: { name: 'title', type: 'title', ...boxInches(writer, layout.title), fontFace: master.font, fontSize: writer.point(role.titleSize), bold: role.titleBold, color: role.title, align: 'left', valign: 'bottom', margin: 0 }, text: '' } },
      { placeholder: { options: { name: 'body', type: 'body', ...boxInches(writer, layout.body), fontFace: master.font, fontSize: writer.point(master.sizes.body), color: role.text, align: 'left', valign: 'top', margin: 0 }, text: '' } },
    ],
  })
}

function writeFrame(writer: Writer, slide: PptxGenJS.Slide, box: Box, frame: Frame): void {
  const { master } = writer
  slide.addShape('rect', { ...boxInches(writer, box), fill: { color: master.frame.surface }, line: { color: master.frame.line, width: 1 } })
  const runs: PptxGenJS.TextProps[] = [{ text: frame.label, options: { bold: true, breakLine: Boolean(frame.href) } }]
  if (frame.href)
    runs.push({ text: frame.href, options: { hyperlink: { url: frame.href }, color: master.accent, fontSize: writer.point(master.sizes.small) } })
  slide.addText(runs, { ...boxInches(writer, box), align: 'center', valign: 'middle', fontFace: master.font, fontSize: writer.point(master.sizes.body * 0.8), color: master.frame.text, margin: writer.point(12) })
}

function writeImage(writer: Writer, slide: PptxGenJS.Slide, box: Box, src: string, alt: string, fit: 'cover' | 'contain' = 'contain'): void {
  const { url, image } = writer.images.get(src) ?? {}
  if (!image) {
    writeFrame(writer, slide, box, { label: alt || src.split('/').pop() || 'Image', href: url && /^https?:/i.test(url) ? url : undefined })
    return
  }
  const ratio = image.width / image.height
  if (fit === 'cover') {
    // The image covers the box, cropped around its center: pptxgenjs reads the
    // ratio of the image from `w` and `h`, and the box from `sizing`.
    slide.addImage({ data: image.data, ...boxInches(writer, box), h: writer.inch(box.w / ratio), altText: alt, sizing: { type: 'cover', w: writer.inch(box.w), h: writer.inch(box.h) } })
    return
  }
  let { x, y, w, h } = box
  if (w / h > ratio) {
    const width = h * ratio
    x += (w - width) / 2
    w = width
  }
  else {
    const height = w / ratio
    y += (h - height) / 2
    h = height
  }
  slide.addImage({ data: image.data, ...boxInches(writer, { x, y, w, h }), altText: alt })
}

function writeBlocks(writer: Writer, slide: PptxGenJS.Slide, blocks: readonly Block[], box: Box, color: string, base: number, bodyPlaceholder: boolean): void {
  const { master } = writer
  const boxes = flow(blocks, box, master, base)
  blocks.forEach((block, index) => {
    const placed = boxes[index]!
    switch (block.kind) {
      case 'text': {
        const text = paragraphProps(block.paragraphs, writer, color, base)
        if (bodyPlaceholder && index === 0)
          slide.addText(text, { placeholder: 'body' })
        else
          slide.addText(text, { ...boxInches(writer, placed), fontFace: master.font, valign: 'top', margin: 0 })
        break
      }
      case 'code':
        slide.addText(block.text, { ...boxInches(writer, placed), fontFace: master.mono, fontSize: writer.point(master.sizes.code), color: master.code.text, fill: { color: master.code.surface }, valign: 'top', margin: writer.point(master.sizes.code * 0.6) })
        break
      case 'table': {
        const columns = Math.max(1, ...block.rows.map(row => row.length))
        const { headSurface, headText, line } = master.table
        // The first row is the head of the table, in the colors of the theme when it has them.
        const head: PptxGenJS.TableCellProps = headSurface ? { fill: { color: headSurface }, color: headText, bold: true } : { bold: true }
        const rows = block.rows.map((row, at) => Array.from({ length: columns }, (_, cell) => ({ text: textProps(row[cell] ?? [], writer), ...(at === 0 ? { options: head } : {}) })))
        slide.addTable(rows, { ...boxInches(writer, placed), h: undefined, fontFace: master.font, fontSize: writer.point(base * 0.85), color, border: { type: 'solid', pt: 0.75, color: line }, margin: writer.point(base * 0.4), autoPage: false })
        break
      }
      case 'image': {
        const captionHeight = block.caption.length ? base * 2 : 0
        writeImage(writer, slide, { ...placed, h: placed.h - captionHeight }, block.src, block.alt)
        if (captionHeight)
          slide.addText(paragraphProps(block.caption, writer, color, base), { ...boxInches(writer, { ...placed, y: placed.y + placed.h - captionHeight, h: captionHeight }), fontFace: master.font, align: 'center', margin: 0 })
        break
      }
      case 'columns': {
        const boxes = columnBoxes({ ...placed, h: Math.max(placed.h, box.y + box.h - placed.y) }, block.columns.length)
        block.columns.forEach((column, at) => {
          writeBlocks(writer, slide, column, boxes[at]!, color, base, false)
        })
        break
      }
      case 'frame':
        writeFrame(writer, slide, placed, block.frame)
        break
    }
  })
}

function writeSlide(writer: Writer, plan: SlidePlan, layout: LayoutPlan, boxes: PptxSlideBoxes | undefined, sectionTitle?: string): void {
  const { master } = writer
  const slide = writer.pptx.addSlide({ masterName: layout.name, ...(sectionTitle ? { sectionTitle } : {}) })
  const role = master.roles[plan.role]
  const veiled = plan.background?.veil !== undefined
  const color = veiled ? master.onVeil : role.text

  if (plan.background) {
    const image = writer.images.get(plan.background.src)?.image
    const full = { x: 0, y: 0, w: master.width, h: master.height }
    // The image is the first shape of the slide, cropped to cover it as Reveal does.
    if (image)
      writeImage(writer, slide, full, plan.background.src, '', 'cover')
    if (plan.background.veil !== undefined)
      slide.addShape('rect', { ...boxInches(writer, full), fill: { color: master.veil, transparency: Math.round((1 - plan.background.veil) * 100) }, line: { type: 'none' } })
    else if (plan.media === undefined && image && plan.role === 'content')
      slide.addShape('rect', { ...boxInches(writer, { x: layout.body.x - 24, y: layout.title.y - 12, w: layout.body.w + 48, h: layout.body.y + layout.body.h - layout.title.y + 24 }), fill: { color: role.background, transparency: 12 }, line: { type: 'none' } })
  }

  if (!plan.titleHidden && plan.title.length) {
    const title = textProps(plan.title, writer)
    if (veiled)
      title.forEach(run => run.options = { color: master.onVeil, ...run.options })
    slide.addText(title, { placeholder: 'title' })
  }
  if (plan.pretitle.length) {
    // The title sits at the bottom of its box, so the top of the box holds the pretitle.
    const box = boxes?.pretitle ?? { x: layout.title.x, y: layout.title.y, w: layout.title.w, h: master.sizes.pretitle * 1.6 }
    slide.addText(textProps(plan.pretitle, writer), { ...boxInches(writer, box), fontFace: master.font, fontSize: writer.point(master.sizes.pretitle), color: veiled ? color : master.pretitle, margin: 0 })
  }

  if (plan.media && layout.media) {
    if (plan.media.image)
      writeImage(writer, slide, layout.media, plan.media.image.src, plan.media.image.alt, plan.media.image.fit)
    else if (plan.media.frame)
      writeFrame(writer, slide, layout.media, plan.media.frame)
  }

  // A body the host measured keeps its place on the rendered slide, in text boxes; the body placeholder holds an estimated one.
  // An image or a frame takes the height left in the body box: its body keeps the box of the layout.
  const body = plan.body.some(sharesHeight) ? undefined : boxes?.body
  writeBlocks(writer, slide, plan.body, body ?? layout.body, color, master.sizes.body, !body && plan.body[0]?.kind === 'text')

  if (plan.quicklink) {
    const box = { x: layout.body.x, y: master.height * 0.93, w: layout.body.w * 0.8, h: master.height * 0.05 }
    slide.addText([{ text: plan.quicklink.text, options: plan.quicklink.href ? { hyperlink: { url: plan.quicklink.href }, color: veiled ? color : master.accent } : {} }], { ...boxInches(writer, box), fontFace: master.font, fontSize: writer.point(master.sizes.small), color, margin: 0 })
  }
  if (plan.notes)
    slide.addNotes(plan.notes)
}

/** Whether a block takes a share of the height left in its box: an image or a frame, in the body or in a column. */
function sharesHeight(block: Block): boolean {
  return block.kind === 'image' || block.kind === 'frame' || (block.kind === 'columns' && block.columns.some(column => column.some(sharesHeight)))
}

/**
 * A layout with the boxes of a measured slide. The title box keeps the bottom
 * of the measured title and grows upward, as a heading of two lines does.
 */
function measuredLayout(layout: LayoutPlan, boxes: PptxSlideBoxes | undefined): LayoutPlan {
  const title = boxes?.title
  return {
    ...layout,
    // A title of the title or of a section slide is as wide as its text: the box keeps the width of the layout.
    ...(title ? { title: { x: title.x, w: Math.max(title.w, layout.title.w), h: Math.max(title.h, layout.title.h), y: Math.max(0, title.y + title.h - Math.max(title.h, layout.title.h)) } } : {}),
    ...(boxes?.media && layout.media ? { media: boxes.media } : {}),
  }
}

/** A name the set does not hold yet, numbered after its first use; the set keeps it. */
function uniqueName(name: string, taken: Set<string>): string {
  let unique = name
  for (let count = 2; taken.has(unique); count++)
    unique = `${name} (${count})`
  taken.add(unique)
  return unique
}

/** The image addresses a slide shows: its body images, its media and its background. */
function imageSources(plan: SlidePlan): string[] {
  const sources: string[] = []
  const visit = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      if (block.kind === 'image')
        sources.push(block.src)
      else if (block.kind === 'columns')
        block.columns.forEach(visit)
    }
  }
  visit(plan.body)
  if (plan.media?.image)
    sources.push(plan.media.image.src)
  if (plan.background)
    sources.push(plan.background.src)
  return sources
}

/**
 * Writes a deck as a PowerPoint file: a slide per slide shown, its title and
 * body in the placeholders of its layout, its notes as speaker notes.
 */
export async function writePptx(deck: PptxDeck, options: WritePptxOptions): Promise<ArrayBuffer> {
  const meta = deck.meta
  const master = pptxMaster(meta, options.style, options.font)
  const lang = typeof meta.lang === 'string' && meta.lang ? meta.lang : 'fr'
  const transformText = options.transformText ?? ((text: string) => text)
  const plans = shownSlides(deck.slides).map(slide => readSlide(slide, { meta, lang, resolveUrl: options.resolveUrl, transformText }))

  const pptx = new PptxGenJS()
  const scale = SLIDE_INCHES / master.width
  const writer: Writer = {
    pptx,
    master,
    inch: px => px * scale,
    point: px => Math.round(px * scale * 72 * 10) / 10,
    images: new Map(),
  }
  pptx.defineLayout({ name: 'DECK', width: SLIDE_INCHES, height: master.height * scale })
  pptx.layout = 'DECK'
  pptx.theme = { headFontFace: master.font, bodyFontFace: master.font }
  const title = typeof meta.title === 'string' ? cleanText(meta.title.trim()) : ''
  if (title)
    pptx.title = title

  const roleImages = Object.values(master.roles).flatMap(role => role.backgroundImage ? [role.backgroundImage] : [])
  for (const src of new Set([...roleImages, ...plans.flatMap(imageSources)])) {
    let url: string | undefined
    try {
      url = options.resolveUrl(src)
      writer.images.set(src, { url, image: await options.loadImage(url, { maxWidth: master.width * 2 }) })
    }
    catch {
      writer.images.set(src, { url })
    }
  }

  const measured = options.style?.slides?.length === plans.length ? options.style.slides : undefined
  const layouts = plans.map(plan => layoutFor(plan.role, plan.media, master))
  // The first slide of a layout that the host measured gives the title and the media boxes of the layout.
  const defined = new Map<string, LayoutPlan>()
  layouts.forEach((layout, index) => {
    if (!defined.has(layout.name))
      defined.set(layout.name, measuredLayout(layout, measured?.[index]))
  })
  for (const layout of defined.values())
    defineLayout(writer, layout)

  // Every slide names its section: pptxgenjs gives a slide without one a section of its own.
  const sectioned = plans.some(plan => plan.section)
  const sectionTitles = new Set<string>()
  let sectionTitle: string | undefined
  plans.forEach((plan, index) => {
    if (sectioned && (index === 0 || plan.section)) {
      const name = (index === 0 && !plan.section ? title || runsText(plan.title) : runsText(plan.title)) || deckMessages(lang).untitled
      sectionTitle = uniqueName(name, sectionTitles)
      pptx.addSection({ title: sectionTitle })
    }
    writeSlide(writer, plan, defined.get(layouts[index]!.name)!, measured?.[index], sectionTitle)
  })

  const bytes = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer
  return await conformPptx(options.font ? await embedFont(bytes, options.font) : bytes)
}

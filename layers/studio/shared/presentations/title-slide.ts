import type { Slide, ThemeBackgrounds } from '@vignettes/core/deck'
import type { ThemePreview } from '@vignettes/core/theme'
import type { DeckPreview } from './list-item'
import { codeLines, isSectionSlide, liftedAnnotations, parserIdFor, slideRanges, splitFrontmatter, surfaceLevel, titleSlideIndex } from '@vignettes/core/deck'
import { deckBrand, resolveSlideBackground } from '@vignettes/core/render'
import { getThemeTokens } from '@vignettes/core/theme'

/** The first slide of a deck, read from its markdown for a catalog card. */
export interface TitleSlide {
  title?: string
  pretitle?: string
  subtitle?: string
  headingLevel?: 'h1' | 'h2' | 'h3'
  /** A `##` slide made of its heading and at most one short paragraph (see `isSectionSlide`). */
  section?: boolean
  /** `:slide-background{image}` on the slide. */
  backgroundImage?: string
  /** The deck's frontmatter `backgrounds`, which override the theme's. */
  backgrounds?: ThemeBackgrounds
  /** The deck's frontmatter `brand`, over the theme's. */
  brand?: unknown
}

const HEADING_RE = /^(#{1,6}) (\S.*)$/
// Lines that open something other than a paragraph: annotations, components,
// headings, lists, quotes, tables, images, html, code and slide separators.
const NOT_PARAGRAPH_RE = /^(?:[:#>|<]|[-*+] |\d+\. |!\[|```|~~~|-{3}|\*{3}|_{3})/
const LEAD_MAX_LENGTH = 160

function annotation(lines: string[], tag: string, attribute: string): string | undefined {
  const value = liftedAnnotations(lines.join('\n')).find(annotation => annotation.name === tag)?.attributes[attribute]
  return typeof value === 'string' ? value : undefined
}

/** Markdown inline syntax reduced to the text a reader sees. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\{[^}]*\}\s*$/, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim()
}

function headingIndex(lines: string[]): number {
  const code = codeLines(lines.join('\n'))
  return lines.findIndex((line, index) => !code.has(index) && HEADING_RE.test(line))
}

/** A paragraph that reads as a subtitle, cut to the length of a preview. */
function asLead(text: string): string {
  return text.length > LEAD_MAX_LENGTH ? `${text.slice(0, LEAD_MAX_LENGTH).trimEnd()}…` : text
}

/** The first plain paragraph after the heading, which reads as a subtitle. */
function leadParagraph(lines: string[]): string | undefined {
  const line = lines.map(l => l.trim()).find(l => l && !NOT_PARAGRAPH_RE.test(l))
  return line ? asLead(plainText(line)) : undefined
}

export function readTitleSlide(raw: string): TitleSlide {
  const { data } = splitFrontmatter(raw)
  const lines = raw.split('\n')
  const ranges = slideRanges(raw, parserIdFor(data))
  const slides = (ranges.length ? ranges : [{ startLine: 1 }]).map((range, index) =>
    lines.slice(range.startLine - 1, ranges[index + 1] ? ranges[index + 1]!.startLine - 1 : lines.length))

  // The title slide is the first one with a heading: a heading deck puts what
  // precedes its first heading on a slide of its own.
  let slide: string[] = slides[0] ?? []
  let at = -1
  for (const candidate of slides) {
    at = headingIndex(candidate)
    if (at !== -1) {
      slide = candidate
      break
    }
  }
  const heading = at === -1 ? null : HEADING_RE.exec(slide[at]!)

  const level = heading?.[1]?.length
  return {
    title: heading ? plainText(heading[2]!) : undefined,
    pretitle: annotation(slide, 'pretitle', 'text'),
    subtitle: annotation(slide, 'subtitle', 'text') ?? (at === -1 ? undefined : leadParagraph(slide.slice(at + 1))),
    headingLevel: level && level <= 3 ? `h${level}` as TitleSlide['headingLevel'] : undefined,
    ...(isSectionSlide(slide.join('\n')) ? { section: true } : {}),
    backgroundImage: annotation(slide, 'slide-background', 'image'),
    backgrounds: data.backgrounds && typeof data.backgrounds === 'object' ? data.backgrounds as ThemeBackgrounds : undefined,
    ...(data.brand === undefined ? {} : { brand: data.brand }),
  }
}

interface TreeNode { type?: string, tag?: string, value?: string, children?: TreeNode[] }

/** The text a reader sees in a tree of the parsed deck. */
function treeText(node: unknown): string | undefined {
  const walk = (n: TreeNode): string => n.type === 'text' ? n.value ?? '' : (n.children ?? []).map(walk).join('')
  const text = node ? walk(node as TreeNode).replace(/\s+/g, ' ').trim() : ''
  return text || undefined
}

/**
 * The title slide of a parsed deck, read from the trees the renderer draws, by
 * the rule of `readTitleSlide`, which reads the Markdown for the catalog: the
 * first slide with a heading, its pretitle, and its subtitle or first paragraph.
 */
export function parsedTitleSlide(slides: readonly Slide[], backgrounds?: ThemeBackgrounds): TitleSlide {
  const slide = slides[titleSlideIndex(slides)]
  if (!slide)
    return { backgrounds }
  const lead = ((slide.body as TreeNode | undefined)?.children ?? []).find(node => node.tag === 'p')
  const subtitle = treeText(slide.subtitle) ?? treeText(lead)
  return {
    title: treeText(slide.header),
    pretitle: treeText(slide.pretitle),
    subtitle: subtitle && asLead(subtitle),
    headingLevel: slide.headingLevel as TitleSlide['headingLevel'],
    ...(slide.section ? { section: true } : {}),
    backgroundImage: slide.backgroundImage,
    backgrounds,
  }
}

/** The preview colors and type of a title slide: its theme's, with those of its surface level. */
export function previewTokens(preview: DeckPreview): Omit<ThemePreview, 'levels'> {
  const { levels, ...base } = getThemeTokens(preview.theme)?.preview ?? {}
  return { ...base, ...(preview.surface ? levels?.[preview.surface] : undefined) }
}

/**
 * The catalog card of a deck, in its resolved theme: the title slide takes the
 * colors and the background of its `surfaceLevel`; a deck without a heading
 * keeps the base colors and takes the background of a title slide.
 */
export function titleSlidePreview(slide: TitleSlide, theme: string): DeckPreview {
  const { title, pretitle, subtitle, headingLevel, section, backgroundImage, backgrounds } = slide
  const brand = deckBrand({ theme, brand: slide.brand })
  return {
    ...(brand ? { brand } : {}),
    theme,
    title,
    pretitle,
    subtitle,
    surface: headingLevel && surfaceLevel({ headingLevel, section }) as DeckPreview['surface'],
    background: resolveSlideBackground({ headingLevel: headingLevel ?? 'h1', section, backgroundImage }, theme, backgrounds),
  }
}

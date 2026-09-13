import type { ThemeBackgrounds } from '@vignettes/core/theme'
import { parserIdFor, splitFrontmatter } from '@vignettes/core/deck'
import { slideRanges } from '@vignettes/nuxt/runtime/utils/slide-map.ts'

/** The first slide of a deck, read from its markdown for a catalog card. */
export interface TitleSlide {
  title?: string
  pretitle?: string
  subtitle?: string
  /** Level of the slide's heading, which picks the theme background. */
  headingLevel?: 'h1' | 'h2' | 'h3'
  /** `:slide-background{image}` on the slide. */
  backgroundImage?: string
  /** The deck's frontmatter `backgrounds`, which override the theme's. */
  backgrounds?: ThemeBackgrounds
}

const HEADING_RE = /^(#{1,6}) (\S.*)$/
// Lines that open something other than a paragraph: annotations, components,
// headings, lists, quotes, tables, images, html, code and slide separators.
const NOT_PARAGRAPH_RE = /^(?:[:#>|<]|[-*+] |\d+\. |!\[|```|~~~|-{3}|\*{3}|_{3})/
const LEAD_MAX_LENGTH = 160
const FENCE_RE = /^\s*(?:```|~~~)/

function annotation(lines: string[], tag: string, attribute: string): string | undefined {
  const pattern = new RegExp(`^:${tag}\\{[^}]*\\b${attribute}=(["'])(.*?)\\1`)
  for (const line of lines) {
    const match = pattern.exec(line.trim())
    if (match)
      return match[2]
  }
  return undefined
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
  let inFence = false
  for (const [index, line] of lines.entries()) {
    if (FENCE_RE.test(line))
      inFence = !inFence
    else if (!inFence && HEADING_RE.test(line))
      return index
  }
  return -1
}

/** The first plain paragraph after the heading, which reads as a subtitle. */
function leadParagraph(lines: string[]): string | undefined {
  const line = lines.map(l => l.trim()).find(l => l && !NOT_PARAGRAPH_RE.test(l))
  if (!line)
    return undefined
  const text = plainText(line)
  return text.length > LEAD_MAX_LENGTH ? `${text.slice(0, LEAD_MAX_LENGTH).trimEnd()}…` : text
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
    backgroundImage: annotation(slide, 'slide-background', 'image'),
    backgrounds: data.backgrounds && typeof data.backgrounds === 'object' ? data.backgrounds as ThemeBackgrounds : undefined,
  }
}

// The look of the rendered deck, read for the PowerPoint export: the computed
// styles of its slides, and of probe elements laid in a slide for the elements
// the deck does not hold. The one module of the export that reads the DOM.

import type { Box, PptxRoleStyle, PptxSlideBoxes, PptxStyle, SlideRole } from '@vignettes/pptx'
import { fontFamilies, fontName, ROLE_LEVELS } from '@vignettes/pptx'

let canvasContext: CanvasRenderingContext2D | null | undefined

/** A CSS color as six hexadecimal digits, through a canvas that reads any syntax; none for a color mostly transparent. */
function hex(color: string | undefined): string | undefined {
  if (!color)
    return undefined
  canvasContext ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!canvasContext)
    return undefined
  canvasContext.clearRect(0, 0, 1, 1)
  canvasContext.fillStyle = 'rgba(0, 0, 0, 0)'
  canvasContext.fillStyle = color
  canvasContext.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0, a = 0] = canvasContext.getImageData(0, 0, 1, 1).data
  if (a < 128)
    return undefined
  return [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/** A length in pixels; none for a length the browser does not give. */
function px(value: string | undefined): number | undefined {
  const length = Number.parseFloat(value ?? '')
  return Number.isFinite(length) && length > 0 ? length : undefined
}

// The monospace fonts PowerPoint has on Windows and on macOS.
const OFFICE_MONO = ['Consolas', 'Courier New']

/** The first monospace font of a code stack that PowerPoint has; none when the stack names none. */
function officeMono(stack: string): string | undefined {
  const families = fontFamilies(stack).map(family => family.toLowerCase())
  return OFFICE_MONO.find(font => families.includes(font.toLowerCase()))
}

/** The computed styles of the elements of `html` laid, hidden, in `host`: one per selector. */
function probe(host: Element, html: string, selectors: readonly string[]): CSSStyleDeclaration[] {
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;inset:0;'
  holder.innerHTML = html
  host.append(holder)
  try {
    return selectors.map((selector) => {
      const element = holder.querySelector(selector)
      // Copy the values: the declaration of an element follows it out of the page.
      const style = getComputedStyle(element ?? holder)
      const copy = document.createElement('div').style
      for (const name of style)
        copy.setProperty(name, style.getPropertyValue(name))
      return copy
    })
  }
  finally {
    holder.remove()
  }
}

function backgroundImage(style: CSSStyleDeclaration): string | undefined {
  return style.backgroundImage.match(/url\((["']?)(.*?)\1\)/)?.[2]
}

function roleStyle(root: HTMLElement, role: SlideRole, page: string | undefined): Partial<PptxRoleStyle> | undefined {
  const level = ROLE_LEVELS[role]
  const section = root.querySelector<HTMLElement>(`.slides section.slide-${level}`)
  if (!section)
    return undefined
  const sectionStyle = getComputedStyle(section)
  const layer = root.querySelector<HTMLElement>(`.backgrounds .slide-background.slide-${level}`)
  const layerStyle = layer ? getComputedStyle(layer) : undefined
  const heading = section.querySelector<HTMLElement>(level)
  const headingStyle = heading ? getComputedStyle(heading) : sectionStyle
  const text = hex(sectionStyle.color)
  return {
    background: hex(layerStyle?.backgroundColor) ?? page,
    backgroundImage: layerStyle && backgroundImage(layerStyle),
    title: hex(headingStyle.color) ?? text,
    titleSize: px(headingStyle.fontSize),
    titleBold: Number(headingStyle.fontWeight) >= 600,
    text,
  }
}

/** The elements that hold a box: an element with `display: contents` gives its children. */
function laidOut(element: Element): Element[] {
  return getComputedStyle(element).display === 'contents' ? [...element.children].flatMap(laidOut) : [element]
}

/** The box of the elements, in slide pixels from the top left corner of `section`; none when they take no space. */
function boxOf(elements: readonly Element[], section: DOMRect, scale: number): Box | undefined {
  // An element visually hidden, a heading the slide hides for instance, keeps a box of a pixel.
  const rects = elements.flatMap(laidOut).map(element => element.getBoundingClientRect()).filter(rect => rect.width > 2 && rect.height > 2)
  if (!rects.length)
    return undefined
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.right))
  const bottom = Math.max(...rects.map(rect => rect.bottom))
  return { x: (left - section.left) * scale, y: (top - section.top) * scale, w: (right - left) * scale, h: (bottom - top) * scale }
}

/**
 * Where the pretitle, the title, the body and the media of a slide sit, scaled
 * from the window to the slide. A slide out of the layout has no boxes.
 */
function slideBoxes(section: HTMLElement, width: number | undefined): PptxSlideBoxes | undefined {
  const rect = section.getBoundingClientRect()
  if (!rect.width || !width)
    return undefined
  const scale = width / rect.width
  const pane = section.querySelector('.slide-content-pane')
  const heading = pane?.querySelector('h1, h2, h3') ?? undefined
  const article = pane?.querySelector('article')
  const body = article
    ? [...article.children]
    : [...(pane?.children ?? [])].filter(child => !child.matches('header, hgroup, h1, h2, h3') && !child.querySelector('h1, h2, h3'))
  return {
    pretitle: boxOf([...(pane?.querySelectorAll('.slide-pretitle') ?? [])], rect, scale),
    title: heading && boxOf([heading], rect, scale),
    body: boxOf(body, rect, scale),
    media: boxOf([...section.querySelectorAll(':scope > .slide-media-pane')], rect, scale),
  }
}

/**
 * The result of `measure` with every slide laid out: Reveal hides each slide
 * and each vertical stack away from the slide shown.
 */
function withSlidesShown<T>(root: HTMLElement, measure: () => T): T {
  const hidden = [...root.querySelectorAll<HTMLElement>('.slides section')].filter(section => getComputedStyle(section).display === 'none')
  const inline = hidden.map(section => section.style.display)
  hidden.forEach(section => section.style.display = 'block')
  try {
    return measure()
  }
  finally {
    hidden.forEach((section, at) => section.style.display = inline[at]!)
  }
}

/** The look of the deck rendered in `root`, the `.reveal` element; none before its slides are laid out. */
export function measurePptxStyle(root: HTMLElement): PptxStyle | undefined {
  const slides = root.querySelector<HTMLElement>('.slides')
  const content = root.querySelector<HTMLElement>('.slides section.slide-h3') ?? root.querySelector<HTMLElement>('.slides section')
  if (!slides || !content)
    return undefined
  const host = content.querySelector('article') ?? content
  // The components style their own markup with scoped rules a probe does not
  // match: a quote or a code block reads the element of the deck, or the tokens.
  const tokens = ['--accent', '--accent-bg', '--border', '--surface', '--text-title', '--text-mention']
  const [paragraph, link, pre, head, cell, pretitle, ...colors] = probe(host, [
    '<p>p</p><a href="#">a</a>',
    '<pre><code>c</code></pre><table><thead><tr><th>t</th></tr></thead><tbody><tr><td>t</td></tr></tbody></table>',
    '<hgroup><div class="slide-pretitle"><div><p>p</p></div></div></hgroup>',
    // A token the theme leaves unset reads as transparent, which `hex` leaves out.
    ...tokens.map(token => `<i data-token="${token}" style="color:var(${token}, transparent)"></i>`),
  ].join(''), ['p', 'a', 'pre', 'th', 'td', '.slide-pretitle p', ...tokens.map(token => `[data-token="${token}"]`)]) as CSSStyleDeclaration[]
  const [accent, accentBg, border, surface, titleToken, mentionToken] = colors.map(style => hex(style.color))
  const deckCode = root.querySelector('.slides pre')
  const codeStyle = deckCode ? getComputedStyle(deckCode) : pre!
  const deckQuote = root.querySelector('.slides blockquote p') ?? root.querySelector('.slides blockquote')
  const quoteStyle = deckQuote ? getComputedStyle(deckQuote) : undefined

  const contentStyle = getComputedStyle(content)
  const viewport = root.closest('.reveal-viewport') ?? root
  const page = hex(getComputedStyle(viewport).backgroundColor) ?? surface
  const width = px(getComputedStyle(slides).width)
  const roles: NonNullable<PptxStyle['roles']> = {}
  for (const role of Object.keys(ROLE_LEVELS) as SlideRole[]) {
    const measured = roleStyle(root, role, page)
    if (measured)
      roles[role] = measured
  }
  const headSurface = hex(head!.backgroundColor)
  return {
    width,
    height: px(getComputedStyle(slides).height),
    padding: { x: px(contentStyle.paddingLeft), y: px(contentStyle.paddingTop) },
    font: fontName(getComputedStyle(root).fontFamily),
    mono: officeMono(codeStyle.fontFamily),
    bodySize: px(paragraph!.fontSize) ?? px(contentStyle.fontSize),
    text: hex(paragraph!.color) ?? hex(contentStyle.color),
    title: titleToken,
    mention: mentionToken,
    accent: hex(link!.color) ?? accent,
    pretitle: { color: hex(pretitle!.color), size: px(pretitle!.fontSize) },
    quote: { color: hex(quoteStyle?.color), italic: quoteStyle && quoteStyle.fontStyle === 'italic', bold: quoteStyle && Number(quoteStyle.fontWeight) >= 600 },
    code: { surface: hex(codeStyle.backgroundColor), text: hex(codeStyle.color), size: px(codeStyle.fontSize) },
    table: { headSurface, headText: headSurface && hex(head!.color), line: hex(cell!.borderBottomColor) ?? border },
    frame: { surface: accentBg, line: border, text: mentionToken },
    roles,
    slides: withSlidesShown(root, () => [...root.querySelectorAll<HTMLElement>('.slides section:not(.stack)')].map(section => slideBoxes(section, width))),
  }
}

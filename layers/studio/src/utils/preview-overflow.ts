import type { RevealApi } from 'reveal.js'

/**
 * Resolves once the transitions running in the slides end: a slide moving in,
 * a fragment showing. Until then the boxes sit where the animation puts them.
 */
export async function transitionsEnded(reveal: RevealApi): Promise<void> {
  const animations = reveal.getSlidesElement().getAnimations({ subtree: true })
  const running = animations.filter(animation => animation instanceof CSSTransition)
  await Promise.allSettled(running.map(animation => animation.finished))
}

/** The overflow, in slide pixels, below which a slide counts as fitting. */
export const OVERFLOW_THRESHOLD = 4

/**
 * How far, in slide pixels, the content of `section` reaches past where it
 * may end: the bottom of the slide, and for the text above a media placed at
 * the bottom, the top of that media. 0 when it fits. An element that clips its
 * content (a scaled story frame, a cropped image) bounds the boxes of its
 * descendants, so only what shows counts. The asides are left out: the
 * speaker notes, and the media pane, which keeps its media in its box.
 * `slideHeight` is the height of the slide before Reveal scales it.
 *
 * The function reads nothing outside its body: a browser test runs its source.
 */
export function sectionOverflow(slides: Element, section: Element, slideHeight: number): number {
  const frame = slides.getBoundingClientRect()
  const scale = frame.height / slideHeight || 1
  const media = section.classList.contains('layout-media-bottom') ? section.querySelector(':scope > .slide-media-pane') : null
  const textEnd = media ? media.getBoundingClientRect().top : frame.bottom
  let overflow = 0
  const walk = (element: Element, clip: number) => {
    for (const child of element.children) {
      if (child.tagName === 'ASIDE')
        continue
      const style = getComputedStyle(child)
      if (style.display === 'none' || style.position === 'fixed')
        continue
      const rect = child.getBoundingClientRect()
      if (rect.height > 0)
        overflow = Math.max(overflow, Math.min(rect.bottom, clip) - textEnd)
      walk(child, style.overflowY === 'visible' ? clip : Math.min(clip, rect.bottom))
    }
  }
  walk(section, Number.POSITIVE_INFINITY)
  return Math.max(0, overflow / scale)
}

/** The slide Reveal shows, apart from the stack that holds it. */
export function presentSection(reveal: RevealApi): Element | null {
  return reveal.getSlidesElement().querySelector('section.present:not(.stack)')
}

/** The overflow of the slide on screen, as `sectionOverflow` measures it. */
export function slideOverflow(reveal: RevealApi): number {
  const section = presentSection(reveal)
  return section ? sectionOverflow(reveal.getSlidesElement(), section, reveal.getComputedSlideSize().height) : 0
}

/**
 * The body of `section`, the `article` of its content pane, as the layout panel
 * measures it:
 * - `bodySize`: its computed size, in slide pixels; 0 for a slide without a
 *   body, as a title alone;
 * - `textScale`: the share of its size the body keeps beside a media, against
 *   the body at the same step without a media, under the floor; 1 without a
 *   body. The theme computes the factor of the step, `--text-size-factor`;
 * - `fill`: the share of its room the body fills, from the top of its first
 *   block to the bottom of its last: the content box of the body without a
 *   media and under a veil, the content box of the column of text less its
 *   heading beside, above or below a media and on a card over it;
 * - `ratio`: the ratio between two text steps of the theme, `--text-size-ratio`.
 *
 * The function reads nothing outside its body: a browser test runs its source.
 */
export function bodyReading(section: Element): { bodySize: number, textScale: number, fill: number, ratio: number } {
  const style = getComputedStyle(section)
  const ratio = Number.parseFloat(style.getPropertyValue('--text-size-ratio')) || 1
  const body = section.querySelector(':scope > .slide-content-pane > article')
  if (!body)
    return { bodySize: 0, textScale: 1, fill: 0, ratio }
  const bodySize = Number.parseFloat(getComputedStyle(body).fontSize)
  const factor = Number.parseFloat(style.getPropertyValue('--text-size-factor')) || 1
  const textScale = bodySize / (Number.parseFloat(style.fontSize) * factor)
  // An element in `display: contents`, as the wrapper of the body, has no box: its children stand for it.
  const boxes = (element: Element): DOMRect[] => [...element.children].flatMap(child =>
    getComputedStyle(child).display === 'contents' ? boxes(child) : [child.getBoundingClientRect()])
  const blocks = boxes(body).filter(rect => rect.height > 0)
  if (!blocks.length)
    return { bodySize, textScale, fill: 0, ratio }
  const used = Math.max(...blocks.map(rect => rect.bottom)) - Math.min(...blocks.map(rect => rect.top))
  const pane = section.querySelector(':scope > .slide-content-pane')!
  const column = section.classList.contains('layout-media') && getComputedStyle(pane).display !== 'contents'
  const box = column ? pane : body
  const rect = box.getBoundingClientRect()
  const scale = rect.height / ((box as HTMLElement).offsetHeight || rect.height || 1)
  const padding = getComputedStyle(box)
  const heading = column ? pane.querySelector(':scope > :is(header, hgroup)')?.getBoundingClientRect().height ?? 0 : 0
  const room = rect.height - (Number.parseFloat(padding.paddingTop) + Number.parseFloat(padding.paddingBottom)) * scale - heading
  return { bodySize, textScale, fill: room > 0 ? used / room : 0, ratio }
}

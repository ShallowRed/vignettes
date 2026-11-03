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

/** The size of the body text of `section` against the text of the slide: below 1 when a media beside it shrinks it. */
export function bodyTextScale(section: Element): number {
  const pane = section.querySelector(':scope > .slide-content-pane')
  const size = (element: Element) => Number.parseFloat(getComputedStyle(element).fontSize)
  return pane && getComputedStyle(pane).display !== 'contents' ? size(pane) / size(section) : 1
}

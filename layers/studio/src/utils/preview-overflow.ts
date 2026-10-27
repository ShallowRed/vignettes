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

/**
 * How far, in slide pixels, the content of the slide on screen reaches below
 * the slide: 0 when it fits. An element that clips its content (a scaled story
 * frame, a cropped image) bounds the boxes of its descendants, so only what
 * shows counts. The speaker notes are left out.
 */
export function slideOverflow(reveal: RevealApi): number {
  const slides = reveal.getSlidesElement()
  const section = slides.querySelector('section.present:not(.stack)')
  if (!section)
    return 0
  const limit = slides.getBoundingClientRect()
  const scale = limit.height / reveal.getComputedSlideSize().height || 1
  let bottom = limit.top
  const walk = (element: Element, clip: number) => {
    for (const child of element.children) {
      if (child.tagName === 'ASIDE')
        continue
      const style = getComputedStyle(child)
      if (style.display === 'none' || style.position === 'fixed')
        continue
      const rect = child.getBoundingClientRect()
      if (rect.height > 0)
        bottom = Math.max(bottom, Math.min(rect.bottom, clip))
      walk(child, style.overflowY === 'visible' ? clip : Math.min(clip, rect.bottom))
    }
  }
  walk(section, Number.POSITIVE_INFINITY)
  return Math.max(0, (bottom - limit.bottom) / scale)
}

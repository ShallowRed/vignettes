import type { MDCRoot } from '@nuxtjs/mdc'
import type { SlideRange } from '@vignettes/core/deck'
import type { PresentationData, Slide } from '../types/presentation.ts'
import { knownComponentNames, unknownComponents } from './slide-rendering.ts'

/**
 * Editor-only mapping between the source and what the preview shows. The slide
 * boundaries come from `slideRanges` of `@vignettes/core`, the definition the
 * renderers share; this module finds the slide under a line, the place of a
 * slide the preview draws, and the component names the slides draw as plain
 * content.
 */

/**
 * The component names of a deck that no registered component answers to: the
 * slides draw their content without the component.
 */
export function unknownDeckComponents(data: PresentationData): string[] {
  const known = knownComponentNames()
  const slides = data.slides.flatMap(slide => [slide, ...(slide.verticalSlides ?? [])])
  const trees = slides.flatMap(slide => [slide.header, slide.pretitle, slide.subtitle, slide.body])
  return [...new Set(trees.flatMap(tree => (tree ? unknownComponents(tree as MDCRoot, known) : [])))]
}

/** Reveal indices for the slide containing `line` (1-based), clamped to range. */
export function slideAtLine(ranges: SlideRange[], line: number): { h: number, v: number } {
  let found = ranges[0] ?? { h: 0, v: 0 }
  for (const r of ranges) {
    if (r.startLine <= line)
      found = r
    else
      break
  }
  return { h: found.h, v: found.v }
}

/** Reveal indices of a slide of `slides`, found by identity, or undefined for a slide outside them. */
export function slidePlace(slides: readonly Slide[], slide: Slide): { h: number, v: number } | undefined {
  for (const [h, section] of slides.entries()) {
    const v = section.verticalSlides?.length ? section.verticalSlides.indexOf(slide) : section === slide ? 0 : -1
    if (v >= 0)
      return { h, v }
  }
  return undefined
}

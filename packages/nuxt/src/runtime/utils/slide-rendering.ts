import type { Slide } from '../types/presentation'
import { getMediaFit, resolveSlideBackground } from '@vignettes/core/render'

export { getMediaFit, resolveSlideBackground }

// "Pressé·e ? Ce qui a changé" -> { prefix: "Pressé·e ?", label: "Ce qui a changé" }; null if no " ? ".
export function quicklinkParts(text: string): { prefix: string, label: string } | null {
  const idx = text.indexOf(' ? ')
  if (idx === -1)
    return null
  return { prefix: text.slice(0, idx + 2), label: text.slice(idx + 3) }
}

export function getSlideClasses(slide: Pick<Slide, 'headingLevel' | 'layout'>): string[] {
  const classes: string[] = []
  if (slide.headingLevel)
    classes.push(`slide-${slide.headingLevel}`)
  if (slide.layout)
    classes.push(`layout-${slide.layout}`)
  return classes
}

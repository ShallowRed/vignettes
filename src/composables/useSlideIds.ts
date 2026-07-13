import type { Slide } from '~/types/presentation'
import { getTextContent, slugify } from '~/utils/slugify'

/**
 * Deduplicated heading-based HTML ids ("en-resume", "en-resume-1", …).
 * Vertical id rules: inner[0] (H2 divider) gets no id; inner[1] inherits the
 * section id so #slug skips past the divider; inner[2+] get their own id.
 */
export function useSlideIds(slides: Ref<Slide[]>) {
  const slideIdMap = computed(() => {
    const counts = new Map<string, number>()

    function register(slide: { header?: any }): string | undefined {
      if (!slide?.header?.children?.length)
        return undefined
      const text = getTextContent(slide.header)
      const base = slugify(text, { lower: true, strict: true })
      if (!base)
        return undefined
      const n = counts.get(base) || 0
      counts.set(base, n + 1)
      return n === 0 ? base : `${base}-${n}`
    }

    return slides.value.map((section) => {
      if (section.verticalSlides?.length) {
        const verticalIds = section.verticalSlides.map(vs => register(vs))
        return { sectionId: verticalIds[0], verticalIds }
      }
      return { sectionId: register(section) }
    })
  })

  function getVerticalId(sectionIndex: number, vIndex: number): string | undefined {
    if (vIndex === 0)
      return undefined
    if (vIndex === 1)
      return slideIdMap.value[sectionIndex]?.sectionId
    return slideIdMap.value[sectionIndex]?.verticalIds?.[vIndex]
  }

  return { slideIdMap, getVerticalId }
}

import { useRequestURL } from '#imports'
import { isDeckUrl } from '@vignettes/core/deck'
import { EMBED_FOCUS_POLICY, EMBED_REFERRER_POLICY, embedSandbox } from '@vignettes/core/render'

export interface FrameAttributes {
  'data-src'?: string
  'sandbox': string
  'referrerpolicy': typeof EMBED_REFERRER_POLICY
  'allow': typeof EMBED_FOCUS_POLICY
}

/**
 * The attributes of an embedded frame: its source, the sandbox for that source,
 * the referrer policy and the focus permission. A source outside `isDeckUrl` leaves the frame empty.
 * The source is Reveal's lazy `data-src`: Reveal loads the frames of a slide
 * when the slide is shown, and `RevealPresentation` loads every frame of the
 * print view once the deck is paged.
 */
export function useFrameAttributes(): (src?: string) => FrameAttributes {
  const origin = useRequestURL().origin
  return (src) => {
    const safe = isDeckUrl(src) ? src : undefined
    return {
      'data-src': safe,
      'sandbox': embedSandbox(safe ?? '', origin),
      'referrerpolicy': EMBED_REFERRER_POLICY,
      'allow': EMBED_FOCUS_POLICY,
    }
  }
}

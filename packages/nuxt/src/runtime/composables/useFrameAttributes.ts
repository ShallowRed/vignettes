import { useRequestURL } from '#imports'
import { isDeckUrl } from '@vignettes/core/deck'
import { EMBED_REFERRER_POLICY, embedSandbox } from '@vignettes/core/render'
import { inject } from 'vue'
import { PRINT_VIEW_KEY } from '../config/injection-keys.ts'

export interface FrameAttributes {
  'src'?: string
  'data-src'?: string
  'sandbox': string
  'referrerpolicy': typeof EMBED_REFERRER_POLICY
}

/**
 * The attributes of an embedded frame: its source, the sandbox for that source
 * and the referrer policy. A source outside `isDeckUrl` leaves the frame empty.
 * In the print view the source is Reveal's lazy `data-src`, which
 * `RevealPresentation` turns into `src` once the deck is paged.
 */
export function useFrameAttributes(): (src?: string) => FrameAttributes {
  const printView = inject(PRINT_VIEW_KEY, false)
  const origin = useRequestURL().origin
  return (src) => {
    const safe = isDeckUrl(src) ? src : undefined
    return {
      ...(printView ? { 'data-src': safe } : { src: safe }),
      sandbox: embedSandbox(safe ?? '', origin),
      referrerpolicy: EMBED_REFERRER_POLICY,
    }
  }
}

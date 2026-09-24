import { inject } from 'vue'
import { PRINT_VIEW_KEY } from '../config/injection-keys.ts'

/**
 * The source attribute of an embedded frame. In the print view it is Reveal's
 * lazy `data-src`, which `RevealPresentation` turns into `src` once the deck is
 * paged.
 */
export function useFrameSource(): (src?: string) => { 'src'?: string, 'data-src'?: string } {
  const printView = inject(PRINT_VIEW_KEY, false)
  return src => printView ? { 'data-src': src } : { src }
}

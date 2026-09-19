import type { PresentationMetadata } from '../types/presentation.ts'
import { DEFAULT_REVEAL_CONFIG } from '@vignettes/core/render'
import { getDefaultTheme } from '@vignettes/core/theme'

/** The defaults of a deck's frontmatter. The fallback theme is registered after this module is evaluated. */
export function defaultMetadata(): PresentationMetadata {
  return {
    theme: getDefaultTheme(),
    transition: 'slide',
    center: true,
  }
}

export { DEFAULT_REVEAL_CONFIG }

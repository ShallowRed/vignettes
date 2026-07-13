import type { PresentationMetadata } from '~/types/presentation'
import { buildComponentMap, FULL_SLIDE_COMPONENT_NAMES } from '#shared/deck'
import { DEFAULT_REVEAL_CONFIG } from '#shared/render'
import { THEME_BACKGROUNDS } from '#shared/theme/tokens'

export const DEFAULT_METADATA: PresentationMetadata = {
  theme: 'minimal',
  transition: 'slide',
  center: true,
}

export { THEME_BACKGROUNDS }

export { DEFAULT_REVEAL_CONFIG }

// Top-level nodes of these components keep all children in `body` (no header/body split).
export const FULL_SLIDE_COMPONENTS = FULL_SLIDE_COMPONENT_NAMES

// `slide-background` is deliberately absent: it's a slide annotation filtered out in utils/slide-ast.ts, not a component.
export const MDC_COMPONENTS = buildComponentMap()

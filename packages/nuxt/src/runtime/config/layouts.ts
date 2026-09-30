import { DECK_LAYOUTS } from '@vignettes/core/deck'

// 'full' = whole slide rendered by one MDCRenderer (needs handling in SlideContent.vue);
// 'default' = header/article structure with optional CSS-grid media pane (CSS-only, no template change).
export type LayoutStrategy = 'full' | 'default'

export const SLIDE_LAYOUT_REGISTRY: Record<string, LayoutStrategy> = Object.fromEntries(
  DECK_LAYOUTS.map(layout => [layout.name, layout.fullSlide ? 'full' : 'default']),
)

export function getLayoutStrategy(layout?: string): LayoutStrategy {
  if (!layout)
    return 'default'
  return SLIDE_LAYOUT_REGISTRY[layout] ?? 'default'
}

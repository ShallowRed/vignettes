// 'full' = whole slide rendered by one MDCRenderer (needs handling in SlideContent.vue);
// 'default' = header/article structure with optional CSS-grid media pane (CSS-only, no template change).
export type LayoutStrategy = 'full' | 'default'

export const SLIDE_LAYOUT_REGISTRY: Record<string, LayoutStrategy> = {
  'full': 'full',
  'media-right': 'default',
  'media-left': 'default',
  'media-right-wide': 'default',
  'media-left-wide': 'default',
  'media-right-xwide': 'default',
  'media-left-xwide': 'default',
  'media-below': 'default',
  'media-above': 'default',
  'media-cover': 'default',
  'grid-compact': 'default',
}

export function getLayoutStrategy(layout?: string): LayoutStrategy {
  if (!layout)
    return 'default'
  return SLIDE_LAYOUT_REGISTRY[layout] ?? 'default'
}

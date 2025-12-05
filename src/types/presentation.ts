/**
 * Core type definitions for the presentation system
 */

export interface Slide {
  header?: any
  subtitle?: any
  body: any
  verticalSlides?: Slide[]
  headingLevel?: string
  backgroundImage?: string
  layout?: string
}

export interface ThemeBackgrounds {
  h1?: string
  h2?: string
  h3?: string
  default?: string
}

/**
 * Reveal.js configuration options
 * These are passed directly to Reveal.initialize()
 */
export interface RevealConfig {
  hash?: boolean
  center?: boolean
  transition?: string
  slideNumber?: string | boolean
  embedded?: boolean
  margin?: number
  minScale?: number
  maxScale?: number
  width?: number
  height?: number
  controls?: boolean
  progress?: boolean
  keyboard?: boolean
  touch?: boolean
  loop?: boolean
  fragments?: boolean
  help?: boolean
  showNotes?: boolean
  autoPlayMedia?: boolean | null
  preloadIframes?: boolean | null
  autoSlide?: number
  view?: string
  navigationMode?: 'default' | 'linear' | 'grid'
}

/**
 * Custom presentation metadata (not Reveal.js config)
 */
export interface PresentationMeta {
  title?: string
  lang?: string
  theme?: string
  backgrounds?: ThemeBackgrounds
}

/**
 * Full presentation metadata from frontmatter
 * - reveal: Reveal.js configuration
 * - Everything else: custom metadata
 */
export interface PresentationMetadata extends PresentationMeta {
  reveal?: RevealConfig
  // Legacy support: flat Reveal.js options (deprecated)
  transition?: string
  center?: boolean
  [key: string]: any
}

export interface PresentationData {
  slides: Slide[]
  metadata: PresentationMetadata
}

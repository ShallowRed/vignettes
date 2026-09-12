import type { RevealConfig, Slide, ThemeBackgrounds } from '@vignettes/core/deck'

export type { RevealConfig, Slide, ThemeBackgrounds }

export type { PublicationStatus } from '#shared/access'
export interface PresentationMeta {
  title?: string
  lang?: string
  theme?: string
  backgrounds?: ThemeBackgrounds
  // Published Storybook root (no trailing `iframe.html`); resolves `:layout{story=…}` iframes.
  storybook?: string
  // 'heading' splits by H1/H2/H3; 'separator' splits by --- / ----.
  parser?: 'heading' | 'separator'
}

export interface PresentationMetadata extends PresentationMeta {
  reveal?: RevealConfig
  // Deprecated flat Reveal.js options.
  transition?: string
  center?: boolean
  // Hashed password for semi-private presentations.
  accessPassword?: string
  [key: string]: any
}

export interface PresentationData {
  slides: Slide[]
  metadata: PresentationMetadata
}

export interface PresentationListItem {
  slug: string
  title: string
  theme: string
  status: PublicationStatus
  filename: string
}

import type { ParserId, RevealConfig, Slide, ThemeBackgrounds } from '@vignettes/core/deck'
import type { PublicationStatus } from '@vignettes/core/status'

export type { PublicationStatus, RevealConfig, Slide, ThemeBackgrounds }

export interface PresentationMeta {
  title?: string
  lang?: string
  theme?: string
  backgrounds?: ThemeBackgrounds
  // Published Storybook root (no trailing `iframe.html`); resolves `:layout{story=…}` iframes.
  storybook?: string
  // 'separator' (the default) splits by --- / ----; 'heading' splits by H1/H2/H3.
  parser?: ParserId
}

export interface PresentationMetadata extends PresentationMeta {
  reveal?: RevealConfig
  // Deprecated flat Reveal.js options.
  transition?: string
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

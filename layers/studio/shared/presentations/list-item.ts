import type { SlideBrand } from '@vignettes/core/render'
import type { Lifecycle, PublicationStatus } from '../access/status'

// Canonical wire contract between GET /api/presentations and the home/admin pages.
/** What a catalog card draws of a deck: its title slide, in its theme. */
export interface DeckPreview {
  /** Theme name after aliases, whose preview tokens style the card. */
  theme: string
  title?: string
  pretitle?: string
  subtitle?: string
  /** The `surfaceLevel` of the title slide, which may change the theme's colors. */
  surface?: 'h1' | 'h2' | 'h3'
  /** Background image of the title slide: its own, the deck's, or the theme's. */
  background?: string
  /** The bloc marque of the title slide. */
  brand?: SlideBrand
}

export interface PresentationListItem {
  slug: string
  title: string
  theme: string
  status: PublicationStatus
  filename: string
  /** Frontmatter `project:` slug — the catalog's grouping axis. */
  project?: string
  /** Hidden from the catalog for non-privileged actors. */
  unlisted?: boolean
  /** Pinned to the top of the public showcase. */
  /** Link to `/p/<alias>` when present. */
  alias?: string
  /** frozen/archived serve a static bundle. */
  lifecycle?: Lifecycle
  /** Privileged only: false until a first publish gives the deck servable content. */
  published?: boolean
  /**
   * This actor may edit this deck: a global editor/owner, or the holder of an
   * `editor` grant on it (or on its folder). Drives the card's edit affordance,
   * which must not follow the global role alone.
   */
  canEdit?: boolean
  /** For whoever may edit: the draft differs from the published version. */
  unpublishedChanges?: boolean
  /** This actor may manage the per-deck grants of this deck (`canShare`). */
  canShare?: boolean
  /** For whoever may share it: a semi-private deck without one is unreachable (fail-closed). */
  hasPassword?: boolean
  /** Privileged only: number of per-deck grants (folder master keys not included). */
  sharedCount?: number
  /** Versions of one presentation share a family; the folder shows them as one card. */
  family?: string
  /** What sets this deck apart within its family: `FR`, `EN`, `Vidéo`. */
  variantLabel?: string
  /** Slug of the deck that replaces this one. */
  supersededBy?: string
  /** The title slide of the published version. */
  preview?: DeckPreview
  /** Slides in the published version. */
  slideCount?: number
  /** Last change in milliseconds: metadata, publish, and the draft for whoever may edit. */
  updatedAt?: number
}

/** Canonical in-app path of a deck: stable alias when it has one, slug route otherwise. */
export function deckPath(item: Pick<PresentationListItem, 'alias' | 'slug'>): string {
  return item.alias ? `/p/${item.alias}` : `/slides/${item.slug}`
}

/** Where a click on a deck leads: the editor of a deck with nothing published, for whoever may edit it, and the deck otherwise. */
export function deckTarget(item: Pick<PresentationListItem, 'alias' | 'slug' | 'canEdit' | 'published'>): string {
  return item.canEdit && item.published === false ? `/edit/${item.slug}` : deckPath(item)
}

export { isFrozen } from '../access/status'

import type { PublicationStatus } from '../access/status'
import { z } from 'zod'
import { LifecycleSchema, PublicationStatusSchema } from '../access/status'
import { DeckSlugSchema } from './deck-slug'

/** The shortest password of a semi-private deck. */
export const ACCESS_PASSWORD_MIN_LENGTH = 8
/** Plain password of a semi-private deck, hashed by the server. */
export const AccessPasswordSchema = z.string().min(ACCESS_PASSWORD_MIN_LENGTH).max(200)

/** The name of a deck among the variants of its family. */
export const VariantLabelSchema = z.string().trim().min(1).max(40)

/** The longest label of a snapshot. */
export const SNAPSHOT_LABEL_MAX_LENGTH = 80
export const SnapshotLabelSchema = z.string().trim().min(1).max(SNAPSHOT_LABEL_MAX_LENGTH)

/**
 * What `POST /api/presentations` accepts. A deck starts from a template, with
 * the title and the theme typed in the dialog, or from an imported file, whose
 * frontmatter gives them.
 */
export const CreateDeckSchema = z.union([
  z.object({
    slug: z.string().min(1),
    title: z.string().trim().min(1),
    project: z.string().min(1).optional(),
    theme: z.string().min(1).optional(),
    template: z.string().min(1).optional(),
  }).strict(),
  z.object({
    slug: z.string().min(1),
    project: z.string().min(1).optional(),
    raw: z.string().min(1),
    // The title of a file whose frontmatter has none, typed in the form.
    title: z.string().trim().min(1).optional(),
  }).strict(),
])
export type CreateDeckInput = z.input<typeof CreateDeckSchema>

/**
 * What `PATCH /api/admin/decks/:slug` accepts; `null` clears a column. The
 * title and the theme are absent: each publication reads them from the
 * frontmatter, so a column written here would not outlive the next one.
 */
export const DeckMetaPatchSchema = z.object({
  status: PublicationStatusSchema.optional(),
  lifecycle: LifecycleSchema.optional(),
  project: z.string().nullable().optional(),
  // Each names a path segment of `/p/` or `/frozen/`, and the bundle a directory of `.frozen/`.
  alias: DeckSlugSchema.nullable().optional(),
  frozenBundle: DeckSlugSchema.nullable().optional(),
  unlisted: z.boolean().optional(),
  family: z.string().trim().min(1).max(120).nullable().optional(),
  variantLabel: VariantLabelSchema.nullable().optional(),
  supersededBy: DeckSlugSchema.nullable().optional(),
  // The UI sets it next to the semi-private status, and null clears it.
  accessPassword: AccessPasswordSchema.nullable().optional(),
}).strict()
export type DeckMetaPatch = z.input<typeof DeckMetaPatchSchema>

/** What `POST /api/presentations/:slug/duplicate` accepts. */
export const DuplicateDeckSchema = z.object({
  slug: DeckSlugSchema,
  title: z.string().trim().min(1).optional(),
  /** `variant`: a version beside the source (a language, a format); `edition`: the deck that replaces it. */
  mode: z.enum(['variant', 'edition']),
  variantLabel: VariantLabelSchema.optional(),
  /** The label the source takes when it had none, so both show on the family card. */
  sourceVariantLabel: VariantLabelSchema.optional(),
}).strict()
export type DuplicateDeckInput = z.input<typeof DuplicateDeckSchema>

/** What `POST /api/presentations/:slug/snapshots` accepts. */
export const SnapshotRequestSchema = z.object({ label: SnapshotLabelSchema.optional() })

/** A version of the family of a deck, as the deck page lists it. */
export interface DeckVariant {
  slug: string
  alias: string | null
  title: string
  variantLabel: string
}

/**
 * What `GET /api/presentations/:slug/viewer` answers: the variants the visitor
 * may open and, to whoever may edit the deck, its publication and its folder.
 */
export interface DeckViewer {
  canEdit: boolean
  variants: DeckVariant[]
  published?: boolean
  unpublishedChanges?: boolean
  project?: string | null
}

/** What `GET /api/presentations/:slug?draft` answers to whoever may edit the deck. */
export interface DeckDraftSource {
  content: string
  status: PublicationStatus
  title?: string
  from: 'draft' | 'published'
  writable: boolean
  /** Echoed back by a solo save, so a concurrent draft is detected. */
  stamp: number | null
  publishedRaw: string | null
  publishedAt: number | null
}

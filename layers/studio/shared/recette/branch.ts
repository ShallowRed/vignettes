import { z } from 'zod'
import { safeRedirectPath } from '../access/redirect'
import { DeckSlugSchema } from '../presentations/deck-slug'
import { RECETTE_PREFIX } from './personas'

/**
 * The recette file of a branch, `test/recette/<subject>.yaml`: the trial decks
 * to create in the local database and the checks to make on the local studio.
 * The kit reads it in development only.
 */

/**
 * The accounts a check opens the app as: the personas whose global role is
 * enough, and the visitor without a session. `collab` and `expired` hold grants
 * of the `recette-*` data set, which development does not create at boot.
 */
export const RECETTE_ACCOUNTS = ['owner', 'editor', 'viewer', 'anonymous'] as const

const RecetteDeckSchema = z.object({
  slug: DeckSlugSchema.refine(slug => slug.startsWith(RECETTE_PREFIX), `A trial deck slug starts with ${RECETTE_PREFIX}`),
  /** The `.md` deck file, from the root of the repository. */
  file: z.string().min(1),
})

const RecetteCheckSchema = z.object({
  account: z.enum(RECETTE_ACCOUNTS),
  page: z.string().refine(page => safeRedirectPath(page, '') === page, 'A page is a path of the studio, such as /edit/<slug>'),
  expect: z.string().trim().min(1),
})

export const RecetteFileSchema = z.object({
  title: z.string().trim().min(1),
  decks: z.array(RecetteDeckSchema).default([]).refine(decks => new Set(decks.map(deck => deck.slug)).size === decks.length, 'A trial deck slug appears once'),
  checks: z.array(RecetteCheckSchema).min(1),
})

export type RecetteDeck = z.infer<typeof RecetteDeckSchema>
export type RecetteCheck = z.infer<typeof RecetteCheckSchema>

/** A recette file as the kit reads it: its content, or why it cannot be used. */
export type BranchRecetteFile
  = | { path: string, title: string, decks: Array<RecetteDeck & { exists: boolean }>, checks: RecetteCheck[] }
    | { path: string, error: string }

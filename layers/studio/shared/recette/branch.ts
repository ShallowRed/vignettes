import type { RecetteWidth } from './captures'
import { z } from 'zod'
import { safeRedirectPath } from '../access/redirect'
import { DeckSlugSchema } from '../presentations/deck-slug'
import { RECETTE_SUBJECT_RE } from './captures'
import { RECETTE_PREFIX } from './personas'

/**
 * The recette file of a branch, `test/recette/<subject>.yaml`: the trial decks
 * to create in the local database and the questions Lucas answers from their
 * captures, the visual judgments no measure settles. The kit reads it in
 * development only.
 */

/**
 * The accounts a question opens the app as: the personas whose global role is
 * enough, and the visitor without a session. `collab` and `expired` hold grants
 * of the `recette-*` data set, which development does not create at boot.
 */
export const RECETTE_ACCOUNTS = ['owner', 'editor', 'viewer', 'anonymous'] as const

const RecetteDeckSchema = z.object({
  slug: DeckSlugSchema.refine(slug => slug.startsWith(RECETTE_PREFIX), `A trial deck slug starts with ${RECETTE_PREFIX}`),
  /** The `.md` deck file, from the root of the repository. */
  file: z.string().min(1),
})

/** A gesture the capture plays before it takes its picture, in the order of the list. */
const RecetteStepSchema = z.union([
  z.strictObject({
    click: z.union([
      z.strictObject({ role: z.string().min(1), name: z.string().min(1) }),
      z.strictObject({ text: z.string().min(1) }),
    ]),
  }),
  z.strictObject({ press: z.string().min(1), repeat: z.int().min(1).max(20).optional() }),
  z.strictObject({ type: z.string().min(1) }),
])

const RecetteQuestionSchema = z.strictObject({
  id: z.string().regex(RECETTE_SUBJECT_RE, 'A question id is written in lowercase letters, digits and hyphens'),
  account: z.enum(RECETTE_ACCOUNTS),
  page: z.string().refine(page => safeRedirectPath(page, '') === page, 'A page is a path of the studio, such as /edit/<slug>'),
  question: z.string().trim().min(1).max(200),
  steps: z.array(RecetteStepSchema).optional(),
  /** Captures the whole page, beyond the window. */
  full: z.boolean().optional(),
})

export const RecetteFileSchema = z.object({
  title: z.string().trim().min(1),
  decks: z.array(RecetteDeckSchema).default([]).refine(decks => new Set(decks.map(deck => deck.slug)).size === decks.length, 'A trial deck slug appears once'),
  questions: z.array(RecetteQuestionSchema).min(1).refine(questions => new Set(questions.map(question => question.id)).size === questions.length, 'A question id appears once in its file'),
  checks: z.undefined({ error: 'This recette file uses the earlier format: write its checks as questions (CONTRIBUTING.md#local-acceptance)' }).optional(),
})

export type RecetteDeck = z.infer<typeof RecetteDeckSchema>
export type RecetteStep = z.infer<typeof RecetteStepSchema>
export type RecetteQuestion = z.infer<typeof RecetteQuestionSchema>

/** A recette file as the kit reads it: its content, or why it cannot be used. */
export type BranchRecetteFile
  = | { path: string, title: string, decks: Array<RecetteDeck & { exists: boolean }>, questions: RecetteQuestion[] }
    | { path: string, error: string }

/** A capture of a question at one width: its key, and whether the worktree changed since it was taken. */
export interface RecetteCapture {
  key: string
  stale: boolean
}

/** A question with its capture at each width, null for a capture not taken. */
export type CapturedRecetteQuestion = RecetteQuestion & { captures: Record<RecetteWidth, RecetteCapture | null> }

/** A recette file with the captures of its questions. */
export type CapturedRecetteFile
  = | { path: string, title: string, decks: Array<RecetteDeck & { exists: boolean }>, questions: CapturedRecetteQuestion[] }
    | { path: string, error: string }

/** The answer of `GET /api/recette/branch`: the branch, its recette with the captures, and the state of the worktree. */
export interface BranchRecetteAnswer {
  branch: string | null
  files: CapturedRecetteFile[]
  state: string | null
}

import type { DeckGrant } from './roles'
import { z } from 'zod'
import { ProviderHandleSchema } from './handles'
import { DeckGrantSchema } from './roles'

/**
 * Sharing wire contracts (client ⇄ admin permission endpoints). A grant escalates
 * one user on one scope; the scope is either a single deck or a whole project
 * (a project grant is a master key over every deck in the project).
 */

/** What a grant applies to: one deck, or a whole project. */
export interface PermissionScope {
  kind: 'deck' | 'project'
  slug: string
}

/** A grant row as listed by the sharing panels (the UI-facing subset). */
export interface GrantSummary {
  userId: number
  login: string
  role: DeckGrant
  /** The account was pre-provisioned by invitation and never logged in. */
  invited?: boolean
  /** ISO date after which the grant no longer resolves; null/absent = permanent. */
  expiresAt?: string | null
}

/** The body of a grant write: its role, and an expiry in the future or none (permanent). */
export const GrantBodySchema = z.object({
  role: DeckGrantSchema,
  expiresAt: z.string().datetime().nullable().optional().refine(v => v == null || new Date(v) > new Date(), 'expiresAt must be in the future'),
}).strict()

/** A grant to an account named by its provider handle, invited when it has never logged in. */
export const HandleGrantBodySchema = GrantBodySchema.extend({ account: ProviderHandleSchema }).strict()
export type HandleGrantBody = z.infer<typeof HandleGrantBodySchema>

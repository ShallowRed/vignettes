import type { DeckGrant } from './roles'

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
}

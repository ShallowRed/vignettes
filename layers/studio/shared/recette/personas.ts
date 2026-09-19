import type { Role } from '../access/roles'

/**
 * The synthetic accounts of the staging acceptance kit. Ids sit far above any
 * real provider id; logins carry the `recette-` prefix like every seeded row,
 * so a reset can find and remove them.
 */
export interface RecettePersona {
  key: string
  id: number
  login: string
  name: string
  role: Exclude<Role, 'anonymous'>
  /** Message keys of the name and description shown on the acceptance kit page. */
  labelKey: string
  summaryKey: string
}

export const RECETTE_PREFIX = 'recette-'

export const RECETTE_PERSONAS: readonly RecettePersona[] = [
  {
    key: 'owner',
    id: 910_000_001,
    login: 'recette-owner',
    name: 'Recette Owner',
    role: 'owner',
    labelKey: 'recette.personas.owner.label',
    summaryKey: 'recette.personas.owner.summary',
  },
  {
    key: 'editor',
    id: 910_000_002,
    login: 'recette-editeur',
    name: 'Recette Éditeur',
    role: 'editor',
    labelKey: 'recette.personas.editor.label',
    summaryKey: 'recette.personas.editor.summary',
  },
  {
    key: 'viewer',
    id: 910_000_003,
    login: 'recette-lecteur',
    name: 'Recette Lecteur',
    role: 'viewer',
    labelKey: 'recette.personas.viewer.label',
    summaryKey: 'recette.personas.viewer.summary',
  },
  {
    key: 'collab',
    id: 910_000_004,
    login: 'recette-collab',
    name: 'Recette Collaborateur',
    role: 'viewer',
    labelKey: 'recette.personas.collab.label',
    summaryKey: 'recette.personas.collab.summary',
  },
  {
    key: 'expired',
    id: 910_000_005,
    login: 'recette-expire',
    name: 'Recette Accès expiré',
    role: 'viewer',
    labelKey: 'recette.personas.expired.label',
    summaryKey: 'recette.personas.expired.summary',
  },
]

/** The invited-but-never-logged-in account shown in the share panels. */
export const RECETTE_INVITED_HANDLE = 'invite.recette@example.com'

/** Password of the semi-private deck `recette-mdp`. */
export const RECETTE_PASSWORD = 'recette'

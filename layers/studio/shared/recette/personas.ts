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
  label: string
  summary: string
}

export const RECETTE_PREFIX = 'recette-'

export const RECETTE_PERSONAS: readonly RecettePersona[] = [
  {
    key: 'owner',
    id: 910_000_001,
    login: 'recette-owner',
    name: 'Recette Owner',
    role: 'owner',
    label: 'Owner',
    summary: 'Contenu, métadonnées, accès, comptes, corbeille.',
  },
  {
    key: 'editor',
    id: 910_000_002,
    login: 'recette-editeur',
    name: 'Recette Éditeur',
    role: 'editor',
    label: 'Éditeur global',
    summary: 'Édite, publie, modifie les métadonnées. Pas les accès ni les comptes.',
  },
  {
    key: 'viewer',
    id: 910_000_003,
    login: 'recette-lecteur',
    name: 'Recette Lecteur',
    role: 'viewer',
    label: 'Lecteur sans accès',
    summary: 'Connecté sans accès accordé : catalogue public seulement.',
  },
  {
    key: 'collab',
    id: 910_000_004,
    login: 'recette-collab',
    name: 'Recette Collaborateur',
    role: 'viewer',
    label: 'Collaborateur',
    summary: 'Clé maîtresse éditeur sur le dossier partagé, lecture sur « Lecture seule ».',
  },
  {
    key: 'expired',
    id: 910_000_005,
    login: 'recette-expire',
    name: 'Recette Accès expiré',
    role: 'viewer',
    label: 'Accès expiré',
    summary: 'Clé maîtresse expirée hier : équivaut à un lecteur sans accès.',
  },
]

/** The invited-but-never-logged-in account shown in the share panels. */
export const RECETTE_INVITED_HANDLE = 'invite.recette@example.com'

/** Password of the semi-private deck `recette-mdp`. */
export const RECETTE_PASSWORD = 'recette'

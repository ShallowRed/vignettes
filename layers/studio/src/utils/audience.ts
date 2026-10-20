import type { GrantTerm } from '#shared/access'
import { isExpired } from '#shared/access'

export type AudienceCount
  = | { variant: 'alone' | 'direct' | 'folder' | 'both', direct: number, folder: number }
    | { variant: 'uncounted' }

/**
 * The grants that open a deck besides its visibility, direct and through its
 * folder, as the sentence "who can open this deck" counts them. A list that
 * failed to load is `undefined`, and the sentence then gives no count. An
 * expired grant opens nothing and is not counted.
 */
export function countAudience(direct: GrantTerm[] | undefined, folder: GrantTerm[] | undefined, now = new Date()): AudienceCount {
  if (!direct || !folder)
    return { variant: 'uncounted' }
  const live = (grants: GrantTerm[]) => grants.filter(grant => !isExpired(grant, now)).length
  const counts = { direct: live(direct), folder: live(folder) }
  const variant = counts.direct && counts.folder ? 'both' : counts.direct ? 'direct' : counts.folder ? 'folder' : 'alone'
  return { variant, ...counts }
}

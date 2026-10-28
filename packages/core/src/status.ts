import { z } from 'zod'

/**
 * Visibility: a CHOICE about who may see the deck. Publication is a separate,
 * derived FACT (`publishedVersionId === null` means unpublished), so there is no
 * `draft` here: it granted exactly the same access as `private` while pretending
 * to describe publication, and most decks carrying it were in fact published.
 */
export const PublicationStatusSchema = z.enum(['public', 'private', 'semi-private'])
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>
export const PUBLICATION_STATUSES = PublicationStatusSchema.options

/** Registry state: live decks vs frozen/archived static bundles. */
export const LifecycleSchema = z.enum(['live', 'frozen', 'archived'])
export type Lifecycle = z.infer<typeof LifecycleSchema>

/** Frozen and archived decks serve a static bundle and are read-only. */
export function isFrozen(item: { lifecycle?: string | null }): boolean {
  return item.lifecycle === 'frozen' || item.lifecycle === 'archived'
}

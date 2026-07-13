import { z } from 'zod'

/** The access-folder axis under `presentations/`. */
export const PublicationStatusSchema = z.enum(['public', 'draft', 'private', 'semi-private'])
export type PublicationStatus = z.infer<typeof PublicationStatusSchema>
export const PUBLICATION_STATUSES = PublicationStatusSchema.options

/** Registry state (DDR-018): live decks vs frozen/archived static bundles. */
export const LifecycleSchema = z.enum(['live', 'frozen', 'archived'])
export type Lifecycle = z.infer<typeof LifecycleSchema>

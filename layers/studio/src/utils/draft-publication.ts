import { changedLines } from './changed-lines'

/**
 * Whether the draft holds changes the visitors do not see: unknown (null) while
 * the draft is not read yet, true for a deck never published.
 */
export function draftUnpublished(draft: string | null, published: string | null): boolean | null {
  if (draft === null)
    return null
  return published === null || draft !== published
}

/** The lines the draft changed since the version the visitors see, 0 while either text is unknown. */
export function draftChanges(draft: string | null, published: string | null): number {
  return draft === null || published === null ? 0 : changedLines(published, draft)
}

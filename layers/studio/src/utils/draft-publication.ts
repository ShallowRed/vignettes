/**
 * Whether the draft holds changes the visitors do not see: unknown (null) while
 * the draft is not read yet, true for a deck never published.
 */
export function draftUnpublished(draft: string | null, published: string | null): boolean | null {
  if (draft === null)
    return null
  return published === null || draft !== published
}

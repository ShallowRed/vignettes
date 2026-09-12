/**
 * Central Pinia Colada query keys — one source of truth so queries and the
 * mutations that invalidate them can never drift apart. Keys are plain,
 * hierarchical tuples: invalidating a prefix (e.g. `['deck', slug]`) invalidates
 * every child query under it.
 *
 * Keep this module pure (no I/O, no composables): the query *functions* live in
 * the composables that capture the request context (`useRequestFetch`); only the
 * keys belong here.
 */

/** The catalog: the access-filtered deck listing and the project folders. */
export const catalogKeys = {
  presentations: ['presentations'] as const,
  projects: ['projects'] as const,
}

/** The trash (corbeille): soft-deleted projects and standalone decks. */
export const trashKeys = {
  all: ['trash'] as const,
}

/** Known identities (for the sharing pickers). */
export const usersKeys = {
  all: ['users'] as const,
}

/** Per-deck sub-queries, nested under a `['deck', slug]` prefix. */
export const deckKeys = {
  root: (slug: string) => ['deck', slug] as const,
  sharing: (slug: string) => ['deck', slug, 'sharing'] as const,
}

/** Per-project sub-queries, nested under a `['project', slug]` prefix. */
export const projectKeys = {
  root: (slug: string) => ['project', slug] as const,
  sharing: (slug: string) => ['project', slug, 'sharing'] as const,
}

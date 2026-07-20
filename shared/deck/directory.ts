import type { Lifecycle } from '../access/status'

/**
 * `DeckDirectory` port: the diffusion registry — stable aliases, lifecycle and
 * frozen-bundle mapping. Adapters: database (decks + deck_aliases) and the
 * legacy registry.yml; the server composes them db-first.
 */

export interface DeckDirectoryEntry {
  alias: string
  /** Stub slug; defaults to the alias. */
  slug: string
  title?: string
  lifecycle: Lifecycle
  /** Bundle folder served when lifecycle is frozen/archived. */
  frozenBundle?: string
  /** Legacy yaml access-folder hint. */
  access?: string
  /** Historical paths redirected to this alias. */
  aliases?: string[]
}

export interface DeckDirectory {
  /** Resolve a canonical alias, stub slug, or historical path; null when unknown. */
  resolveAlias: (alias: string) => Promise<DeckDirectoryEntry | null>
  list: () => Promise<DeckDirectoryEntry[]>
}

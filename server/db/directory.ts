import type { DeckDirectory, DeckDirectoryEntry } from '#shared/deck'
import type { ProjectDirectory } from '#shared/projects'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm'
import { deckAliases, decks, projects } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>
type DeckRow = typeof decks.$inferSelect

/**
 * SQLite adapters for the directory ports. A deck participates in the alias
 * directory once it has a canonical alias; historical paths live in
 * `deck_aliases`. The yaml adapters keep serving everything else (db-first chain
 * composed in `server/utils/sources.ts`).
 */
export function createDbDirectory(db: Db): { decks: DeckDirectory, projects: ProjectDirectory } {
  function toEntry(row: DeckRow, historical: string[]): DeckDirectoryEntry {
    return {
      alias: row.alias!,
      slug: row.slug,
      title: row.title,
      lifecycle: row.lifecycle as DeckDirectoryEntry['lifecycle'],
      frozenBundle: row.frozenBundle ?? undefined,
      aliases: historical.length ? historical : undefined,
    }
  }

  function historicalFor(slug: string): string[] {
    return db.select({ alias: deckAliases.alias }).from(deckAliases).where(eq(deckAliases.deckSlug, slug)).all().map(r => r.alias)
  }

  return {
    decks: {
      async resolveAlias(alias) {
        // A trashed deck resolves to nothing: its alias 404s rather than redirecting.
        const direct = db.select().from(decks).where(and(eq(decks.alias, alias), isNull(decks.deletedAt))).get()
          ?? db.select().from(decks).where(and(eq(decks.slug, alias), isNull(decks.deletedAt))).get()
        if (direct?.alias)
          return toEntry(direct, historicalFor(direct.slug))

        const historical = db.select().from(deckAliases).where(eq(deckAliases.alias, alias)).get()
        if (!historical)
          return null
        const deck = db.select().from(decks).where(and(eq(decks.slug, historical.deckSlug), isNull(decks.deletedAt))).get()
        return deck?.alias ? toEntry(deck, historicalFor(deck.slug)) : null
      },

      async list() {
        return db.select().from(decks).where(and(isNotNull(decks.alias), isNull(decks.deletedAt))).all().map(row => toEntry(row, historicalFor(row.slug)))
      },
    },

    projects: {
      async list() {
        return db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.order), asc(projects.title)).all().map(row => ({
          slug: row.slug,
          title: row.title,
          order: row.order,
          color: row.color ?? undefined,
          icon: row.icon ?? undefined,
        }))
      },

      async resolve(slug) {
        const row = db.select().from(projects).where(and(eq(projects.slug, slug), isNull(projects.deletedAt))).get()
        return row
          ? { slug: row.slug, title: row.title, order: row.order, color: row.color ?? undefined, icon: row.icon ?? undefined }
          : null
      },
    },
  }
}

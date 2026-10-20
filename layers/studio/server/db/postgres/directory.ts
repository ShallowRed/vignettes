import type { ProjectDirectory } from '#shared/projects'
import type { DeckDirectory, DeckDirectoryEntry } from '@vignettes/core/deck'
import type { PostgresDb } from './index.ts'
import { and, asc, eq, isNotNull, isNull, or } from 'drizzle-orm'
import { deckAliases, decks, projects } from './schema.ts'

type DeckRow = typeof decks.$inferSelect
type ProjectRow = typeof projects.$inferSelect

/**
 * PostgreSQL adapters for the directory ports. A deck participates in the alias
 * directory once it has a canonical alias; historical paths live in
 * `deck_aliases`.
 */
export function createDbDirectory(db: PostgresDb): { decks: DeckDirectory, projects: ProjectDirectory } {
  async function toEntry(row: DeckRow): Promise<DeckDirectoryEntry> {
    const historical = (await db.select({ alias: deckAliases.alias }).from(deckAliases).where(eq(deckAliases.deckSlug, row.slug))).map(r => r.alias)
    return {
      alias: row.alias!,
      slug: row.slug,
      title: row.title,
      lifecycle: row.lifecycle as DeckDirectoryEntry['lifecycle'],
      frozenBundle: row.frozenBundle ?? undefined,
      aliases: historical.length ? historical : undefined,
    }
  }

  function toProject(row: ProjectRow) {
    return { slug: row.slug, title: row.title, order: row.order, color: row.color ?? undefined, icon: row.icon ?? undefined }
  }

  async function liveDeck(slug: string): Promise<DeckRow | undefined> {
    const [row] = await db.select().from(decks).where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
    return row
  }

  return {
    decks: {
      async resolveAlias(alias) {
        // A trashed deck resolves to nothing, so its alias answers 404.
        const matches = await db.select().from(decks).where(and(or(eq(decks.alias, alias), eq(decks.slug, alias)), isNull(decks.deletedAt)))
        const direct = matches.find(row => row.alias === alias) ?? matches.find(row => row.slug === alias)
        if (direct?.alias)
          return toEntry(direct)

        const [historical] = await db.select().from(deckAliases).where(eq(deckAliases.alias, alias))
        if (!historical)
          return null
        const deck = await liveDeck(historical.deckSlug)
        return deck?.alias ? toEntry(deck) : null
      },

      async list() {
        const rows = await db.select().from(decks).where(and(isNotNull(decks.alias), isNull(decks.deletedAt))).orderBy(asc(decks.slug))
        return Promise.all(rows.map(toEntry))
      },
    },

    projects: {
      async list() {
        return (await db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(asc(projects.order), asc(projects.title))).map(toProject)
      },

      async resolve(slug) {
        const [row] = await db.select().from(projects).where(and(eq(projects.slug, slug), isNull(projects.deletedAt)))
        return row ? toProject(row) : null
      },
    },
  }
}

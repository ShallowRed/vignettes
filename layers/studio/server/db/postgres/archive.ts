import type { ContentArchive } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { asc, eq } from 'drizzle-orm'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { recordDeckMedia } from './media-index.ts'
import { deckAliases, decks, deckVersions, projects } from './schema.ts'

/** PostgreSQL adapter for the rows the content scripts exchange. */
export function createContentArchive(db: PostgresDb): ContentArchive {
  return {
    async decks() {
      const rows = await db.select({
        slug: decks.slug,
        title: decks.title,
        status: decks.status,
        lifecycle: decks.lifecycle,
        project: decks.project,
        theme: decks.theme,
        alias: decks.alias,
        frozenBundle: decks.frozenBundle,
        accessPasswordHash: decks.accessPasswordHash,
        unlisted: decks.unlisted,
        family: decks.family,
        variantLabel: decks.variantLabel,
        supersededBy: decks.supersededBy,
        managed: decks.managed,
        deletedAt: decks.deletedAt,
        raw: deckVersions.raw,
      })
        .from(decks)
        .leftJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
        .orderBy(asc(decks.slug))
      return rows.map(({ deletedAt, ...row }) => ({ ...row, trashed: deletedAt !== null }))
    },

    async projects() {
      return db.select({ slug: projects.slug, title: projects.title, order: projects.order, color: projects.color })
        .from(projects)
        .orderBy(asc(projects.order), asc(projects.slug))
    },

    async aliases() {
      return db.select({ alias: deckAliases.alias, slug: deckAliases.deckSlug }).from(deckAliases).orderBy(asc(deckAliases.alias))
    },

    async apply(writes, { by, at }) {
      await db.transaction(async (tx) => {
        for (const write of writes) {
          if (write.kind === 'project') {
            const { slug, ...fields } = write.project
            await tx.insert(projects)
              .values({ slug, ...fields, createdAt: at, updatedAt: at })
              .onConflictDoUpdate({ target: projects.slug, set: { ...fields, updatedAt: at } })
          }
          else if (write.kind === 'deck') {
            const set = { ...write.axes, managed: true, updatedAt: at }
            await tx.insert(decks)
              .values({ slug: write.slug, title: write.axes.title ?? write.slug, createdAt: at, ...set })
              .onConflictDoUpdate({ target: decks.slug, set })
          }
          else if (write.kind === 'version') {
            const [version] = await tx.insert(deckVersions)
              .values({ deckSlug: write.slug, raw: write.raw, publishedBy: by, publishedAt: at })
              .returning({ id: deckVersions.id })
            await tx.update(decks).set({ publishedVersionId: version!.id, updatedAt: at }).where(eq(decks.slug, write.slug))
            await recordDeckMedia(tx, write.slug, referencedImages(write.raw))
          }
          else {
            await tx.insert(deckAliases).values({ alias: write.alias, deckSlug: write.slug }).onConflictDoNothing()
          }
        }
      })
    },
  }
}

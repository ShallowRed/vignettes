import type { DeckContent } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { prepareDeckWrite, resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'
import { and, eq, isNull } from 'drizzle-orm'
import { referencedImages } from '../../../shared/storage/media-refs.ts'
import { recordDeckMedia } from './media-index.ts'
import { decks, deckVersions } from './schema.ts'

/**
 * PostgreSQL adapters for the content ports. `writer.save` publishes, with the
 * rules `../sqlite/content-store.ts` explains.
 */
export function createDbContent(db: PostgresDb): DeckContent {
  return {
    async publishedAt(slug) {
      const [row] = await db.select({ at: deckVersions.publishedAt })
        .from(decks)
        .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
        .where(eq(decks.slug, slug))
      return row?.at ?? null
    },

    source: {
      id: 'db',
      async load(slug) {
        const [row] = await db.select({ raw: deckVersions.raw })
          .from(decks)
          .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
          .where(and(eq(decks.slug, slug), isNull(decks.deletedAt)))
        return row ? { raw: row.raw } : null
      },
    },

    writer: {
      id: 'db',
      isWritable: () => true,
      async save(input) {
        const prepared = prepareDeckWrite(input)
        const meta = splitFrontmatter(prepared.raw).data as Record<string, unknown>
        const now = new Date()

        await db.transaction(async (tx) => {
          // A managed row keeps its access axes; the frontmatter sets them until the first publish.
          const [current] = await tx.select({
            status: decks.status,
            unlisted: decks.unlisted,
            accessPasswordHash: decks.accessPasswordHash,
            project: decks.project,
            managed: decks.managed,
          }).from(decks).where(eq(decks.slug, prepared.slug))

          const accessAxes = current?.managed
            ? {
                status: current.status,
                unlisted: current.unlisted,
                accessPasswordHash: current.accessPasswordHash,
                project: current.project,
              }
            : {
                status: resolveDeckStatus(prepared.raw),
                unlisted: Boolean(meta.unlisted),
                accessPasswordHash: (meta.accessPassword as string) ?? null,
                project: (meta.project as string) ?? null,
              }

          const derived = {
            title: (meta.title as string) || prepared.slug,
            theme: (meta.theme as string) ?? null,
            ...accessAxes,
            managed: true,
            updatedAt: now,
          }
          await tx.insert(decks)
            .values({ slug: prepared.slug, createdAt: now, ...derived })
            .onConflictDoUpdate({ target: decks.slug, set: derived })
          const [version] = await tx.insert(deckVersions)
            .values({
              deckSlug: prepared.slug,
              raw: prepared.raw,
              publishedBy: input.actor ?? 'unknown',
              publishedAt: now,
            })
            .returning({ id: deckVersions.id })
          await tx.update(decks).set({ publishedVersionId: version!.id }).where(eq(decks.slug, prepared.slug))
          await recordDeckMedia(tx, prepared.slug, referencedImages(prepared.raw))
        })

        return { key: `db:${prepared.slug}`, bytes: new TextEncoder().encode(prepared.raw).length }
      },
    },
  }
}

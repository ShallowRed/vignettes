import type { Project } from '#shared/projects'
import type { ProjectStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { freeProjectSlug } from '../slugs.ts'
import { purgeDeckRows } from './deck-meta.ts'
import { decks, projectPermissions, projects } from './schema.ts'

type ProjectRow = typeof projects.$inferSelect

function toProject(row: ProjectRow): Project {
  return { slug: row.slug, title: row.title, order: row.order, color: row.color ?? undefined, icon: row.icon ?? undefined }
}

/**
 * PostgreSQL adapter for the project lifecycle writes. A project owns its decks:
 * trash, restore and purge cascade to `decks` in the same transaction.
 */
export function createProjectStore(db: PostgresDb): ProjectStore {
  return {
    async create({ title, color, icon, slug: wanted }) {
      const now = new Date()
      const row = await db.transaction(async (tx) => {
        // Two creations with one title wait for each other, so they get two slugs.
        await tx.execute(sql`lock table ${projects} in share row exclusive mode`)
        // An explicit slug is caller-validated (shape + uniqueness → 409 upstream).
        // Every row counts, trashed ones included: the slug is the primary key.
        const slug = wanted ?? freeProjectSlug(title, new Set((await tx.select({ slug: projects.slug }).from(projects)).map(r => r.slug)))
        const [max] = await tx.select({ m: sql<number>`coalesce(max(${projects.order}), -1)` }).from(projects)
        const [inserted] = await tx.insert(projects)
          .values({ slug, title: title.trim(), order: Number(max?.m ?? -1) + 1, color: color ?? null, icon: icon ?? null, createdAt: now, updatedAt: now })
          .returning()
        return inserted!
      })
      return toProject(row)
    },

    async slugExists(slug) {
      return (await db.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug))).length > 0
    },

    async isLive(slug) {
      return (await db.select({ slug: projects.slug }).from(projects).where(and(eq(projects.slug, slug), isNull(projects.deletedAt)))).length > 0
    },

    async rename(oldSlug, newSlug) {
      return db.transaction(async (tx) => {
        const [current] = await tx.select().from(projects).where(eq(projects.slug, oldSlug))
        if (!current)
          return null
        // FK-safe order: insert the new row, repoint children, drop the old row.
        const [row] = await tx.insert(projects).values({ ...current, slug: newSlug, updatedAt: new Date() }).returning()
        await tx.update(projectPermissions).set({ projectSlug: newSlug }).where(eq(projectPermissions.projectSlug, oldSlug))
        await tx.update(decks).set({ project: newSlug }).where(eq(decks.project, oldSlug))
        await tx.delete(projects).where(eq(projects.slug, oldSlug))
        return toProject(row!)
      })
    },

    async update(slug, patch) {
      const set: Partial<ProjectRow> = { updatedAt: new Date() }
      if (patch.title !== undefined)
        set.title = patch.title.trim()
      if (patch.color !== undefined)
        set.color = patch.color
      if (patch.icon !== undefined)
        set.icon = patch.icon
      if (patch.order !== undefined)
        set.order = patch.order
      const [row] = await db.update(projects).set(set).where(eq(projects.slug, slug)).returning()
      return row ? toProject(row) : null
    },

    async liveDeckSlugs(slug) {
      return (await db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.project, slug), isNull(decks.deletedAt))).orderBy(asc(decks.slug))).map(r => r.slug)
    },

    async deckSlugs(slug) {
      return (await db.select({ slug: decks.slug }).from(decks).where(eq(decks.project, slug)).orderBy(asc(decks.slug))).map(r => r.slug)
    },

    async softDelete(slug) {
      const now = new Date()
      return db.transaction(async (tx) => {
        const trashed = await tx.update(projects).set({ deletedAt: now }).where(and(eq(projects.slug, slug), isNull(projects.deletedAt))).returning({ slug: projects.slug })
        if (trashed.length === 0)
          return false
        await tx.update(decks).set({ deletedAt: now }).where(and(eq(decks.project, slug), isNull(decks.deletedAt)))
        return true
      })
    },

    async restore(slug) {
      return db.transaction(async (tx) => {
        const restored = await tx.update(projects).set({ deletedAt: null }).where(and(eq(projects.slug, slug), isNotNull(projects.deletedAt))).returning({ slug: projects.slug })
        if (restored.length === 0)
          return false
        await tx.update(decks).set({ deletedAt: null }).where(and(eq(decks.project, slug), isNotNull(decks.deletedAt)))
        return true
      })
    },

    async listTrashed() {
      const rows = await db.select().from(projects).where(isNotNull(projects.deletedAt)).orderBy(asc(projects.order), asc(projects.title))
      return Promise.all(rows.map(async (row) => {
        const [trashed] = await db.select({ c: count() }).from(decks).where(and(eq(decks.project, row.slug), isNotNull(decks.deletedAt)))
        return { ...toProject(row), deletedAt: row.deletedAt!, deckCount: trashed?.c ?? 0 }
      }))
    },

    async purge(slug) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug))
        if (!row)
          return false
        for (const deck of await tx.select({ slug: decks.slug }).from(decks).where(eq(decks.project, slug)))
          await purgeDeckRows(tx, deck.slug)
        await tx.delete(projectPermissions).where(eq(projectPermissions.projectSlug, slug))
        await tx.delete(projects).where(eq(projects.slug, slug))
        return true
      })
    },
  }
}

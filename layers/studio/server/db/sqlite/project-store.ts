import type { Project } from '#shared/projects'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { ProjectStore } from '../ports.ts'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { freeProjectSlug } from '../slugs.ts'
import { purgeDeckRows } from './deck-meta.ts'
import { decks, projectPermissions, projects } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>
type ProjectRow = typeof projects.$inferSelect

function toProject(row: ProjectRow): Project {
  return { slug: row.slug, title: row.title, order: row.order, color: row.color ?? undefined, icon: row.icon ?? undefined }
}

/**
 * Project lifecycle writes (create / rename / trash / restore / purge). The read
 * side stays in `directory.ts` (`ProjectDirectory`, which filters trashed rows).
 * Deleting a project is a soft cascade: the project and its live decks go to the
 * trash together and restore together; purge is the permanent "empty the trash".
 *
 * INVARIANT: a project owns its decks. Trash, restore and purge must each cascade
 * to `decks` in the same transaction, so a folder and its decks are never split
 * across states. A new deck-owned child table has to be added to all three.
 */
export function createProjectStore(db: Db): ProjectStore {
  return {
    async create({ title, color, icon, slug: wanted }) {
      const now = new Date()
      // The free slug and the order are read in the transaction of the insert.
      const row = db.transaction((tx) => {
        // An explicit slug is caller-validated (shape + uniqueness → 409 upstream).
        // Every row counts, trashed ones included: the slug is the primary key.
        const slug = wanted ?? freeProjectSlug(title, candidate => !!tx.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, candidate)).get())
        const max = tx.select({ m: sql<number>`coalesce(max(${projects.order}), -1)` }).from(projects).get()?.m ?? -1
        return tx.insert(projects)
          .values({ slug, title: title.trim(), order: max + 1, color: color ?? null, icon: icon ?? null, createdAt: now, updatedAt: now })
          .returning()
          .get()!
      })
      return toProject(row)
    },

    async slugExists(slug) {
      return !!db.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug)).get()
    },

    async isLive(slug) {
      return !!db.select({ slug: projects.slug }).from(projects).where(and(eq(projects.slug, slug), isNull(projects.deletedAt))).get()
    },

    async rename(oldSlug, newSlug) {
      const current = db.select().from(projects).where(eq(projects.slug, oldSlug)).get()
      if (!current)
        return null
      // FK-safe order: insert the new row, repoint children, drop the old row.
      db.transaction((tx) => {
        tx.insert(projects).values({ ...current, slug: newSlug, updatedAt: new Date() }).run()
        tx.update(projectPermissions).set({ projectSlug: newSlug }).where(eq(projectPermissions.projectSlug, oldSlug)).run()
        tx.update(decks).set({ project: newSlug }).where(eq(decks.project, oldSlug)).run()
        tx.delete(projects).where(eq(projects.slug, oldSlug)).run()
      })
      const row = db.select().from(projects).where(eq(projects.slug, newSlug)).get()
      return row ? toProject(row) : null
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
      const row = db.update(projects).set(set).where(eq(projects.slug, slug)).returning().get()
      return row ? toProject(row) : null
    },

    async liveDeckSlugs(slug) {
      return db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.project, slug), isNull(decks.deletedAt))).all().map(r => r.slug)
    },

    async deckSlugs(slug) {
      return db.select({ slug: decks.slug }).from(decks).where(eq(decks.project, slug)).all().map(r => r.slug)
    },

    async softDelete(slug) {
      const now = new Date()
      return db.transaction((tx) => {
        const res = tx.update(projects).set({ deletedAt: now }).where(and(eq(projects.slug, slug), isNull(projects.deletedAt))).run()
        if (res.changes === 0)
          return false
        tx.update(decks).set({ deletedAt: now }).where(and(eq(decks.project, slug), isNull(decks.deletedAt))).run()
        return true
      })
    },

    async restore(slug) {
      return db.transaction((tx) => {
        const res = tx.update(projects).set({ deletedAt: null }).where(and(eq(projects.slug, slug), isNotNull(projects.deletedAt))).run()
        if (res.changes === 0)
          return false
        tx.update(decks).set({ deletedAt: null }).where(and(eq(decks.project, slug), isNotNull(decks.deletedAt))).run()
        return true
      })
    },

    async listTrashed() {
      return db.select().from(projects).where(isNotNull(projects.deletedAt)).orderBy(asc(projects.order), asc(projects.title)).all().map((row) => {
        const deckCount = db.select({ c: sql<number>`count(*)` }).from(decks).where(and(eq(decks.project, row.slug), isNotNull(decks.deletedAt))).get()?.c ?? 0
        return { ...toProject(row), deletedAt: row.deletedAt!, deckCount }
      })
    },

    async purge(slug) {
      const row = db.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug)).get()
      if (!row)
        return false
      const deckSlugs = db.select({ slug: decks.slug }).from(decks).where(eq(decks.project, slug)).all().map(r => r.slug)
      db.transaction((tx) => {
        for (const deckSlug of deckSlugs)
          purgeDeckRows(tx, deckSlug)
        tx.delete(projectPermissions).where(eq(projectPermissions.projectSlug, slug)).run()
        tx.delete(projects).where(eq(projects.slug, slug)).run()
      })
      return true
    },
  }
}

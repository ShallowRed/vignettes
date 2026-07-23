import type { Project } from '#shared/projects'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { slugifyProject } from '#shared/projects'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { purgeDeckRows } from './deck-meta'
import { decks, projectPermissions, projects } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>
type ProjectRow = typeof projects.$inferSelect

/** A trashed project plus how many of its decks were trashed with it. */
export interface TrashedProject extends Project {
  deletedAt: Date
  deckCount: number
}

function toProject(row: ProjectRow): Project {
  return { slug: row.slug, title: row.title, order: row.order, color: row.color ?? undefined }
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
export function createProjectStore(db: Db) {
  /** First free slug from the title, disambiguated against every row (slug is the PK). */
  function freeSlug(title: string): string {
    const base = slugifyProject(title) || 'projet'
    let slug = base
    let n = 2
    while (db.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug)).get())
      slug = `${base}-${n++}`
    return slug
  }

  return {
    async create({ title, color }: { title: string, color?: string | null }): Promise<Project> {
      const now = new Date()
      const slug = freeSlug(title)
      const max = db.select({ m: sql<number>`coalesce(max(${projects.order}), -1)` }).from(projects).get()?.m ?? -1
      const row = db.insert(projects)
        .values({ slug, title: title.trim(), order: max + 1, color: color ?? null, createdAt: now, updatedAt: now })
        .returning()
        .get()!
      return toProject(row)
    },

    /** True if any project row (trashed included) already owns this slug. */
    async slugExists(slug: string): Promise<boolean> {
      return !!db.select({ slug: projects.slug }).from(projects).where(eq(projects.slug, slug)).get()
    },

    /**
     * Change a project's slug, cascading to its decks (`decks.project`) and grants
     * (`project_permissions`). Assumes `newSlug` is validated and free. FK-safe
     * order: insert the new row, repoint children, drop the old row. Old
     * `/projects/<oldSlug>` links stop resolving (no redirect in this version).
     */
    async rename(oldSlug: string, newSlug: string): Promise<Project | null> {
      const current = db.select().from(projects).where(eq(projects.slug, oldSlug)).get()
      if (!current)
        return null
      db.transaction((tx) => {
        tx.insert(projects).values({ ...current, slug: newSlug, updatedAt: new Date() }).run()
        tx.update(projectPermissions).set({ projectSlug: newSlug }).where(eq(projectPermissions.projectSlug, oldSlug)).run()
        tx.update(decks).set({ project: newSlug }).where(eq(decks.project, oldSlug)).run()
        tx.delete(projects).where(eq(projects.slug, oldSlug)).run()
      })
      const row = db.select().from(projects).where(eq(projects.slug, newSlug)).get()
      return row ? toProject(row) : null
    },

    async update(slug: string, patch: { title?: string, color?: string | null, order?: number }): Promise<Project | null> {
      const set: Partial<ProjectRow> = { updatedAt: new Date() }
      if (patch.title !== undefined)
        set.title = patch.title.trim()
      if (patch.color !== undefined)
        set.color = patch.color
      if (patch.order !== undefined)
        set.order = patch.order
      const row = db.update(projects).set(set).where(eq(projects.slug, slug)).returning().get()
      return row ? toProject(row) : null
    },

    /** Live deck slugs in this project — for guards (e.g. open collab sessions). */
    async liveDeckSlugs(slug: string): Promise<string[]> {
      return db.select({ slug: decks.slug }).from(decks).where(and(eq(decks.project, slug), isNull(decks.deletedAt))).all().map(r => r.slug)
    },

    /** Trash the project and every live deck it holds, in one transaction. */
    async softDelete(slug: string): Promise<boolean> {
      const now = new Date()
      return db.transaction((tx) => {
        const res = tx.update(projects).set({ deletedAt: now }).where(and(eq(projects.slug, slug), isNull(projects.deletedAt))).run()
        if (res.changes === 0)
          return false
        tx.update(decks).set({ deletedAt: now }).where(and(eq(decks.project, slug), isNull(decks.deletedAt))).run()
        return true
      })
    },

    /** Restore the project and every deck currently trashed under it. */
    async restore(slug: string): Promise<boolean> {
      return db.transaction((tx) => {
        const res = tx.update(projects).set({ deletedAt: null }).where(and(eq(projects.slug, slug), isNotNull(projects.deletedAt))).run()
        if (res.changes === 0)
          return false
        tx.update(decks).set({ deletedAt: null }).where(and(eq(decks.project, slug), isNotNull(decks.deletedAt))).run()
        return true
      })
    },

    async listTrashed(): Promise<TrashedProject[]> {
      return db.select().from(projects).where(isNotNull(projects.deletedAt)).orderBy(asc(projects.order), asc(projects.title)).all().map((row) => {
        const deckCount = db.select({ c: sql<number>`count(*)` }).from(decks).where(and(eq(decks.project, row.slug), isNotNull(decks.deletedAt))).get()?.c ?? 0
        return { ...toProject(row), deletedAt: row.deletedAt!, deckCount }
      })
    },

    /** Permanent: hard-delete the project, its grants, and all its decks. */
    async purge(slug: string): Promise<boolean> {
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

import type { DeckGrant } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { DeckGrantSchema } from '#shared/access'
import { and, eq } from 'drizzle-orm'
import { projectPermissions, projects, users } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

export interface ProjectGrantRecord {
  userId: number
  login: string
  role: DeckGrant
  grantedBy: string
  createdAt: Date
}

/** An invalid stored grant degrades to view-only. */
function readGrant(value: string): DeckGrant {
  const parsed = DeckGrantSchema.safeParse(value)
  return parsed.success ? parsed.data : 'viewer'
}

/**
 * SQLite adapter for project-scoped grants — the same shape as the per-deck store,
 * one row per (project, user). Resolution folds these with per-deck grants; see
 * `server/utils/grants.ts`.
 */
export function createProjectPermissionStore(db: Db) {
  return {
    async get(projectSlug: string, userId: number): Promise<DeckGrant | null> {
      const row = db.select().from(projectPermissions).where(and(eq(projectPermissions.projectSlug, projectSlug), eq(projectPermissions.userId, userId))).get()
      return row ? readGrant(row.role) : null
    },

    async listForProject(projectSlug: string): Promise<ProjectGrantRecord[]> {
      return db.select({
        userId: projectPermissions.userId,
        login: users.login,
        role: projectPermissions.role,
        grantedBy: projectPermissions.grantedBy,
        createdAt: projectPermissions.createdAt,
      })
        .from(projectPermissions)
        .innerJoin(users, eq(users.id, projectPermissions.userId))
        .where(eq(projectPermissions.projectSlug, projectSlug))
        .all()
        .map(r => ({ ...r, role: readGrant(r.role) }))
    },

    /** projectSlug → grant, for one-lookup catalog visibility. */
    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const rows = db.select().from(projectPermissions).where(eq(projectPermissions.userId, userId)).all()
      return new Map(rows.map(r => [r.projectSlug, readGrant(r.role)]))
    },

    async set(projectSlug: string, userId: number, role: DeckGrant, grantedBy: string): Promise<void> {
      const now = new Date()
      // FK anchor: a grant may name a project row that only existed in the registry.
      db.insert(projects)
        .values({ slug: projectSlug, title: projectSlug, createdAt: now, updatedAt: now })
        .onConflictDoNothing()
        .run()
      db.insert(projectPermissions)
        .values({ projectSlug, userId, role, grantedBy, createdAt: now })
        .onConflictDoUpdate({
          target: [projectPermissions.projectSlug, projectPermissions.userId],
          set: { role, grantedBy, createdAt: now },
        })
        .run()
    },

    async remove(projectSlug: string, userId: number): Promise<void> {
      db.delete(projectPermissions)
        .where(and(eq(projectPermissions.projectSlug, projectSlug), eq(projectPermissions.userId, userId)))
        .run()
    },
  }
}

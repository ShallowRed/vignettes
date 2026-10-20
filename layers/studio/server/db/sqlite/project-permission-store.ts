import type { DeckGrant } from '#shared/access'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type { GrantRecord, ProjectGrantStore } from '../ports.ts'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { isInvitedPlaceholder } from '../identities.ts'
import { readGrant } from '../stored-values.ts'
import { projectPermissions, projects, users } from './schema.ts'

type Db = BetterSQLite3Database<Record<string, unknown>>

/** An expired grant must not resolve; it stays listed so the owner can extend or drop it. */
const notExpired = (col: typeof projectPermissions.expiresAt) => or(isNull(col), gt(col, new Date()))

/**
 * SQLite adapter for project-scoped grants — the same shape as the per-deck store,
 * one row per (project, user). Resolution folds these with per-deck grants; see
 * `server/utils/grants.ts`.
 */
export function createProjectPermissionStore(db: Db): ProjectGrantStore {
  return {
    async get(projectSlug: string, userId: number): Promise<DeckGrant | null> {
      const row = db.select().from(projectPermissions).where(and(eq(projectPermissions.projectSlug, projectSlug), eq(projectPermissions.userId, userId), notExpired(projectPermissions.expiresAt))).get()
      return row ? readGrant(row.role) : null
    },

    async listForProject(projectSlug: string): Promise<GrantRecord[]> {
      return db.select({
        userId: projectPermissions.userId,
        login: users.login,
        role: projectPermissions.role,
        grantedBy: projectPermissions.grantedBy,
        createdAt: projectPermissions.createdAt,
        expiresAt: projectPermissions.expiresAt,
        providerId: users.providerId,
      })
        .from(projectPermissions)
        .innerJoin(users, eq(users.id, projectPermissions.userId))
        .where(eq(projectPermissions.projectSlug, projectSlug))
        .all()
        .map(({ providerId, ...r }) => ({ ...r, role: readGrant(r.role), invited: isInvitedPlaceholder(providerId) }))
    },

    /** projectSlug → grant, for one-lookup catalog visibility. */
    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const rows = db.select().from(projectPermissions).where(and(eq(projectPermissions.userId, userId), notExpired(projectPermissions.expiresAt))).all()
      return new Map(rows.map(r => [r.projectSlug, readGrant(r.role)]))
    },

    async set(projectSlug: string, userId: number, role: DeckGrant, grantedBy: string, expiresAt: Date | null = null): Promise<void> {
      const now = new Date()
      db.transaction((tx) => {
        // FK anchor: a grant may name a project row that only existed in the registry.
        tx.insert(projects)
          .values({ slug: projectSlug, title: projectSlug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
          .run()
        tx.insert(projectPermissions)
          .values({ projectSlug, userId, role, grantedBy, createdAt: now, expiresAt })
          .onConflictDoUpdate({
            target: [projectPermissions.projectSlug, projectPermissions.userId],
            set: { role, grantedBy, createdAt: now, expiresAt },
          })
          .run()
      })
    },

    async remove(projectSlug: string, userId: number): Promise<void> {
      db.delete(projectPermissions)
        .where(and(eq(projectPermissions.projectSlug, projectSlug), eq(projectPermissions.userId, userId)))
        .run()
    },
  }
}

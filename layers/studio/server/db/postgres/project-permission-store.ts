import type { DeckGrant } from '#shared/access'
import type { GrantRecord, ProjectGrantStore } from '../ports.ts'
import type { PostgresDb } from './index.ts'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { isInvitedPlaceholder } from '../identities.ts'
import { readGrant } from '../stored-values.ts'
import { projectPermissions, projects, users } from './schema.ts'

/** An expired grant must not resolve; it stays listed so the owner can extend or drop it. */
const notExpired = (col: typeof projectPermissions.expiresAt) => or(isNull(col), gt(col, new Date()))

/** PostgreSQL adapter for project-scoped grants, a master key over every deck in the project. */
export function createProjectPermissionStore(db: PostgresDb): ProjectGrantStore {
  return {
    async get(slug: string, userId: number): Promise<DeckGrant | null> {
      const [row] = await db.select().from(projectPermissions).where(and(eq(projectPermissions.projectSlug, slug), eq(projectPermissions.userId, userId), notExpired(projectPermissions.expiresAt)))
      return row ? readGrant(row.role) : null
    },

    async listForProject(slug: string): Promise<GrantRecord[]> {
      const rows = await db.select({
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
        .where(eq(projectPermissions.projectSlug, slug))
        .orderBy(projectPermissions.createdAt, users.login)
      return rows.map(({ providerId, ...r }) => ({ ...r, role: readGrant(r.role), invited: isInvitedPlaceholder(providerId) }))
    },

    async listForUser(userId: number): Promise<Map<string, DeckGrant>> {
      const rows = await db.select().from(projectPermissions).where(and(eq(projectPermissions.userId, userId), notExpired(projectPermissions.expiresAt)))
      return new Map(rows.map(r => [r.projectSlug, readGrant(r.role)]))
    },

    async set(slug: string, userId: number, role: DeckGrant, grantedBy: string, expiresAt: Date | null = null): Promise<void> {
      const now = new Date()
      await db.transaction(async (tx) => {
        // FK anchor: a grant may name a project row that only existed in the registry.
        await tx.insert(projects)
          .values({ slug, title: slug, createdAt: now, updatedAt: now })
          .onConflictDoNothing()
        await tx.insert(projectPermissions)
          .values({ projectSlug: slug, userId, role, grantedBy, createdAt: now, expiresAt })
          .onConflictDoUpdate({
            target: [projectPermissions.projectSlug, projectPermissions.userId],
            set: { role, grantedBy, createdAt: now, expiresAt },
          })
      })
    },

    async remove(slug: string, userId: number): Promise<void> {
      await db.delete(projectPermissions)
        .where(and(eq(projectPermissions.projectSlug, slug), eq(projectPermissions.userId, userId)))
    },
  }
}

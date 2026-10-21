import type { UserStore } from '#shared/access'
import type { PostgresDb } from './index.ts'
import { and, asc, eq, sql } from 'drizzle-orm'
import { handleKey, invitedPlaceholder, isInvitedPlaceholder } from '../identities.ts'
import { readRole } from '../stored-values.ts'
import { deckPermissions, projectPermissions, users } from './schema.ts'

type NewUser = Omit<typeof users.$inferInsert, 'id'>

async function insertUser(db: PostgresDb, values: NewUser): Promise<typeof users.$inferSelect> {
  const [row] = await db.insert(users).values(values).returning()
  return row!
}

/** PostgreSQL adapter for the `UserStore` port. */
export function createUserStore(db: PostgresDb): UserStore {
  /** The account of this provider whose login names the same handle, if any. */
  async function findAccountByHandle(provider: string, login: string) {
    const target = handleKey(provider, login)
    return (await db.select().from(users).where(eq(users.provider, provider))).find(row => handleKey(provider, row.login) === target)
  }

  return {
    async upsertOAuthLogin(identity, bootstrapRole, opts) {
      const now = new Date()
      const [existing] = await db.select({ id: users.id, role: users.role }).from(users).where(and(eq(users.provider, identity.provider), eq(users.providerId, identity.providerId)))
      if (existing) {
        await db.update(users)
          .set({
            login: identity.login,
            name: identity.name ?? null,
            avatarUrl: identity.avatarUrl ?? null,
            lastLoginAt: now,
          })
          .where(eq(users.id, existing.id))
        return { id: existing.id, role: readRole(existing.role) }
      }
      // First login may claim an invited account; `../sqlite/user-store.ts` gives the rules.
      if (opts?.claimInvited) {
        const [placeholder] = await db.select().from(users).where(and(eq(users.provider, identity.provider), eq(users.providerId, invitedPlaceholder(identity.login))))
        const candidate = placeholder ?? await findAccountByHandle(identity.provider, identity.login)
        // Only an unclaimed placeholder may be taken over, a real account never.
        const stub = candidate && isInvitedPlaceholder(candidate.providerId) ? candidate : undefined
        if (stub) {
          await db.update(users)
            .set({
              providerId: identity.providerId,
              login: identity.login,
              name: identity.name ?? null,
              avatarUrl: identity.avatarUrl ?? null,
              lastLoginAt: now,
            })
            .where(eq(users.id, stub.id))
          return { id: stub.id, role: readRole(stub.role) }
        }
      }
      const firstAccount = opts?.firstAccountOwns && (await db.select({ id: users.id }).from(users).limit(1)).length === 0
      const row = await insertUser(db, {
        provider: identity.provider,
        providerId: identity.providerId,
        login: identity.login,
        name: identity.name ?? null,
        avatarUrl: identity.avatarUrl ?? null,
        role: firstAccount ? 'owner' : bootstrapRole,
        createdAt: now,
        lastLoginAt: now,
      })
      return { id: row.id, role: readRole(row.role) }
    },

    async upsertOnLogin(profile, bootstrapRole) {
      const now = new Date()
      const [row] = await db.insert(users)
        .values({
          id: profile.id,
          // As the SQLite 0010 backfill does, so the (provider, provider_id) unique
          // index holds: two synthetic accounts must not share ('github', '').
          provider: 'github',
          providerId: String(profile.id),
          login: profile.login,
          name: profile.name ?? null,
          avatarUrl: profile.avatarUrl ?? null,
          role: bootstrapRole,
          createdAt: now,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            login: profile.login,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            lastLoginAt: now,
          },
        })
        .returning({ role: users.role })
      // An explicit id leaves the identity sequence behind. The sequence moves to
      // the greater of that id and its next value, so it never goes back, and a
      // new id is above every id given, as with the SQLite AUTOINCREMENT.
      const sequence = sql`pg_get_serial_sequence('users', 'id')`
      await db.execute(sql`select setval(${sequence}, greatest(${profile.id}, nextval(${sequence})))`)
      return readRole(row!.role)
    },

    async invite({ provider, handle }) {
      const login = handle.trim().toLowerCase()
      const now = new Date()
      // Find-or-invite: an existing account with this login, or the same handle
      // under another spelling, is returned untouched.
      const [sameLogin] = await db.select().from(users).where(eq(users.login, login))
      const row = sameLogin
        ?? await findAccountByHandle(provider, login)
        ?? await insertUser(db, {
          provider,
          providerId: invitedPlaceholder(login),
          login,
          role: 'viewer',
          createdAt: now,
          lastLoginAt: now,
        })
      return {
        id: row.id,
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: readRole(row.role),
        lastLoginAt: row.lastLoginAt,
        invited: isInvitedPlaceholder(row.providerId),
      }
    },

    async getAccount(id) {
      const [row] = await db.select({ login: users.login, role: users.role, sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, id))
      return row ? { ...row, role: readRole(row.role) } : null
    },

    async endSessions(id) {
      await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id))
    },

    async list() {
      return (await db.select().from(users).orderBy(asc(users.login))).map(row => ({
        id: row.id,
        login: row.login,
        name: row.name,
        avatarUrl: row.avatarUrl,
        role: readRole(row.role),
        lastLoginAt: row.lastLoginAt,
        invited: isInvitedPlaceholder(row.providerId),
      }))
    },

    async setRole(id, role) {
      await db.update(users).set({ role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id))
    },

    async remove(id) {
      return db.transaction(async (tx) => {
        const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, id))
        if (!row)
          return false
        await tx.delete(deckPermissions).where(eq(deckPermissions.userId, id))
        await tx.delete(projectPermissions).where(eq(projectPermissions.userId, id))
        await tx.delete(users).where(eq(users.id, id))
        return true
      })
    },
  }
}

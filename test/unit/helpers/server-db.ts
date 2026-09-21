import type { Role } from '#shared/access'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { deckAliases, deckDrafts, deckDraftSnapshots, deckMedia, deckPermissions, decks, deckVersions, projectPermissions, projects, users } from '../../../layers/studio/server/db/schema'
import { useDb } from '../../../layers/studio/server/utils/db'
import { useUserStore } from '../../../layers/studio/server/utils/users'
import { MIGRATIONS_DIR } from './db'

/**
 * Point the lazy `useDb()` singleton at a throwaway migrated file so server utils
 * that reach for `useDb()` (stores, guards, handlers) run against a real schema.
 * Must run before the first `useDb()` call. Returns a cleanup that removes the
 * temp directory.
 */
export function useMigratedTestDb(): () => void {
  const dir = mkdtempSync(join(tmpdir(), 'slides-test-'))
  const path = join(dir, 'test.db')
  migrate(drizzle(new Database(path)), { migrationsFolder: MIGRATIONS_DIR })
  process.env.NUXT_DB_PATH = path
  return () => rmSync(dir, { recursive: true, force: true })
}

/** Empties every table, children first, so each test starts from a blank schema. */
export function resetTables() {
  const db = useDb()
  for (const table of [deckPermissions, projectPermissions, deckAliases, deckDrafts, deckDraftSnapshots, deckMedia, deckVersions, decks, projects, users])
    db.delete(table).run()
}

/** One migrated temp database for the file, wiped before every test. */
export function setupServerDb() {
  let cleanup: () => void
  beforeAll(() => {
    cleanup = useMigratedTestDb()
  })
  beforeEach(resetTables)
  afterAll(() => cleanup())
}

/**
 * The guards and handlers read identity, cookies, query, params and body through
 * h3/Nitro auto-imports. These stubs read them from the event object a test
 * builds, so a test drives the real code path by describing the request.
 * Call before importing a module that runs `defineEventHandler` at load.
 */
export function stubH3Globals() {
  vi.stubGlobal('defineEventHandler', (handler: any) => handler)
  vi.stubGlobal('defineWebSocketHandler', (handler: any) => handler)
  vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))
  vi.stubGlobal('getUserSession', async (e: any) => e.session ?? null)
  vi.stubGlobal('getCookie', (e: any, name: string) => e.cookies?.[name])
  vi.stubGlobal('getRequestHeader', (e: any, name: string) => e.headers?.[name.toLowerCase()])
  vi.stubGlobal('setCookie', (e: any, name: string, value: string) => {
    ;(e.setCookies ??= {})[name] = value
  })
  vi.stubGlobal('getQuery', (e: any) => e.query ?? {})
  vi.stubGlobal('useRuntimeConfig', (e: any) => e?.runtimeConfig ?? { public: {} })
  vi.stubGlobal('getRouterParam', (e: any, name: string) => e.params?.[name])
  vi.stubGlobal('readBody', async (e: any) => e.body)
  vi.stubGlobal('readMultipartFormData', async (e: any) => e.parts)
  vi.stubGlobal('getRequestIP', (e: any) => e.ip ?? '127.0.0.1')
  vi.stubGlobal('setResponseStatus', (e: any, code: number) => {
    e.status = code
  })
  vi.stubGlobal('setResponseHeader', (e: any, name: string, value: unknown) => {
    e.responseHeaders = { ...e.responseHeaders, [name]: value }
  })
  vi.stubGlobal('setUserSession', async (e: any, session: unknown) => {
    e.sessionSet = session
  })
  vi.stubGlobal('clearUserSession', async (e: any) => {
    e.sessionCleared = true
  })
  vi.stubGlobal('sendRedirect', (e: any, url: string) => {
    e.redirectedTo = url
  })
}

/** An H3-ish event authenticated as the given user (role read from the db). */
export function asUser(id: number, login: string, over: Record<string, unknown> = {}): any {
  return { session: { user: { id, login } }, ...over }
}

/** An anonymous H3-ish event. */
export function anon(over: Record<string, unknown> = {}): any {
  return { ...over }
}

/** An account the way a login creates it (role stored in the db). */
export async function seedAccount(id: number, login: string, role: Exclude<Role, 'anonymous'>) {
  await useUserStore().upsertOnLogin({ id, login }, role)
}

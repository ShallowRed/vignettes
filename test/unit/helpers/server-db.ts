import type { Role } from '#shared/access'
import type { SqliteDb } from '../../../layers/studio/server/db/sqlite/index'
import type { Rows } from './adapters'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, beforeEach, vi } from 'vitest'
import { openSqlite } from '../../../layers/studio/server/db/sqlite/index'
import { closeDatabase, databaseReady } from '../../../layers/studio/server/utils/db'
import { useUserStore } from '../../../layers/studio/server/utils/users'
import { emptySqlite, sqliteRows } from './adapters'

let connection: SqliteDb | undefined

/**
 * Point the server's database at a throwaway migrated file so server utils that
 * reach the stores (guards, handlers) run against a real schema. Returns a
 * cleanup that closes it and removes the temp directory.
 */
export async function useMigratedTestDb(): Promise<() => Promise<void>> {
  const dir = mkdtempSync(join(tmpdir(), 'slides-test-'))
  const path = join(dir, 'test.db')
  process.env.NUXT_DATABASE_DRIVER = 'sqlite'
  process.env.NUXT_DB_PATH = path
  await databaseReady()
  connection = openSqlite(path)
  return async () => {
    await closeDatabase()
    connection?.$client.close()
    connection = undefined
    rmSync(dir, { recursive: true, force: true })
  }
}

function testDb() {
  if (!connection)
    throw new Error('the test database needs setupServerDb() or useMigratedTestDb() first')
  return connection
}

/** The rows of the file the server utils use, through a second connection, for what no store exposes. */
export function testRows(): Rows {
  return sqliteRows(testDb())
}

/** Empties every table, so each test starts from a blank schema. */
export function resetTables() {
  emptySqlite(testDb())
}

/** One migrated temp database for the file, wiped before every test. */
export function setupServerDb() {
  let cleanup: () => Promise<void>
  beforeAll(async () => {
    cleanup = await useMigratedTestDb()
  })
  beforeEach(resetTables)
  afterAll(() => cleanup())
}

/** The directory Nitro mounts as the server assets `base`, read from the studio layer's Nuxt config. */
async function serverAssetDir(base: string): Promise<string> {
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  const { default: studioConfig } = await import('../../../layers/studio/nuxt.config')
  return studioConfig.nitro?.serverAssets?.find(asset => `assets:${asset.baseName}` === base)?.dir ?? ''
}

/**
 * The guards and handlers read identity, cookies, query, params and body through
 * h3/Nitro auto-imports. These stubs read them from the event object a test
 * builds, so a test drives the real code path by describing the request.
 * `useStorage` reads the server assets from their directories.
 * Call before importing a module that runs `defineEventHandler` at load.
 */
export function stubH3Globals() {
  vi.stubGlobal('defineEventHandler', (handler: any) => handler)
  vi.stubGlobal('defineWebSocketHandler', (handler: any) => handler)
  vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))
  // As h3 does, reading the session of a request without a session cookie
  // creates one and sets its cookie.
  vi.stubGlobal('getUserSession', async (e: any) => {
    if (!e.cookies?.['nuxt-session'])
      (e.setCookies ??= {})['nuxt-session'] = 'new-session'
    return e.session ?? {}
  })
  vi.stubGlobal('getCookie', (e: any, name: string) => e.cookies?.[name])
  vi.stubGlobal('deleteCookie', (e: any, name: string) => {
    ;(e.deletedCookies ??= []).push(name)
  })
  vi.stubGlobal('getRequestHeader', (e: any, name: string) => e.headers?.[name.toLowerCase()])
  vi.stubGlobal('setCookie', (e: any, name: string, value: string) => {
    ;(e.setCookies ??= {})[name] = value
  })
  vi.stubGlobal('getQuery', (e: any) => e.query ?? {})
  vi.stubGlobal('assertMethod', (e: any, method: string) => {
    if ((e.method ?? 'GET') !== method)
      throw Object.assign(new Error('Method Not Allowed'), { statusCode: 405 })
  })
  vi.stubGlobal('useRuntimeConfig', (e: any) => e?.runtimeConfig ?? { public: {} })
  vi.stubGlobal('getRouterParam', (e: any, name: string) => e.params?.[name])
  vi.stubGlobal('readBody', async (e: any) => e.body)
  vi.stubGlobal('readMultipartFormData', async (e: any) => e.parts)
  // As h3 does, `xForwardedFor` reads the first value of the header.
  vi.stubGlobal('getRequestIP', (e: any, opts?: { xForwardedFor?: boolean }) =>
    (opts?.xForwardedFor && e.headers?.['x-forwarded-for']?.split(',')[0].trim()) || (e.ip ?? '127.0.0.1'))
  vi.stubGlobal('setResponseStatus', (e: any, code: number) => {
    e.status = code
  })
  vi.stubGlobal('setResponseHeader', (e: any, name: string, value: unknown) => {
    e.responseHeaders = { ...e.responseHeaders, [name]: value }
  })
  vi.stubGlobal('setUserSession', async (e: any, session: unknown) => {
    e.sessionSet = session
    ;(e.setCookies ??= {})['nuxt-session'] = 'resealed-session'
  })
  vi.stubGlobal('replaceUserSession', async (e: any, session: unknown) => {
    e.sessionSet = session
  })
  vi.stubGlobal('clearUserSession', async (e: any) => {
    e.sessionCleared = true
  })
  vi.stubGlobal('useStorage', (base: string) => ({
    getKeys: async () => readdirSync(await serverAssetDir(base)),
    getItem: async (key: string) => {
      const path = join(await serverAssetDir(base), key)
      return existsSync(path) ? readFileSync(path, 'utf8') : null
    },
  }))
  vi.stubGlobal('sendRedirect', (e: any, url: string) => {
    e.redirectedTo = url
  })
}

/** An H3-ish event authenticated as the given user (role read from the db), in a session resealed just now. */
export function asUser(id: number, login: string, over: Record<string, any> = {}): any {
  return { session: { user: { id, login }, activeAt: Date.now() }, ...over, cookies: { 'nuxt-session': 'sealed', ...over.cookies } }
}

/** An anonymous H3-ish event. */
export function anon(over: Record<string, unknown> = {}): any {
  return { ...over }
}

/** An account the way a login creates it (role stored in the db). */
export async function seedAccount(id: number, login: string, role: Exclude<Role, 'anonymous'>) {
  await useUserStore().upsertOnLogin({ id, login }, role)
}

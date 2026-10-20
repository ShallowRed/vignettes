import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeDatabase, readDatabaseConfig } from '../../layers/studio/server/db/config'
import { instanceFromEnv } from '../../scripts/lib/instance'

describe('readDatabaseConfig', () => {
  it('opens PGlite in .data/pglite by default, or in NUXT_PGLITE_DIR', () => {
    expect(readDatabaseConfig({})).toEqual({ driver: 'pglite', dir: '.data/pglite' })
    expect(readDatabaseConfig({ NUXT_PGLITE_DIR: '/tmp/db' })).toEqual({ driver: 'pglite', dir: '/tmp/db' })
  })

  it('opens the PostgreSQL server of NUXT_DATABASE_URL', () => {
    expect(readDatabaseConfig({ NUXT_DATABASE_URL: 'postgres://u:p@db:5432/app' })).toEqual({ driver: 'postgres', url: 'postgres://u:p@db:5432/app' })
  })

  // run-app.sh exports NUXT_DATABASE_DRIVER=sqlite when no URL is set: the image keeps its SQLite file.
  it('keeps the SQLite file with NUXT_DATABASE_DRIVER=sqlite, whatever the other settings', () => {
    expect(readDatabaseConfig({ NUXT_DATABASE_DRIVER: 'sqlite', NUXT_DB_PATH: '/app/.data/slides.db' })).toEqual({ driver: 'sqlite', path: '/app/.data/slides.db' })
    expect(readDatabaseConfig({ NUXT_DATABASE_DRIVER: 'sqlite', NUXT_DATABASE_URL: 'postgres://db/app' })).toEqual({ driver: 'sqlite', path: '.data/slides.db' })
  })

  it('refuses another driver name', () => {
    expect(() => readDatabaseConfig({ NUXT_DATABASE_DRIVER: 'postgres' })).toThrow(/accepts "sqlite"/)
  })
})

describe('describeDatabase', () => {
  it('names the database, a server URL without its password', () => {
    expect(describeDatabase({ driver: 'postgres', url: 'postgres://user:secret@db.example:5432/app?sslmode=require' })).toBe('PostgreSQL db.example:5432/app')
    expect(describeDatabase({ driver: 'pglite', dir: '.data/pglite' })).toBe('PGlite .data/pglite')
    expect(describeDatabase({ driver: 'sqlite', path: '.data/slides.db' })).toBe('SQLite .data/slides.db')
  })
})

describe('instanceFromEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the production or the staging address, and the content token', () => {
    const env = { VIGNETTES_REMOTE: 'https://slides.example/', VIGNETTES_STAGING_REMOTE: 'https://staging.example', NUXT_CONTENT_TOKEN: ' token ' }
    expect(instanceFromEnv(false, env)).toEqual({ url: 'https://slides.example', token: 'token' })
    expect(instanceFromEnv(true, env)).toEqual({ url: 'https://staging.example', token: 'token' })
  })

  it('stops the script when the address or the token is missing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`)
    }) as never)
    expect(() => instanceFromEnv(true, { VIGNETTES_REMOTE: 'https://slides.example', NUXT_CONTENT_TOKEN: 'token' })).toThrow('exit 2')
    expect(() => instanceFromEnv(false, { VIGNETTES_REMOTE: 'https://slides.example' })).toThrow('exit 2')
    expect(exit).toHaveBeenCalledTimes(2)
  })
})

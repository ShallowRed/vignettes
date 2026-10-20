/**
 * Which database the server and the scripts open: a PostgreSQL server when
 * `NUXT_DATABASE_URL` names one, PGlite in a local directory otherwise, and the
 * SQLite file when `NUXT_DATABASE_DRIVER=sqlite`.
 */
export type DatabaseConfig
  = | { driver: 'postgres', url: string }
    | { driver: 'pglite', dir: string }
    | { driver: 'sqlite', path: string }

/** The SQLite file of a checkout that has not set `NUXT_DB_PATH`. */
export const DEFAULT_SQLITE_PATH = '.data/slides.db'

/** The database settings, read from the environment the caller passes. */
export function readDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  const driver = env.NUXT_DATABASE_DRIVER?.trim()
  if (driver === 'sqlite')
    return { driver, path: env.NUXT_DB_PATH || DEFAULT_SQLITE_PATH }
  if (driver)
    throw new Error(`NUXT_DATABASE_DRIVER accepts "sqlite" or no value, not "${driver}".`)
  if (env.NUXT_DATABASE_URL)
    return { driver: 'postgres', url: env.NUXT_DATABASE_URL }
  return { driver: 'pglite', dir: env.NUXT_PGLITE_DIR || '.data/pglite' }
}

/** The environment that names this database, for a process the caller starts. */
export function databaseEnv(config: DatabaseConfig): Record<string, string> {
  if (config.driver === 'sqlite')
    return { NUXT_DATABASE_DRIVER: 'sqlite', NUXT_DB_PATH: config.path }
  if (config.driver === 'pglite')
    return { NUXT_DATABASE_DRIVER: '', NUXT_DATABASE_URL: '', NUXT_PGLITE_DIR: config.dir }
  return { NUXT_DATABASE_DRIVER: '', NUXT_DATABASE_URL: config.url }
}

/** Where the database is, for a message: the URL without its password. */
export function describeDatabase(config: DatabaseConfig): string {
  if (config.driver === 'sqlite')
    return `SQLite ${config.path}`
  if (config.driver === 'pglite')
    return `PGlite ${config.dir}`
  const url = new URL(config.url)
  url.password = ''
  return `PostgreSQL ${url.host}${url.pathname}`
}

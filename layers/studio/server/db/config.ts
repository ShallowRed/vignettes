/** Where the database lives. */
export interface DatabaseConfig {
  dbPath: string
}

/** The database settings, read from the environment the caller passes. */
export function readDatabaseConfig(env: Record<string, string | undefined>): DatabaseConfig {
  return { dbPath: env.NUXT_DB_PATH || '.data/slides.db' }
}

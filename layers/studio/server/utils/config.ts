import type { RoleMap } from '#shared/access'
import type { FrozenS3Config } from '#shared/storage/frozen-s3'
import type { DatabaseConfig } from '../db/config'
import process from 'node:process'
import { readRoleMap } from '#shared/access'
import { frozenS3ConfigFromEnv } from '#shared/storage/frozen-s3'
import { readDatabaseConfig } from '../db/config'

/**
 * The server's configuration: the one module of `server/` that reads
 * `process.env`. It reads at each call, since `infisical run` injects the values
 * when the process starts and the tests change them between cases; the
 * `NUXT_FROZEN_S3_*` names do not fit Nuxt's runtime override (see
 * `runtimeConfig` in nuxt.config.ts).
 */
export interface ServerConfig {
  database: DatabaseConfig
  sessionPassword?: string
  contentDir?: string
  contentToken?: string
  recetteEnabled: boolean
  /** Cookies carry `Secure` in production builds. */
  secureCookies: boolean
  roleMap: RoleMap
  frozenS3: FrozenS3Config
}

export function serverConfig(): ServerConfig {
  const env = process.env
  return {
    sessionPassword: env.NUXT_SESSION_PASSWORD,
    database: readDatabaseConfig(env),
    contentDir: env.NUXT_CONTENT_DIR,
    contentToken: env.NUXT_CONTENT_TOKEN?.trim() || undefined,
    recetteEnabled: env.NUXT_RECETTE_ENABLED === '1',
    // Written out so the build replaces it, as Nitro does for `process.env.NODE_ENV`.
    secureCookies: process.env.NODE_ENV === 'production',
    roleMap: readRoleMap(env),
    frozenS3: frozenS3ConfigFromEnv(env),
  }
}

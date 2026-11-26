import type { RoleMap } from '#shared/access'
import type { FrozenS3Config } from '#shared/storage/frozen-s3'
import type { BundleConfig } from '@vignettes/freeze/bundle'
import type { SessionConfig } from 'h3'
import type { DatabaseConfig } from '../db/config'
import process from 'node:process'
import { readRoleMap } from '#shared/access'
import { frozenS3ConfigFromEnv, isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { measuresAudience } from '#shared/telemetry/umami'
import { readBundleConfig } from '@vignettes/freeze/bundle'
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
  /** The number of proxies in front of the server that append to `X-Forwarded-For` (see `clientAddress`). */
  trustedProxyHops: number
  /** The build of a frozen bundle, which serves one deck. */
  bundle: BundleConfig
  origins: Origins
  /** The origins of the telemetry services this instance sends to. */
  telemetryOrigins: string[]
}

/**
 * The origins of an instance that serves its decks apart from the studio, so
 * that a script of a deck page never runs with a session of the studio. Without
 * `decks`, and in a frozen bundle, one origin serves everything. A value that is
 * not an address reads `null`.
 */
export interface Origins {
  studio?: string | null
  decks?: string | null
}

function originOf(value: string | undefined): string | null | undefined {
  if (!value?.trim())
    return undefined
  try {
    return new URL(value.trim()).origin
  }
  catch {
    return null
  }
}

export function readOrigins(env: Record<string, string | undefined>, bundle: Pick<BundleConfig, 'enabled'>): Origins {
  if (bundle.enabled)
    return {}
  return { studio: originOf(env.NUXT_STUDIO_URL), decks: originOf(env.NUXT_PUBLIC_DECKS_URL) }
}

/**
 * The origins of Umami, when the instance measures its audience, and of the
 * error tracker, from their address and their DSN. A value that is no https
 * address is left out: an error in a telemetry value never stops the server.
 */
export function readTelemetryOrigins(env: Record<string, string | undefined>): string[] {
  const umami = { host: env.NUXT_PUBLIC_UMAMI_HOST ?? '', studioWebsiteId: env.NUXT_PUBLIC_UMAMI_STUDIO_WEBSITE_ID ?? '', decksWebsiteId: env.NUXT_PUBLIC_UMAMI_DECKS_WEBSITE_ID ?? '' }
  const origins = [measuresAudience(umami) ? umami.host : undefined, env.NUXT_PUBLIC_ERROR_TRACKING_DSN].flatMap((value) => {
    const origin = originOf(value)
    return origin?.startsWith('https://') ? [origin] : []
  })
  return [...new Set(origins)]
}

export function serverConfig(): ServerConfig {
  const env = process.env
  const bundle = readBundleConfig(env)
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
    trustedProxyHops: /^\d+$/.test(env.NUXT_TRUSTED_PROXY_HOPS ?? '') ? Number(env.NUXT_TRUSTED_PROXY_HOPS) : 0,
    bundle,
    origins: readOrigins(env, bundle),
    telemetryOrigins: readTelemetryOrigins(env),
  }
}

/** The session of the studio, as nuxt-auth-utils passes it to h3 `useSession`. */
export interface SessionSettings {
  /** The name of the session cookie. */
  name: string
  password?: string
  /** Seconds from the login after which the session ends, whatever its use. */
  maxAge?: number
  /** The iron options of a seal; `ttl`, in milliseconds, ends a session that no request reseals for that long. */
  seal?: SessionConfig['seal']
}

/**
 * The settings of `runtimeConfig.session` (nuxt.config.ts), read by every server
 * module that names the session cookie or follows the lifetimes of a session.
 * The password falls back to the env var, which runtimeConfig only merges at
 * the first `getUserSession` call.
 */
export function sessionSettings(): SessionSettings {
  const session = useRuntimeConfig().session as Partial<SessionConfig> | undefined
  return {
    name: session?.name || 'nuxt-session',
    password: session?.password || serverConfig().sessionPassword,
    maxAge: session?.maxAge,
    seal: session?.seal,
  }
}

/**
 * Why a production server refuses to start on this configuration, or nothing.
 * A PostgreSQL server keeps the rows outside the container. Without the bucket,
 * the server writes the uploaded media to the container's disk and reads the
 * published themes from it, and a platform such as Scalingo empties that disk at
 * each restart. The deck origin needs the studio origin, where it sends every
 * other route.
 */
export function productionConfigProblem(config: Pick<ServerConfig, 'database' | 'frozenS3' | 'origins'>): string | undefined {
  if (config.database.driver === 'postgres' && !isFrozenS3Configured(config.frozenS3))
    return 'NUXT_DATABASE_URL names a PostgreSQL server, and the bucket is not configured: set NUXT_FROZEN_S3_BUCKET, NUXT_FROZEN_S3_ACCESS_KEY_ID and NUXT_FROZEN_S3_SECRET_ACCESS_KEY.'
  const { studio, decks } = config.origins
  if (decks === null || studio === null)
    return 'NUXT_PUBLIC_DECKS_URL and NUXT_STUDIO_URL are addresses, such as https://decks.example.org.'
  if (decks && (!studio || studio === decks))
    return 'NUXT_PUBLIC_DECKS_URL serves the decks apart from the studio: set NUXT_STUDIO_URL to the address of the studio, another origin.'
}

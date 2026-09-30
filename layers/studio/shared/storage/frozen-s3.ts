// Configuration and object keys of the bucket hosting frozen deck bundles. Pure,
// so the server and the standalone upload scripts both use it; the client itself
// is built in server/utils/frozen-s3-client.ts.

export interface FrozenS3Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export function isFrozenS3Configured(c: Partial<FrozenS3Config> | undefined): c is FrozenS3Config {
  return Boolean(c?.endpoint && c.region && c.bucket && c.accessKeyId && c.secretAccessKey)
}

/** Object key for a frozen asset: `frozen/<alias>/<...parts>`. */
export function frozenObjectKey(alias: string, ...parts: string[]): string {
  return ['frozen', alias, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

/**
 * The bucket configuration as the runtime receives it. Read from `process.env`
 * at call time, not from `useRuntimeConfig`: the `NUXT_FROZEN_S3_*` names do not
 * follow Nuxt's override convention and `infisical run` injects them at start.
 * The bucket name and the credentials have no default: without them
 * `isFrozenS3Configured` is false and the files are read from disk.
 */
export function frozenS3ConfigFromEnv(env: Record<string, string | undefined>): FrozenS3Config {
  return {
    endpoint: env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: env.NUXT_FROZEN_S3_BUCKET || '',
    accessKeyId: env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }
}

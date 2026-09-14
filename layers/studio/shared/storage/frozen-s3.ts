// Provider-agnostic S3 client factory for the bucket hosting frozen deck bundles.
// Free of Nuxt/Nitro imports so the server and the standalone upload script both use it.
import { S3Client } from '@aws-sdk/client-s3'

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

export function makeFrozenS3Client(c: FrozenS3Config): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  })
}

/** Object key for a frozen asset: `frozen/<alias>/<...parts>`. */
export function frozenObjectKey(alias: string, ...parts: string[]): string {
  return ['frozen', alias, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

/**
 * The bucket configuration as the runtime receives it. Read from `process.env`
 * at call time, not from `useRuntimeConfig`: the `NUXT_FROZEN_S3_*` names do not
 * follow Nuxt's override convention and `infisical run` injects them at start.
 */
export function frozenS3ConfigFromEnv(env: Record<string, string | undefined>): FrozenS3Config {
  return {
    endpoint: env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: env.NUXT_FROZEN_S3_BUCKET || 'vignettes-bucket',
    accessKeyId: env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }
}

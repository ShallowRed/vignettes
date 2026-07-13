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

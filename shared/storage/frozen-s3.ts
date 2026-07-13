/**
 * frozen-s3.ts — pure factory for the Scaleway Object Storage (S3-compatible)
 * client that hosts frozen deck bundles (DDR-018 storage migration).
 *
 * Frozen bundles used to be committed under `.frozen/` and baked into the Docker
 * image. They now live in an S3-compatible bucket (Scaleway, region fr-par) so
 * the repo stays lean and can go public without exposing private freezes.
 *
 * This module is provider-agnostic: the same code targets Scaleway, Cloudflare
 * R2 or AWS S3 — only the endpoint/region/credentials change. Keep it free of
 * Nuxt/Nitro imports so both the server (runtimeConfig) and the standalone
 * upload script (process.env) can use it.
 */
import { S3Client } from '@aws-sdk/client-s3'

export interface FrozenS3Config {
  /** e.g. https://s3.fr-par.scw.cloud (Scaleway Paris). */
  endpoint: string
  /** e.g. fr-par. */
  region: string
  /** e.g. nuxt-slides-bucket. */
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

/** True when credentials are present — serving/upload can target the bucket. */
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

/** Object key for a frozen asset: `frozen/<alias>/<...parts>` (mirrors /frozen/<alias>/ URLs). */
export function frozenObjectKey(alias: string, ...parts: string[]): string {
  return ['frozen', alias, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

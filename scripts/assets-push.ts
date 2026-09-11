#!/usr/bin/env node
/**
 * Mirror the deck assets of the content space (`<content>/assets/<prefix>/...`)
 * to the bucket (`assets/<prefix>/...`) the deployed application serves them
 * from at `/<prefix>/...`. Unchanged files (same MD5 as the stored ETag) are
 * skipped, so a run after a small change uploads that change only.
 *
 * Usage: node scripts/assets-push.ts [--apply]
 * Dry run by default; the bucket credentials come from the environment
 * (`infisical run --env=prod -- ...`).
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import process from 'node:process'
import { ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { DECK_ASSET_PREFIXES, deckAssetKey } from '../shared/storage/deck-assets.ts'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '../shared/storage/frozen-s3.ts'
import { CONTENT_TYPES } from '../shared/storage/themes-s3.ts'
import { contentDir } from './lib/theme-registry.ts'

const root = join(import.meta.dirname, '..')
const apply = process.argv.includes('--apply')
const assetsDir = join(contentDir(root), 'assets')

if (!existsSync(assetsDir)) {
  console.error(`✗ ${relative(root, assetsDir)} does not exist`)
  process.exit(1)
}
const cfg = frozenS3ConfigFromEnv(process.env)
if (!isFrozenS3Configured(cfg)) {
  console.error('✗ bucket credentials missing: run through `infisical run --env=prod -- ...`')
  process.exit(1)
}
const s3 = makeFrozenS3Client(cfg)

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store')
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      yield* walk(full)
    else yield full
  }
}

async function storedEtags(): Promise<Map<string, string>> {
  const etags = new Map<string, string>()
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: 'assets/', ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (object.Key && object.ETag)
        etags.set(object.Key, object.ETag.replace(/"/g, ''))
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return etags
}

const stored = await storedEtags()
let uploaded = 0
let skipped = 0
let bytes = 0
for (const prefix of DECK_ASSET_PREFIXES) {
  const dir = join(assetsDir, prefix)
  if (!existsSync(dir))
    continue
  for (const file of walk(dir)) {
    const key = deckAssetKey(prefix, ...relative(dir, file).split('/'))
    const body = readFileSync(file)
    const md5 = createHash('md5').update(body).digest('hex')
    if (stored.get(key) === md5) {
      skipped++
      continue
    }
    console.log(`  ${apply ? '↑' : '·'} ${key} (${body.byteLength} bytes)`)
    if (apply) {
      await s3.send(new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: body,
        ContentType: CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        CacheControl: 'public, max-age=300',
      }))
    }
    uploaded++
    bytes += body.byteLength
  }
}
console.log(`\n${uploaded} file(s) ${apply ? 'uploaded' : 'to upload'} (${(bytes / 1024 / 1024).toFixed(1)} MB), ${skipped} unchanged${apply ? '' : '; add --apply to upload'}`)

/**
 * upload-frozen.js — push a frozen deck bundle to the Scaleway bucket.
 *
 * Additive to the freeze pipeline: `make host-frozen` still writes the bundle to
 * `.frozen/<alias>/` locally (dev + provenance); this script mirrors that folder
 * to `s3://<bucket>/frozen/<alias>/` so the deployed app can serve it from object
 * storage instead of a git-committed copy (DDR-018 storage migration).
 *
 * Config comes from the environment (injected by direnv/Infisical — never a repo
 * file). Non-secret defaults target Scaleway Paris:
 *   NUXT_FROZEN_S3_ENDPOINT       (default https://s3.fr-par.scw.cloud)
 *   NUXT_FROZEN_S3_REGION         (default fr-par)
 *   NUXT_FROZEN_S3_BUCKET         (default nuxt-slides-bucket)
 *   NUXT_FROZEN_S3_ACCESS_KEY_ID  (secret — Infisical)
 *   NUXT_FROZEN_S3_SECRET_ACCESS_KEY (secret — Infisical)
 *
 * Usage:
 *   node scripts/upload-frozen.js <alias> [--dir <path>] [--dry-run]
 *   node scripts/upload-frozen.js conference-talk --dry-run
 */
import { createReadStream, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep, extname } from 'node:path'
import process from 'node:process'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import {
  frozenObjectKey,
  isFrozenS3Configured,
  makeFrozenS3Client,
} from '../shared/storage/frozen-s3.ts'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
}

function parseArgs(argv) {
  const args = { alias: undefined, dir: undefined, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--dir') args.dir = argv[++i]
    else if (!a.startsWith('--') && !args.alias) args.alias = a
  }
  return args
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

async function main() {
  const { alias, dir: dirArg, dryRun } = parseArgs(process.argv.slice(2))
  if (!alias) {
    console.error('Usage: node scripts/upload-frozen.js <alias> [--dir <path>] [--dry-run]')
    process.exit(2)
  }
  const dir = dirArg ?? join('.frozen', alias)
  try {
    if (!statSync(dir).isDirectory()) throw new Error('not a directory')
  } catch {
    console.error(`❌ Frozen bundle dir not found: ${dir} (run 'make freeze ALIAS=${alias}' first?)`)
    process.exit(1)
  }

  const config = {
    endpoint: process.env.NUXT_FROZEN_S3_ENDPOINT || 'https://s3.fr-par.scw.cloud',
    region: process.env.NUXT_FROZEN_S3_REGION || 'fr-par',
    bucket: process.env.NUXT_FROZEN_S3_BUCKET || 'nuxt-slides-bucket',
    accessKeyId: process.env.NUXT_FROZEN_S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.NUXT_FROZEN_S3_SECRET_ACCESS_KEY || '',
  }

  const files = []
  for await (const f of walk(dir)) files.push(f)
  const totalBytes = files.reduce((n, f) => n + statSync(f).size, 0)
  console.log(
    `▶  ${alias}: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB → ` +
      `s3://${config.bucket}/${frozenObjectKey(alias)}/`,
  )

  if (dryRun) {
    for (const f of files) {
      console.log(`   [dry] ${frozenObjectKey(alias, relative(dir, f).split(sep).join('/'))}`)
    }
    console.log('✅ dry-run: nothing uploaded.')
    return
  }

  if (!isFrozenS3Configured(config)) {
    console.error(
      '❌ Missing S3 credentials. Set NUXT_FROZEN_S3_ACCESS_KEY_ID / ' +
        'NUXT_FROZEN_S3_SECRET_ACCESS_KEY (via Infisical/direnv).',
    )
    process.exit(1)
  }

  const s3 = makeFrozenS3Client(config)
  let done = 0
  for (const f of files) {
    const rel = relative(dir, f).split(sep).join('/')
    const key = frozenObjectKey(alias, rel)
    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: createReadStream(f),
        ContentLength: statSync(f).size,
        ContentType: CONTENT_TYPES[extname(f).toLowerCase()] || 'application/octet-stream',
      }),
    )
    done++
    if (done % 25 === 0 || done === files.length) console.log(`   ${done}/${files.length}`)
  }
  console.log(`✅ Uploaded ${done} objects to s3://${config.bucket}/${frozenObjectKey(alias)}/`)
}

main().catch((err) => {
  console.error('❌ upload-frozen failed:', err?.message || err)
  process.exit(1)
})

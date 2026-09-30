/**
 * Mirrors a local frozen deck bundle (.frozen/<alias>/) to s3://<bucket>/frozen/
 * <alias>/ so the deployed app can serve it from object storage. Config comes from
 * the environment (direnv/Infisical, never a repo file); S3 keys are secrets.
 *
 * Usage: node scripts/upload-frozen.js <alias> [--dir <path>] [--dry-run]
 */
import { createReadStream, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import process from 'node:process'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { makeFrozenS3Client } from '../layers/studio/server/utils/frozen-s3-client.ts'
import { contentTypeOf } from '../layers/studio/shared/storage/content-types.ts'
import {
  frozenObjectKey,
  frozenS3ConfigFromEnv,
  isFrozenS3Configured,
} from '../layers/studio/shared/storage/frozen-s3.ts'

function parseArgs(argv) {
  const args = { alias: undefined, dir: undefined, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run')
      args.dryRun = true
    else if (a === '--dir')
      args.dir = argv[++i]
    else if (!a.startsWith('--') && !args.alias)
      args.alias = a
  }
  return args
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store')
      continue
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      yield* walk(full)
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
    if (!statSync(dir).isDirectory())
      throw new Error('not a directory')
  }
  catch {
    console.error(`❌ Frozen bundle dir not found: ${dir} (run 'make freeze ALIAS=${alias}' first?)`)
    process.exit(1)
  }

  const config = frozenS3ConfigFromEnv(process.env)

  const files = []
  for await (const f of walk(dir)) files.push(f)
  const totalBytes = files.reduce((n, f) => n + statSync(f).size, 0)
  console.log(
    `▶  ${alias}: ${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB → `
    + `s3://${config.bucket}/${frozenObjectKey(alias)}/`,
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
      '❌ Missing S3 configuration. Set NUXT_FROZEN_S3_BUCKET, NUXT_FROZEN_S3_ACCESS_KEY_ID '
      + 'and NUXT_FROZEN_S3_SECRET_ACCESS_KEY (via Infisical/direnv).',
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
        ContentType: contentTypeOf(f),
      }),
    )
    done++
    if (done % 25 === 0 || done === files.length)
      console.log(`   ${done}/${files.length}`)
  }
  console.log(`✅ Uploaded ${done} objects to s3://${config.bucket}/${frozenObjectKey(alias)}/`)
}

main().catch((err) => {
  console.error('❌ upload-frozen failed:', err?.message || err)
  process.exit(1)
})

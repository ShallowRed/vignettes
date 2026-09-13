#!/usr/bin/env node
/**
 * Publish tenant themes to the bucket the deployed application serves them from.
 * Compiles each theme locally (CSS and assets), uploads them under
 * `themes/<name>/`, writes the theme's `tokens.json`, then rebuilds
 * `themes/index.json` from every published theme so the server picks the whole
 * set up at its next load (a minute, or `POST /api/admin/themes/reload`).
 *
 * Usage: node scripts/theme-push.ts <name>[,<name>] [--apply]
 * Dry run by default; the bucket credentials come from the environment
 * (`infisical run --env=prod -- ...`).
 */
import type { PublishedTheme } from '../layers/studio/shared/storage/themes-s3.ts'
import { Buffer } from 'node:buffer'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '../layers/studio/shared/storage/frozen-s3.ts'
import { CONTENT_TYPES, indexOf, themeObjectKey, THEMES_INDEX_KEY, tokensKeyOf } from '../layers/studio/shared/storage/themes-s3.ts'
import { compileTheme } from '@vignettes/nuxt/build/theme-build'
import { checkExtends, discoverThemes, manifestTokens } from '@vignettes/nuxt/build/theme-registry'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const names = (args.find(a => !a.startsWith('-')) ?? '').split(',').map(s => s.trim()).filter(Boolean)

if (names.length === 0) {
  console.error('Usage: node scripts/theme-push.ts <name>[,<name>] [--apply]')
  process.exit(2)
}

const all = discoverThemes(root)
for (const warning of checkExtends(all))
  console.warn(`⚠ ${warning}`)
const themes = names.map((name) => {
  const theme = all.find(t => t.name === name)
  if (!theme)
    throw new Error(`theme "${name}" not found (known: ${all.map(t => t.name).join(', ')})`)
  if (theme.source !== 'content')
    throw new Error(`theme "${name}" belongs to the application; it ships with the image, not the bucket`)
  return theme
})

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

async function put(key: string, body: Buffer | string, contentType: string) {
  const size = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
  console.log(`  ${apply ? '↑' : '·'} ${key} (${size} bytes)`)
  if (apply)
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=300' }))
}

async function readPublished(): Promise<PublishedTheme[]> {
  const published: PublishedTheme[] = []
  let token: string | undefined
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: 'themes/', ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (!object.Key || !/^themes\/[^/]+\/tokens\.json$/.test(object.Key))
        continue
      const res = await s3.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: object.Key }))
      published.push(JSON.parse(await res.Body!.transformToString()) as PublishedTheme)
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return published
}

const out = mkdtempSync(join(tmpdir(), 'theme-push-'))
try {
  const publishedNow: PublishedTheme[] = []
  for (const theme of themes) {
    console.log(`\n${theme.name} (${relative(root, theme.dir)})`)
    if (!compileTheme(root, theme, out))
      process.exit(1)
    const css = readFileSync(join(out, `${theme.name}.css`))
    await put(themeObjectKey(`${theme.name}.css`), css, CONTENT_TYPES['.css'])
    const assetsDir = join(out, theme.name)
    if (statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()) {
      for (const file of walk(assetsDir)) {
        const rel = relative(assetsDir, file).split('/')
        await put(themeObjectKey(theme.name, ...rel), readFileSync(file), CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream')
      }
    }
    const entry: PublishedTheme = {
      tokens: manifestTokens(theme.manifest),
      aliases: theme.manifest.aliases ?? [],
      publishedAt: new Date().toISOString(),
    }
    await put(tokensKeyOf(theme.name), JSON.stringify(entry, null, 2), CONTENT_TYPES['.json'])
    publishedNow.push(entry)
  }

  const previous = (await readPublished()).filter(p => !publishedNow.some(n => n.tokens.name === p.tokens.name))
  const index = indexOf([...previous, ...publishedNow])
  console.log(`\nindex: ${Object.keys(index.tokens).join(', ')}${Object.keys(index.aliases).length ? ` (aliases ${JSON.stringify(index.aliases)})` : ''}`)
  await put(THEMES_INDEX_KEY, JSON.stringify(index, null, 2), CONTENT_TYPES['.json'])
  console.log(apply ? '\n✓ published' : '\n(dry run; add --apply to upload)')
}
finally {
  rmSync(out, { recursive: true, force: true })
}

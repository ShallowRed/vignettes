#!/usr/bin/env node
/**
 * Publish tenant themes where the deployed application serves them from.
 * Compiles each theme locally (CSS and assets), writes them under
 * `themes/<name>/` with the theme's `tokens.json`, then rebuilds
 * `themes/index.json` from every published theme so the server picks the whole
 * set up at its next load (a minute, or `POST /api/admin/themes/reload`).
 *
 * The destination is the bucket when its credentials are in the environment
 * (`infisical run --env=prod -- ...`), and the local `.themes/` directory
 * otherwise, which is what an instance running without object storage serves.
 *
 * Usage: node scripts/theme-push.ts <name>[,<name>] [--apply]
 * Dry run by default.
 */
import type { PublishedTheme } from '../layers/studio/shared/storage/themes-s3.ts'
import { Buffer } from 'node:buffer'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'
import { compileTheme } from '@vignettes/nuxt/build/theme-build'
import { checkExtends, discoverThemes, manifestTokens } from '@vignettes/nuxt/build/theme-registry'
import { makeFrozenS3Client } from '../layers/studio/server/utils/frozen-s3-client.ts'
import { CONTENT_TYPES, contentTypeOf } from '../layers/studio/shared/storage/content-types.ts'
import { frozenS3ConfigFromEnv, isFrozenS3Configured } from '../layers/studio/shared/storage/frozen-s3.ts'
import { indexOf, themeLocalPath, themeObjectKey, THEMES_INDEX_KEY, tokensKeyOf } from '../layers/studio/shared/storage/themes-s3.ts'

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
    throw new Error(`theme "${name}" belongs to the application; it ships with the image, not with the published themes`)
  return theme
})

const cfg = frozenS3ConfigFromEnv(process.env)
const toBucket = isFrozenS3Configured(cfg)
const s3 = toBucket ? makeFrozenS3Client(cfg) : null
console.log(toBucket ? `destination: bucket ${cfg.bucket}` : `destination: ${themeLocalPath()}/ (no bucket credentials)`)

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

/** Where an object key lands on disk: `themes/<rest>` becomes `.themes/<rest>`. */
function localPathOf(key: string): string {
  return join(root, themeLocalPath(...key.split('/').slice(1)))
}

async function put(key: string, body: Buffer | string, contentType: string) {
  const size = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
  console.log(`  ${apply ? '↑' : '·'} ${toBucket ? key : relative(root, localPathOf(key))} (${size} bytes)`)
  if (!apply)
    return
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=300' }))
    return
  }
  const path = localPathOf(key)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

async function readPublished(): Promise<PublishedTheme[]> {
  return s3 ? await readPublishedFromBucket() : readPublishedFromDisk()
}

async function readPublishedFromBucket(): Promise<PublishedTheme[]> {
  const published: PublishedTheme[] = []
  let token: string | undefined
  do {
    const page = await s3!.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: 'themes/', ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (!object.Key || !/^themes\/[^/]+\/tokens\.json$/.test(object.Key))
        continue
      const res = await s3!.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: object.Key }))
      published.push(JSON.parse(await res.Body!.transformToString()) as PublishedTheme)
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined
  } while (token)
  return published
}

function readPublishedFromDisk(): PublishedTheme[] {
  const dir = join(root, themeLocalPath())
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(dir, entry.name, 'tokens.json'))
    .filter(path => statSync(path, { throwIfNoEntry: false })?.isFile())
    .map(path => JSON.parse(readFileSync(path, 'utf8')) as PublishedTheme)
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
        await put(themeObjectKey(theme.name, ...rel), readFileSync(file), contentTypeOf(file))
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
  console.log(apply ? '\n✓ published' : '\n(dry run; add --apply to write it)')
}
finally {
  rmSync(out, { recursive: true, force: true })
}

#!/usr/bin/env node
/**
 * Publish tenant themes where the deployed application serves them from.
 * Compiles each theme locally (CSS and assets), writes them under
 * `themes/<name>/` with the theme's `tokens.json`, which records the versions of
 * the theme packages it was compiled with, then rebuilds `themes/index.json`
 * from every published theme so the server picks the whole set up at its next
 * load (a minute, or `POST /api/admin/themes/reload`).
 *
 * The destination is the bucket when its credentials are in the environment
 * (`infisical run --env=prod -- ...`), under `NUXT_FROZEN_S3_THEMES_PREFIX` when
 * the environment sets one, and the local `.themes/` directory otherwise, which
 * is what an instance running without object storage serves. `--staging`
 * refuses to run without a prefix, so a push meant for staging never reaches
 * the themes of production.
 *
 * Usage: node scripts/theme-push.ts <name>[,<name>] [--apply] [--staging]
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
import { compileTheme, themePackageVersions } from '@vignettes/nuxt/build/theme-build'
import { checkExtends, discoverThemes, manifestTokens } from '@vignettes/nuxt/build/theme-registry'
import { makeFrozenS3Client } from '../layers/studio/server/utils/frozen-s3-client.ts'
import { CONTENT_TYPES, contentTypeOf } from '../layers/studio/shared/storage/content-types.ts'
import { frozenS3ConfigFromEnv, isFrozenS3Configured } from '../layers/studio/shared/storage/frozen-s3.ts'
import { indexOf, themeLocalPath, themeObjectKey } from '../layers/studio/shared/storage/themes-s3.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const staging = args.includes('--staging')
const names = (args.find(a => !a.startsWith('-')) ?? '').split(',').map(s => s.trim()).filter(Boolean)

if (names.length === 0) {
  console.error('Usage: node scripts/theme-push.ts <name>[,<name>] [--apply] [--staging]')
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
if (staging && !toBucket) {
  console.error('--staging publishes to the bucket, and its credentials are not in the environment')
  process.exit(2)
}
if (staging && !cfg.themesPrefix) {
  console.error('--staging publishes under NUXT_FROZEN_S3_THEMES_PREFIX of the staging environment, which is not set')
  process.exit(2)
}
const s3 = toBucket ? makeFrozenS3Client(cfg) : null
console.log(toBucket ? `destination: bucket ${cfg.bucket}, ${themeObjectKey(cfg.themesPrefix)}/` : `destination: ${themeLocalPath()}/ (no bucket credentials)`)
const compiledWith = themePackageVersions(root)
console.log(`compiled with: ${Object.entries(compiledWith).map(([name, version]) => `${name} ${version}`).join(', ')}`)

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

/** Writes `parts` under the themes folder of the destination: `[<prefix>/]themes/<parts>` or `.themes/<parts>`. */
async function put(parts: string[], body: Buffer | string, contentType: string) {
  const size = typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength
  const key = themeObjectKey(cfg.themesPrefix, ...parts)
  console.log(`  ${apply ? '↑' : '·'} ${toBucket ? key : themeLocalPath(...parts)} (${size} bytes)`)
  if (!apply)
    return
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=300' }))
    return
  }
  const path = join(root, themeLocalPath(...parts))
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

async function readPublished(): Promise<PublishedTheme[]> {
  return s3 ? await readPublishedFromBucket() : readPublishedFromDisk()
}

async function readPublishedFromBucket(): Promise<PublishedTheme[]> {
  const published: PublishedTheme[] = []
  const folder = `${themeObjectKey(cfg.themesPrefix)}/`
  let token: string | undefined
  do {
    const page = await s3!.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: folder, ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (!object.Key || !/^[^/]+\/tokens\.json$/.test(object.Key.slice(folder.length)))
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
    await put([`${theme.name}.css`], css, CONTENT_TYPES['.css'])
    const assetsDir = join(out, theme.name)
    if (statSync(assetsDir, { throwIfNoEntry: false })?.isDirectory()) {
      for (const file of walk(assetsDir)) {
        const rel = relative(assetsDir, file).split('/')
        await put([theme.name, ...rel], readFileSync(file), contentTypeOf(file))
      }
    }
    const entry: PublishedTheme = {
      tokens: manifestTokens(theme.manifest),
      aliases: theme.manifest.aliases ?? [],
      publishedAt: new Date().toISOString(),
      compiledWith,
    }
    await put([theme.name, 'tokens.json'], JSON.stringify(entry, null, 2), CONTENT_TYPES['.json'])
    publishedNow.push(entry)
  }

  const previous = (await readPublished()).filter(p => !publishedNow.some(n => n.tokens.name === p.tokens.name))
  const index = indexOf([...previous, ...publishedNow])
  console.log(`\nindex: ${Object.keys(index.tokens).join(', ')}${Object.keys(index.aliases).length ? ` (aliases ${JSON.stringify(index.aliases)})` : ''}`)
  await put(['index.json'], JSON.stringify(index, null, 2), CONTENT_TYPES['.json'])
  console.log(apply ? '\n✓ published' : '\n(dry run; add --apply to write it)')
}
finally {
  rmSync(out, { recursive: true, force: true })
}

import type { FreezeDescriptor } from './descriptor.ts'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { buildReducedPublic, copyDeckAssets, rebaseCssUrls } from './assets.ts'
import { bundleStorybookUrl } from './bundle.ts'

export interface FreezeRun {
  /** Project root: the Nuxt application that builds the bundle. */
  root: string
  descriptor: FreezeDescriptor
  /** The deck's markdown, frontmatter included. */
  raw: string
  /** Built Storybook to embed, when the deck shows stories. */
  storybookDir?: string
  /** Content directory holding the deck assets, `presentations` by default. */
  contentDir?: string
  /** Extra environment for the build, such as the database the deck comes from. */
  env?: Record<string, string>
  /** Publishes the built bundle. Without it the bundle stays on disk. */
  upload?: (bundle: string, dir: string) => void
  /** Recorded in the bundle beside the markdown. */
  provenance?: Record<string, unknown>
  log?: (line: string) => void
}

/**
 * Build a self-contained static bundle of one deck: no server, no database, no
 * Nuxt runtime. The alias keeps serving the same URL, from the bundle instead of
 * the live deck.
 *
 * Every path inside the bundle is relative, so it renders wherever it is served.
 */
export function freezeDeck(run: FreezeRun): string {
  const { root, descriptor, raw, storybookDir, contentDir, env = {}, upload, provenance, log = console.log } = run
  const here = join(import.meta.dirname)
  const outDir = join(root, descriptor.hostDir)
  const publicDir = mkdtempSync(join(tmpdir(), 'bundle-public-'))

  const step = (id: FreezeDescriptor['steps'][number]['id'], body: () => void) => {
    const s = descriptor.steps.find(x => x.id === id)!
    if (!s.enabled)
      return
    log(`\n▶ ${s.id} — ${s.description}`)
    body()
  }
  const exec = (cmd: string, argv: string[], extra: Record<string, string> = {}) =>
    execFileSync(cmd, argv, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extra } })

  try {
    step('build-bundle', () => {
      const kept = buildReducedPublic(root, publicDir, descriptor.theme)
      log(`   reduced public/: ${kept.join(', ')}`)
      exec('pnpm', ['generate'], {
        BUNDLE_ONLY_SLUG: descriptor.slug,
        BUNDLE_PUBLIC_DIR: publicDir,
        BUNDLE_THEME: descriptor.theme ?? '',
        BUNDLE_STORYBOOK_URL: bundleStorybookUrl(descriptor.baseUrl),
        NUXT_APP_BASE_URL: descriptor.baseUrl,
        ...env,
      })

      rmSync(outDir, { recursive: true, force: true })
      mkdirSync(outDir, { recursive: true })
      cpSync(join(root, '.output/public'), outDir, { recursive: true })
      // The deck page keeps the `--standalone` directory name the published
      // links have been pointing at since the first bundle.
      renameSync(join(outDir, 'slides', descriptor.slug), join(outDir, 'slides', descriptor.deckDir))

      // The deck renders through Reveal alone, so its Nuxt chunks and the
      // interface translations are dead weight; the CSS chunks stay, linked by
      // link-deck-css.
      for (const file of listFiles(join(outDir, '_nuxt')).filter(f => f.endsWith('.js')))
        unlinkSync(file)
      rmSync(join(outDir, '_i18n'), { recursive: true, force: true })
      rmSync(join(outDir, 'slides', descriptor.deckDir, '_payload.json'), { force: true })

      mkdirSync(join(outDir, 'reveal'), { recursive: true })
      for (const file of ['reveal.js', 'reveal.css'])
        cpSync(join(root, 'node_modules/reveal.js/dist', file), join(outDir, 'reveal', file))

      exec('node', [join(here, 'link-deck-css.js'), outDir, descriptor.deckDir])

      const { copied, missing } = copyDeckAssets(root, raw, outDir, contentDir)
      log(`   deck assets: ${copied.length} carried${missing.length ? `, MISSING ${missing.join(', ')}` : ''}`)
      log(`   stylesheets made location-agnostic: ${rebaseCssUrls(outDir)}`)
    })

    step('embed-storybook', () => {
      const source = existsSync(storybookDir!) ? storybookDir! : join(root, storybookDir!)
      const target = join(outDir, '_storybook')
      cpSync(source, target, { recursive: true })
      exec('node', [join(here, 'prune-storybook-assets.js'), target])
      exec('node', [join(here, 'rebase-storybook-assets.js'), target])
    })

    step('host-bundle', () => {
      const sourceDir = join(outDir, 'source')
      mkdirSync(sourceDir, { recursive: true })
      writeFileSync(join(sourceDir, `${descriptor.slug}.md`), raw)
      writeFileSync(join(sourceDir, 'provenance.json'), `${JSON.stringify({
        alias: descriptor.alias,
        slug: descriptor.slug,
        theme: descriptor.theme ?? null,
        frozenAt: new Date().toISOString(),
        ...provenance,
      }, null, 2)}\n`)
      log(`   ${outDir} (${listFiles(outDir).length} files)`)
    })

    step('upload-bundle', () => {
      if (!upload) {
        log(`   skipped (no uploader); the bundle stays in ${descriptor.hostDir}`)
        return
      }
      upload(descriptor.bundle, outDir)
    })

    return outDir
  }
  finally {
    rmSync(publicDir, { recursive: true, force: true })
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  )
}

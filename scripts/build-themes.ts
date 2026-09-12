#!/usr/bin/env node
/**
 * Compiles every discovered theme to `public/themes/` (a build output).
 *
 * Usage: node scripts/build-themes.ts [name] [--watch]
 */
import { existsSync, readdirSync, rmSync, watch } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { compileTheme, themesOutDir } from '@vignettes/nuxt/build/theme-build'
import { contentDir, discoverThemes } from '@vignettes/nuxt/build/theme-registry'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = join(root, 'packages')

const args = process.argv.slice(2)
const watchMode = args.includes('--watch') || args.includes('-w')
const only = args.find(arg => !arg.startsWith('-'))

const all = discoverThemes(root)
const themes = only ? all.filter(t => t.name === only) : all
if (only && themes.length === 0) {
  console.error(`✗ Theme "${only}" not found. Available themes: ${all.map(t => t.name).join(', ')}`)
  process.exit(1)
}

// A full build starts clean so a removed theme leaves no stale CSS behind.
if (!only && !watchMode)
  rmSync(themesOutDir(root), { recursive: true, force: true })

const ok = themes.map(theme => compileTheme(root, theme)).every(Boolean)
if (!ok && !watchMode)
  process.exit(1)

if (watchMode) {
  const dirs = [
    ...themes.map(t => t.dir),
    ...(existsSync(packagesDir) ? readdirSync(packagesDir).map(d => join(packagesDir, d)) : []),
  ]
  console.log(`\n👀 Watching themes in ${join(root, 'themes')}, ${join(contentDir(root), 'themes')} and packages/\n`)
  for (const dir of dirs) {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (!filename || !filename.endsWith('.scss'))
        return
      const inTheme = themes.find(t => dir === t.dir)
      console.log(`\n📝 ${filename} changed`)
      for (const theme of inTheme ? [inTheme] : themes)
        compileTheme(root, theme)
    })
  }
}

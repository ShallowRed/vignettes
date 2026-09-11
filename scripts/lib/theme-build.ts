/**
 * Compilation of one theme: SCSS entry to `public/themes/<name>.css`, then the
 * theme's `assets/` and the extra copies its manifest declares to
 * `public/themes/<name>/`. Packages resolve through sass's `pkg:` importer from
 * the project root, so a brand in the content space reaches `@nuxt-slides/*`
 * without a node_modules of its own.
 */
import type { DiscoveredTheme } from './theme-registry.ts'
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as sass from 'sass'

export function themesOutDir(root: string): string {
  return join(root, 'public/themes')
}

export function compileTheme(root: string, theme: DiscoveredTheme): boolean {
  const outDir = themesOutDir(root)
  mkdirSync(outDir, { recursive: true })
  try {
    const result = sass.compile(theme.entry, {
      style: 'expanded',
      sourceMap: false,
      importers: [new sass.NodePackageImporter(root)],
    })
    writeFileSync(join(outDir, `${theme.name}.css`), result.css)
    copyAssets(root, theme)
    console.log(`✓ ${theme.name}`)
    return true
  }
  catch (error) {
    console.error(`✗ ${theme.name}: ${(error as Error).message}`)
    return false
  }
}

function copyAssets(root: string, theme: DiscoveredTheme) {
  const target = join(themesOutDir(root), theme.name)
  rmSync(target, { recursive: true, force: true })
  const own = join(theme.dir, 'assets')
  if (existsSync(own))
    cpSync(own, join(target, 'assets'), { recursive: true })
  for (const copy of theme.manifest.assets ?? []) {
    const from = join(root, copy.from)
    if (!existsSync(from))
      throw new Error(`assets "${copy.from}" not found (is the package installed?)`)
    const pattern = copy.match ? new RegExp(copy.match) : null
    cpSync(from, join(target, copy.to), {
      recursive: true,
      filter: source => !pattern || statSync(source).isDirectory() || pattern.test(source.slice(from.length + 1)),
    })
  }
}

/**
 * Compilation of one theme: SCSS entry to `<out>/<name>.css`, then the theme's
 * `assets/` and the extra copies its manifest declares to `<out>/<name>/`.
 * Packages resolve through sass's `pkg:` importer from the project root, so a
 * brand in the content space resolves `@vignettes/*` without a node_modules of
 * its own. The default output is `public/themes/`, what the application serves.
 */
import type { DiscoveredTheme } from './theme-registry.ts'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import * as sass from 'sass'
import { PREVIEW_FONTS_FILE } from './theme-registry.ts'

export function themesOutDir(root: string): string {
  return join(root, 'public/themes')
}

/** The packages whose stylesheets a theme compiles with. */
const THEME_PACKAGES = ['@vignettes/theme-kit', '@vignettes/theme-dsfr']

/**
 * The version of each theme package installed at `root`: its `version`, then
 * the start of a hash of its stylesheets, `0.1.0+3f2a9c41d0`. The hash tells
 * two states of a package apart while its `version` stays the same.
 */
export function themePackageVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const name of THEME_PACKAGES) {
    const dir = join(root, 'node_modules', name)
    if (!existsSync(dir))
      continue
    const real = realpathSync(dir)
    const hash = createHash('sha256')
    for (const file of stylesheets(real)) {
      hash.update(relative(real, file))
      hash.update(readFileSync(file))
    }
    const { version } = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8')) as { version: string }
    versions[name] = `${version}+${hash.digest('hex').slice(0, 10)}`
  }
  return versions
}

function stylesheets(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.scss'))
    .map(entry => join(entry.parentPath, entry.name))
    .filter(file => !relative(dir, file).split('/').includes('node_modules'))
    .sort()
}

export function compileTheme(root: string, theme: DiscoveredTheme, outDir = themesOutDir(root)): boolean {
  mkdirSync(outDir, { recursive: true })
  try {
    const result = sass.compile(theme.entry, {
      style: 'expanded',
      sourceMap: false,
      importers: [new sass.NodePackageImporter(root)],
    })
    writeFileSync(join(outDir, `${theme.name}.css`), result.css)
    copyAssets(root, theme, outDir)
    compilePreviewFonts(root, theme, outDir)
    console.log(`✓ ${theme.name}`)
    return true
  }
  catch (error) {
    console.error(`✗ ${theme.name}: ${(error as Error).message}`)
    return false
  }
}

// The catalog loads only the font faces of a theme, not its whole stylesheet.
function compilePreviewFonts(root: string, theme: DiscoveredTheme, outDir: string) {
  const fonts = theme.manifest.preview?.fonts
  if (!fonts)
    return
  const result = sass.compileString(`@use '${fonts}';`, {
    style: 'expanded',
    loadPaths: [theme.dir],
    importers: [new sass.NodePackageImporter(root)],
  })
  mkdirSync(join(outDir, theme.name), { recursive: true })
  writeFileSync(join(outDir, theme.name, PREVIEW_FONTS_FILE), result.css)
}

function copyAssets(root: string, theme: DiscoveredTheme, outDir: string) {
  const target = join(outDir, theme.name)
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

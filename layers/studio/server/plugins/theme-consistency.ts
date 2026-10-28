/**
 * Boot-time warning for theme drift between the registry, the stylesheets a deck
 * can actually load (`public/themes/*.css` plus the published themes served by
 * `/themes/**`) and the theme directories (application and content space). Runs
 * after the tenant themes are registered, so a brand compiled from the content
 * space counts as known. Non-fatal: never throws, no-ops if the dirs are absent.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { checkThemeConsistency } from '@vignettes/core/theme'
import { themeRoots } from '@vignettes/nuxt/build/theme-registry'
import { serverConfig } from '../utils/config'
import { loadTenantThemes, publishedThemeNames } from '../utils/themes'

export default defineNitroPlugin(async () => {
  let cwd: string
  try {
    cwd = process.cwd()
  }
  catch {
    return
  }

  const publicThemes = join(cwd, 'public', 'themes')
  if (!existsSync(publicThemes))
    return

  try {
    await loadTenantThemes()
  }
  catch {
    // Reported by the registry plugin; the check below still runs on the built-in themes.
  }

  const cssFiles = [
    ...safeReaddir(publicThemes).filter(f => f.endsWith('.css')).map(f => f.slice(0, -'.css'.length)),
    ...publishedThemeNames(),
  ]

  const roots = themeRoots(cwd, serverConfig().contentDir).map(root => root.dir).filter(dir => existsSync(dir))
  const sourceDirs = roots.length
    ? roots.flatMap(dir => safeReaddir(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'theme.json')))
        .map(e => e.name))
    : undefined

  const report = checkThemeConsistency({ cssFiles, sourceDirs, buildCommand: 'pnpm build:themes' })
  if (!report.ok) {
    console.warn(
      `[theme-consistency] ${report.warnings.length} theme issue(s) found:\n  - ${report.warnings.join('\n  - ')}`,
    )
  }
})

function safeReaddir(dir: string): string[]
function safeReaddir(dir: string, opts: { withFileTypes: true }): import('node:fs').Dirent[]
function safeReaddir(dir: string, opts?: { withFileTypes: true }): unknown[] {
  try {
    return opts ? readdirSync(dir, opts) : readdirSync(dir)
  }
  catch {
    return []
  }
}

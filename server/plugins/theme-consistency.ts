/**
 * Boot-time warning for theme drift between the registry, the compiled
 * `public/themes/*.css` and the theme directories (application and content
 * space). Runs after the tenant themes are registered, so a brand compiled from
 * the content space counts as known. Non-fatal: never throws, no-ops if the dirs
 * are absent.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { checkThemeConsistency } from '#shared/theme'
import { loadTenantThemes } from '../utils/themes'

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

  const cssFiles = safeReaddir(publicThemes)
    .filter(f => f.endsWith('.css'))
    .map(f => f.slice(0, -'.css'.length))

  const themeRoots = [
    join(cwd, 'themes'),
    join(cwd, process.env.NUXT_CONTENT_DIR || 'presentations', 'themes'),
  ].filter(dir => existsSync(dir))
  const sourceDirs = themeRoots.length
    ? themeRoots.flatMap(dir => safeReaddir(dir, { withFileTypes: true })
        .filter(e => e.isDirectory() && existsSync(join(dir, e.name, 'theme.json')))
        .map(e => e.name))
    : undefined

  const report = checkThemeConsistency({ cssFiles, sourceDirs })
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

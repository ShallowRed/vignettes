/**
 * Boot-time warning for theme drift between the compiled `public/themes/*.css`
 * and the SCSS source dirs (e.g. a theme whose CSS is missing → 404 stylesheet).
 * Non-fatal: never throws, no-ops if the dirs are absent.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { checkThemeConsistency } from '#shared/theme'

export default defineNitroPlugin(() => {
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

  const cssFiles = safeReaddir(publicThemes)
    .filter(f => f.endsWith('.css'))
    .map(f => f.slice(0, -'.css'.length))

  const themesSrc = join(cwd, 'themes')
  const sourceDirs = existsSync(themesSrc)
    ? safeReaddir(themesSrc, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
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

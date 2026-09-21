import { existsSync, readdirSync, readFileSync, realpathSync, watch } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { compileTheme } from './theme-build.ts'
import { discoverThemes } from './theme-registry.ts'

/** The packages the stylesheets of a theme import through sass's `pkg:` scheme. */
function importedPackages(theme) {
  const names = new Set()
  for (const file of readdirSync(theme.dir, { recursive: true })) {
    if (!String(file).endsWith('.scss'))
      continue
    for (const match of readFileSync(join(theme.dir, String(file)), 'utf8').matchAll(/pkg:(@[\w-]+\/[\w-]+|[\w-]+)/g))
      names.add(match[1])
  }
  return names
}

/**
 * The directory of each package the discovered themes import, found among the
 * resolver's `node_modules` candidates: these packages export their stylesheets
 * under a `sass` condition, which `require.resolve` does not follow.
 */
function packageDirs(root, themes) {
  const require = createRequire(`${root}/`)
  const dirs = new Set()
  for (const name of new Set(themes.flatMap(theme => [...importedPackages(theme)]))) {
    for (const base of require.resolve.paths(name) ?? []) {
      const dir = join(base, ...name.split('/'))
      if (existsSync(join(dir, 'package.json'))) {
        dirs.add(realpathSync(dir))
        break
      }
    }
  }
  return [...dirs]
}

// Dev theme watcher: watch only, the compile at server start comes from `pnpm dev`
// (`build:themes`). Editing a theme, a stylesheet package or a brand in the
// content space recompiles the themes concerned and reloads the page.
export default function themeWatcherPlugin() {
  return {
    name: 'theme-watcher',

    configureServer(server) {
      const root = process.cwd()
      const themes = discoverThemes(root)
      const packages = packageDirs(root, themes)

      const recompile = (targets, filename) => {
        console.log(`\n📝 ${filename} changed, recompiling ${targets.map(t => t.name).join(', ')}`)
        targets.forEach(theme => compileTheme(root, theme))
        server.ws.send({ type: 'full-reload', path: '*' })
      }

      for (const theme of themes) {
        watch(theme.dir, { recursive: true }, (_event, filename) => {
          if (filename && filename.endsWith('.scss'))
            recompile([theme], filename)
        })
      }
      for (const dir of packages) {
        watch(dir, { recursive: true }, (_event, filename) => {
          if (filename && filename.endsWith('.scss'))
            recompile(themes, filename)
        })
      }
    },
  }
}

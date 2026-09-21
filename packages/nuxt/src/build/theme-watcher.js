import { existsSync, watch } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'
import { compileTheme } from './theme-build.ts'
import { discoverThemes } from './theme-registry.ts'

/**
 * The stylesheet packages a theme composes, resolved where they stand: the
 * workspace during development here, `node_modules` in an installed copy. The
 * `pkg:` imports of the themes name these two.
 */
const STYLESHEET_PACKAGES = ['@vignettes/theme-kit', '@vignettes/theme-dsfr']

function packageDirs(root) {
  const require = createRequire(`${root}/`)
  const dirs = []
  for (const name of STYLESHEET_PACKAGES) {
    // The candidate `node_modules` of the resolver, rather than `require.resolve`:
    // these packages export their stylesheets under a `sass` condition and no
    // path that a resolver reaches from here.
    for (const base of require.resolve.paths(name) ?? []) {
      const dir = join(base, ...name.split('/'))
      if (existsSync(join(dir, 'package.json'))) {
        dirs.push(dir)
        break
      }
    }
  }
  return dirs
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
      const packages = packageDirs(root)

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

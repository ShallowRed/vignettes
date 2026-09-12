import { existsSync, readdirSync, watch } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { compileTheme } from './theme-build.ts'
import { discoverThemes } from './theme-registry.ts'

// Dev theme watcher: watch only, the compile at server start comes from `pnpm dev`
// (`build:themes`). Editing a theme, a package or a brand in the content space
// recompiles the themes concerned and reloads the page.
export default function themeWatcherPlugin() {
  return {
    name: 'theme-watcher',

    configureServer(server) {
      const root = process.cwd()
      const themes = discoverThemes(root)
      const packagesDir = join(root, 'packages')
      const packages = existsSync(packagesDir) ? readdirSync(packagesDir).map(d => join(packagesDir, d)) : []

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

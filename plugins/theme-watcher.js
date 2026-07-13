import { mkdirSync, watch, writeFileSync } from 'node:fs'
import * as sass from 'sass'
import { themes } from '../themes/themes.config.js'

// Dev theme watcher — watch only, no startup compile (committed public/themes/*.css are used as-is;
// compilation is opt-in via `pnpm build:themes`). Editing SCSS recompiles that theme and triggers HMR.
export default function themeWatcherPlugin() {
  function compileTheme({ name, input, output }) {
    try {
      const result = sass.compile(input, {
        style: 'expanded',
        sourceMap: false,
      })

      mkdirSync('public/themes', { recursive: true })
      writeFileSync(output, result.css)
      console.log(`✓ ${name} theme compiled`)
    }
    catch (error) {
      console.error(`✗ Error compiling ${name} theme:`, error.message)
    }
  }

  return {
    name: 'theme-watcher',

    configureServer(server) {
      themes.forEach(({ name, input, output, watchDir, watchExtraDirs }) => {
        const dirs = [watchDir, ...(watchExtraDirs ?? [])]

        dirs.forEach((dir) => {
          watch(dir, { recursive: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.scss')) {
              console.log(`\n📝 ${name} theme changed, recompiling...`)
              compileTheme({ name, input, output })

              server.ws.send({
                type: 'full-reload',
                path: '*',
              })
            }
          })
        })
      })
    },
  }
}

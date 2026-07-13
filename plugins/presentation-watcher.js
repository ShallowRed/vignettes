import { watch } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

// Watches presentation .md/.yaml files and sends a custom HMR event so the client refreshes data.
export default function presentationWatcherPlugin() {
  const presentationsDir = 'presentations'
  // Nuxt dev runs two Vite servers (client + SSR); guard so the watcher is set up exactly once.
  let watching = false

  return {
    name: 'presentation-watcher',

    configureServer(server) {
      if (watching)
        return
      watching = true

      const watchPath = resolve(process.cwd(), presentationsDir)

      watch(watchPath, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.md') || filename.endsWith('.yaml'))) {
          const slug = filename
            .replace(/^(public|private|semi-private|draft)\//, '')
            .replace(/\.(md|yaml)$/, '')

          console.log(`\n📝 Presentation changed: ${filename}`)

          server.ws.send({
            type: 'custom',
            event: 'presentation-update',
            data: { slug, filename },
          })
        }
      })

      console.log(`👀 Watching presentations in ${watchPath}`)
    },
  }
}

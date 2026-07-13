import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveDeckStatus } from '../deck/status-resolve'

// Build-time discovery of public deck slugs for prerendering (SSG). Status lives
// in frontmatter; the legacy `public/` folder is used as fallback for un-migrated
// stubs. Filesystem only, callable from nuxt.config.ts.

const SKIP_DIRS = new Set(['archived'])

export async function discoverPublicSlugs(presentationsDir: string): Promise<string[]> {
  const slugs: string[] = []

  async function scan(dir: string, folderHint?: string): Promise<void> {
    let dirents
    try {
      dirents = await readdir(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const dirent of dirents) {
      const full = join(dir, dirent.name)
      if (dirent.isDirectory()) {
        if (!folderHint && !SKIP_DIRS.has(dirent.name))
          await scan(full, dirent.name)
        continue
      }
      if (!dirent.name.endsWith('.md'))
        continue
      const content = await readFile(full, 'utf8').catch(() => '')
      if (content && resolveDeckStatus(content, folderHint) === 'public')
        slugs.push(dirent.name.replace(/\.md$/, ''))
    }
  }

  await scan(presentationsDir)
  return [...new Set(slugs)]
}

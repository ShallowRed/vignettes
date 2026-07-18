/**
 * Yaml adapter for the `ProjectDirectory` port: loads `presentations/projects.yml`
 * via Nitro server-asset storage + a TTL cache. Never throws; missing/malformed → [].
 */

import type { Project, ProjectDirectory } from '#shared/projects'
import { createTtlCache, DEFAULT_CACHE_TTL_MS } from '#shared/deck'
import { parseProjects } from '#shared/projects'
import { load as parseYaml } from 'js-yaml'
import { presentationsStorage } from './presentations'

const projectsCache = createTtlCache<Project[]>(
  () => {
    const raw = useRuntimeConfig().sourceCacheTtlMs
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_MS
  },
)

async function loadProjects(): Promise<Project[]> {
  return projectsCache.get('projects', async () => {
    try {
      const stored = await presentationsStorage().getItem('projects.yml')
      if (stored == null)
        return []
      const raw = typeof stored === 'string' ? stored : String(stored)
      return parseProjects(parseYaml(raw))
    }
    catch (error: any) {
      if (error?.code !== 'ENOENT')
        console.error('[projects] Failed to load projects.yml:', error?.message || error)
      return []
    }
  })
}

export const fileProjects: ProjectDirectory = {
  list: loadProjects,

  async resolve(slug) {
    return (await loadProjects()).find(p => p.slug === slug) ?? null
  },
}

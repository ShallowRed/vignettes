/**
 * Yaml adapter for the `DeckDirectory` port: loads `presentations/registry.yml`
 * (stable aliases surviving live → frozen → archived). The db adapter takes
 * precedence entry by entry — see the chain in `sources.ts`.
 */

import type { DeckDirectory, DeckDirectoryEntry } from '#shared/deck'
import { createTtlCache, DEFAULT_CACHE_TTL_MS } from '#shared/deck'
import { load as parseYaml } from 'js-yaml'
import { presentationsStorage } from './presentations'

const registryCache = createTtlCache<Map<string, DeckDirectoryEntry>>(
  () => {
    const raw = useRuntimeConfig().sourceCacheTtlMs
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_MS
  },
)

/** Load and index the registry (canonical alias, stub slug, historical `aliases` → same entry). */
async function loadRegistry(): Promise<Map<string, DeckDirectoryEntry>> {
  return registryCache.get('registry', async () => {
    const entries = new Map<string, DeckDirectoryEntry>()

    try {
      const stored = await presentationsStorage().getItem('registry.yml')
      const raw = typeof stored === 'string' ? stored : stored == null ? '' : String(stored)
      const doc = (parseYaml(raw) || {}) as Record<string, Omit<DeckDirectoryEntry, 'alias'>>

      for (const [alias, value] of Object.entries(doc)) {
        const entry: DeckDirectoryEntry = {
          ...value,
          alias,
          slug: value.slug || alias,
          lifecycle: value.lifecycle || 'live',
        }
        entries.set(alias, entry)
        // Index the stub slug too, so /slides/<slug> converges on /p/<alias>.
        if (entry.slug && entry.slug !== alias)
          entries.set(entry.slug, entry)
        for (const a of entry.aliases ?? [])
          entries.set(a.replace(/^\/+/, ''), entry)
      }
    }
    catch (error: any) {
      if (error?.code !== 'ENOENT')
        console.error('[registry] Failed to load registry.yml:', error?.message || error)
    }

    return entries
  })
}

export const fileDirectory: DeckDirectory = {
  async resolveAlias(alias) {
    const entries = await loadRegistry()
    return entries.get(alias) ?? entries.get(alias.replace(/^\/+/, '')) ?? null
  },

  async list() {
    const entries = await loadRegistry()
    return [...entries.values()].filter((e, i, arr) => arr.indexOf(e) === i)
  },
}

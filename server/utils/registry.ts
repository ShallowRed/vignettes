/**
 * Registry of diffused presentations. Loads `presentations/registry.yml` and
 * resolves a stable alias to its lifecycle + source; an alias keeps the same URL
 * across live → frozen → archived. Per-file frontmatter still owns theme /
 * storybook / access — the registry only adds the lifecycle axis and alias mapping.
 */

import { createTtlCache, DEFAULT_CACHE_TTL_MS } from '#shared/deck'
import { load as parseYaml } from 'js-yaml'
import { presentationsStorage } from './presentations'

export type { Lifecycle } from '#shared/access'

export interface RegistryEntry {
  alias: string
  title?: string
  lifecycle: Lifecycle
  /** Stub slug; defaults to alias. */
  slug: string
  source?: 'codimd' | 'hackmd'
  noteId?: string
  /** Bundle folder served when lifecycle is frozen/archived. */
  frozenBundle?: string
  /** Access folder; disambiguates when the same slug exists in several folders. */
  access?: string
  /** Historical paths redirected to this alias. */
  aliases?: string[]
}

const registryCache = createTtlCache<Map<string, RegistryEntry>>(
  () => {
    const raw = useRuntimeConfig().sourceCacheTtlMs
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_MS
  },
)

/** Load and index the registry (canonical alias + historical `aliases` → same entry). */
async function loadRegistry(): Promise<Map<string, RegistryEntry>> {
  return registryCache.get('registry', async () => {
    const entries = new Map<string, RegistryEntry>()

    try {
      const stored = await presentationsStorage().getItem('registry.yml')
      const raw = typeof stored === 'string' ? stored : stored == null ? '' : String(stored)
      const doc = (parseYaml(raw) || {}) as Record<string, Omit<RegistryEntry, 'alias'>>

      for (const [alias, value] of Object.entries(doc)) {
        const entry: RegistryEntry = {
          alias,
          slug: value.slug || alias,
          lifecycle: value.lifecycle || 'live',
          ...value,
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

/** Resolve an alias (canonical or historical) to its registry entry, or null. */
export async function resolveAlias(alias: string): Promise<RegistryEntry | null> {
  const entries = await loadRegistry()
  return entries.get(alias) ?? entries.get(alias.replace(/^\/+/, '')) ?? null
}

/** List all registry entries, de-duplicated to canonical aliases. */
export async function listRegistry(): Promise<RegistryEntry[]> {
  const entries = await loadRegistry()
  return [...entries.values()].filter((e, i, arr) => arr.indexOf(e) === i)
}

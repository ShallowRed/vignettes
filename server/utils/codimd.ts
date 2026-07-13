/**
 * Fetch presentation content from CodiMD (self-hosted, `/:noteId/download`) or
 * HackMD (hackmd.io API). Cached in-memory with a short TTL (`NUXT_SOURCE_CACHE_TTL_MS`).
 */

import { createTtlCache, DEFAULT_CACHE_TTL_MS, SourceUnreachableError } from '#shared/deck'

export type NoteSource = 'codimd' | 'hackmd'

const HACKMD_API_BASE = 'https://api.hackmd.io/v1'

/** Shared TTL cache; only successful fetches are stored (null is never cached). */
const noteCache = createTtlCache<string>(sourceCacheTtlMs)

function sourceCacheTtlMs(): number {
  const raw = useRuntimeConfig().sourceCacheTtlMs
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_MS
}

function getConfig() {
  const config = useRuntimeConfig()
  return {
    codimdUrl: (config.codimdUrl as string || '').replace(/\/+$/, ''),
    hackmdApiToken: config.hackmdApiToken as string || '',
  }
}

async function fetchFromCodiMD(noteId: string): Promise<string | null> {
  const { codimdUrl } = getConfig()
  if (!codimdUrl) {
    console.warn('[codimd] NUXT_CODIMD_URL is not configured — skipping fetch')
    return null
  }

  const url = `${codimdUrl}/${encodeURIComponent(noteId)}/download`
  const content = await $fetch<string>(url, {
    headers: { Accept: 'text/markdown, text/plain' },
    responseType: 'text',
  })
  return content
}

async function fetchFromHackMD(noteId: string): Promise<string | null> {
  const { hackmdApiToken } = getConfig()
  if (!hackmdApiToken) {
    console.warn('[hackmd] NUXT_HACKMD_API_TOKEN is not configured — skipping fetch')
    return null
  }

  const url = `${HACKMD_API_BASE}/notes/${encodeURIComponent(noteId)}`
  const data = await $fetch<{ content: string }>(url, {
    headers: { Authorization: `Bearer ${hackmdApiToken}` },
  })
  return data.content
}

/** Fetch a collaborative note's markdown, or `null` when unreachable. */
export async function fetchCollaborativeNote(source: NoteSource, noteId: string): Promise<string | null> {
  const cacheKey = `${source}:${noteId}`

  try {
    // Loader throws on unreachable/empty so failures are NOT cached (only successful markdown is).
    return await noteCache.get(cacheKey, async () => {
      const content = source === 'hackmd'
        ? await fetchFromHackMD(noteId)
        : await fetchFromCodiMD(noteId)
      if (content === null)
        throw new SourceUnreachableError(source, noteId)
      return content
    })
  }
  catch (error: any) {
    console.error(`[${source}] Failed to fetch note "${noteId}":`, error?.message || error)
    return null
  }
}

export function getEditUrl(source: NoteSource, noteId: string): string | null {
  if (source === 'hackmd') {
    return `https://hackmd.io/${noteId}`
  }
  const { codimdUrl } = getConfig()
  return codimdUrl ? `${codimdUrl}/${noteId}` : null
}

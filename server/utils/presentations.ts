/**
 * Presentation discovery. Content is read through Nitro server assets
 * (`useStorage('assets:presentations')`), not the raw filesystem, so it resolves
 * in dev and on the server regardless of the process working directory.
 */

import type { PublicationStatus } from '#shared/access'
import { PUBLICATION_STATUSES } from '#shared/access'
import { resolveDeckStatus } from '#shared/deck'

// Local re-export (not a bare `export … from`) so it survives Nitro's bundling.
export type { PublicationStatus }
export { PUBLICATION_STATUSES }

export function presentationsStorage() {
  return useStorage('assets:presentations')
}

// `archived/` is a lifecycle location sourced via the registry, not a deck stub.
const NON_STUB_PREFIXES = ['archived']

// Repo documentation, not a deck — it would otherwise be catalogued as one.
const NON_STUB_SLUGS = ['README']

interface StubEntry {
  slug: string
  status: PublicationStatus
  content: string
  key: string
}

/**
 * Enumerate every deck stub under `presentations/` (flat `<slug>.md` or
 * `<status>/<slug>.md`). Status derives from frontmatter; `archived/` is skipped.
 */
async function listStubEntries(): Promise<StubEntry[]> {
  const storage = presentationsStorage()
  const keys = (await storage.getKeys()).filter(k => k.endsWith('.md'))

  const entries: StubEntry[] = []
  for (const key of keys) {
    // Storage keys are colon-delimited (`<folder>:<slug>.md` or `<slug>.md`).
    const segments = key.split(':')
    const folderHint = segments.length > 1 ? segments[segments.length - 2] : undefined
    if (folderHint && NON_STUB_PREFIXES.includes(folderHint))
      continue
    const slug = segments[segments.length - 1]!.replace(/\.md$/, '')
    if (NON_STUB_SLUGS.includes(slug))
      continue
    const raw = await storage.getItem(key)
    if (raw == null)
      continue
    const content = typeof raw === 'string' ? raw : String(raw)
    entries.push({ slug, status: resolveDeckStatus(content, folderHint), content, key })
  }
  return entries
}

/** Find a presentation by slug; throws if the slug exists in more than one stub. */
export async function findPresentationBySlug(slug: string): Promise<{
  status: PublicationStatus
  key: string
} | null> {
  const matches = (await listStubEntries()).filter(e => e.slug === slug)
  if (matches.length === 0)
    return null
  if (matches.length > 1) {
    throw new Error(`Duplicate slug "${slug}" found in: ${matches.map(m => m.key).join(', ')}`)
  }
  return { status: matches[0]!.status, key: matches[0]!.key }
}

export async function listPresentationsByStatus(status: PublicationStatus): Promise<string[]> {
  return (await listStubEntries()).filter(e => e.status === status).map(e => e.slug)
}

export async function listAllPresentations(): Promise<{ slug: string, status: PublicationStatus }[]> {
  return (await listStubEntries()).map(({ slug, status }) => ({ slug, status }))
}

export async function readPresentationContent(slug: string): Promise<{
  content: string
  status: PublicationStatus
} | null> {
  const match = (await listStubEntries()).find(e => e.slug === slug)
  if (!match)
    return null
  return { content: match.content, status: match.status }
}

/** Read a stub by slug. The `access` arg is accepted for source-compat but ignored. */
export async function readPresentationContentAt(
  slug: string,
  _access?: PublicationStatus,
): Promise<{ content: string, status: PublicationStatus } | null> {
  return readPresentationContent(slug)
}

/** Read a frozen/archived deck's stub from `presentations/archived/`. */
export async function readArchivedStub(slug: string): Promise<string | null> {
  const raw = await presentationsStorage().getItem(`archived:${slug}.md`)
  return raw == null ? null : (typeof raw === 'string' ? raw : String(raw))
}

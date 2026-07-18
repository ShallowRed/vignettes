import type { PresentationListItem } from '#shared/presentations'
import { canList } from '#shared/access'
import { splitFrontmatter } from '#shared/deck'
import { getActorRole } from '../utils/actor'
import { listAllPresentations, readArchivedStub, readPresentationContentAt } from '../utils/presentations'
import { deckDirectory, useDeckMeta } from '../utils/sources'

/**
 * Catalog endpoint. Managed decks (published or admin-edited) come from their
 * database row; file stubs and yaml-registry frozen decks cover the rest.
 * Visibility decided by the shared `canList` on the actor's role.
 */
export default defineEventHandler(async (event): Promise<PresentationListItem[]> => {
  const role = await getActorRole(event)

  try {
    const managed = await useDeckMeta().listManaged()
    const managedSlugs = new Set(managed.map(d => d.slug))

    const fromDb = managed.map(deck => ({
      slug: deck.slug,
      title: deck.title,
      theme: deck.theme || 'dsfr',
      status: deck.status,
      filename: `${deck.slug}.md`,
      project: deck.project,
      unlisted: deck.unlisted,
      alias: deck.alias,
      lifecycle: deck.lifecycle,
    } satisfies PresentationListItem))

    // Map stub slug → canonical alias so the home can link to /p/<alias>.
    const directory = await deckDirectory.list()
    const bySlug = new Map(directory.map(e => [e.slug, e]))

    const stubs = (await listAllPresentations()).filter(({ slug }) => !managedSlugs.has(slug))
    const fromFiles = await Promise.all(
      stubs.map(async ({ slug, status }) => {
        const read = await readPresentationContentAt(slug, status)
        const data = read ? splitFrontmatter(read.content).data : {}
        const entry = bySlug.get(slug)
        return {
          slug,
          title: (data.title as string) || slug,
          theme: (data.theme as string) || 'dsfr',
          status,
          filename: `${slug}.md`,
          project: (data.project as string) || undefined,
          unlisted: Boolean(data.unlisted),
          alias: entry?.alias,
          lifecycle: entry?.lifecycle,
        } satisfies PresentationListItem
      }),
    )

    // Frozen/archived decks live in archived/ (unseen by listAllPresentations) — source from the directory.
    const livePaths = new Set([...managedSlugs, ...stubs.map(p => p.slug)])
    const frozen = await Promise.all(
      directory
        .filter(e => (e.lifecycle === 'frozen' || e.lifecycle === 'archived') && !livePaths.has(e.slug))
        .map(async (entry) => {
          const stub = await readArchivedStub(entry.slug).catch(() => null)
          const theme = (stub ? splitFrontmatter(stub).data.theme as string : '') || 'dsfr'
          return {
            slug: entry.slug,
            title: entry.title || entry.slug,
            theme,
            status: 'public' as const,
            filename: `${entry.slug}.md`,
            unlisted: false,
            alias: entry.alias,
            lifecycle: entry.lifecycle,
          } satisfies PresentationListItem
        }),
    )

    return [...fromDb, ...fromFiles, ...frozen].filter(p =>
      canList({ status: p.status, lifecycle: p.lifecycle, role, unlisted: p.unlisted }),
    )
  }
  catch (error) {
    console.error('Error loading presentations:', error)
    return []
  }
})

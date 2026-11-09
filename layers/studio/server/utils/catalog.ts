import type { PresentationListItem, TitleSlide } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { H3Event } from 'h3'
import type { DeckMetaRecord } from '../db/ports'
import { createHash } from 'node:crypto'
import { canList, canShare, isPrivileged, mayEdit } from '#shared/access'
import { yDocUpdateToMarkdown } from '#shared/collab/ydoc'
import { readTitleSlide, titleSlidePreview, UNGROUPED_PROJECT } from '#shared/presentations'
import { parserIdFor, slideRanges, splitFrontmatter } from '@vignettes/core/deck'
import { deckThemeName, resolveThemeName } from '@vignettes/core/theme'
import { getActor } from './actor'
import { useDraftStore } from './collab'
import { useStores } from './db'
import { projectDirectory, useDeckMeta, useGrants, useProjectPermissionStore } from './sources'
import { loadTenantThemes } from './themes'

/**
 * Whether the draft of a deck differs from its published version, by deck: the
 * key is the published version id and the SHA-256 of the draft bytes, and an
 * entry is valid while both stay the same.
 */
const draftComparisons = new Map<string, { key: string, changed: boolean }>()

/**
 * Decks whose draft holds changes the published version does not, among the
 * candidates, given as slug → id of the published version: every draft is
 * compared with the text of that version, whatever their dates.
 */
export async function unpublishedChanges(candidates: Map<string, number>): Promise<Set<string>> {
  const drafts = useDraftStore()
  const entries = (await Promise.all([...candidates].map(async ([slug, versionId]) => {
    const draft = await drafts.load(slug)
    return draft ? [{ slug, draft, versionId, key: `${versionId}:${createHash('sha256').update(draft).digest('hex')}` }] : []
  }))).flat()
  const missing = entries.filter(entry => draftComparisons.get(entry.slug)?.key !== entry.key)
  if (missing.length) {
    const texts = new Map((await useStores().catalog.versionTexts(missing.map(entry => entry.versionId))).map(({ id, raw }) => [id, raw]))
    for (const { slug, draft, versionId, key } of missing) {
      const published = texts.get(versionId)
      if (published !== undefined)
        draftComparisons.set(slug, { key, changed: yDocUpdateToMarkdown(draft) !== published })
    }
  }
  return new Set(entries.filter(({ slug, key }) => {
    const comparison = draftComparisons.get(slug)
    return comparison?.key === key && comparison.changed
  }).map(entry => entry.slug))
}

/** What a catalog card shows of a deck's content, read from its markdown. */
interface VersionStats {
  slideCount: number
  titleSlide: TitleSlide
}

interface DeckStats extends VersionStats {
  /** The published version. */
  versionId: number
  /** Latest of the metadata edit and the publish, in milliseconds. */
  updatedAt: number
  /** Last draft save, in milliseconds, which counts for whoever may edit, when the draft differs from the version. */
  draftSavedAt?: number
}

/**
 * What the catalog reads from the markdown of a published version, by version
 * id. A `deck_versions` row is immutable once the boot-time data migrations
 * have run, so an entry stays valid.
 */
const versionStats = new Map<number, VersionStats>()

function readVersionStats(raw: string): VersionStats {
  return {
    slideCount: slideRanges(raw, parserIdFor(splitFrontmatter(raw).data)).length,
    titleSlide: readTitleSlide(raw),
  }
}

/** Slide count, version and dates of every published deck; the markdown is read once per version. */
async function deckStats(): Promise<Map<string, DeckStats>> {
  const { catalog } = useStores()
  const rows = await catalog.publishedDecks()

  const published = new Set(rows.map(row => row.versionId))
  const missing = [...published].filter(id => !versionStats.has(id))
  for (const { id, raw } of await catalog.versionTexts(missing))
    versionStats.set(id, readVersionStats(raw))

  for (const id of versionStats.keys()) {
    if (!published.has(id))
      versionStats.delete(id)
  }
  const publishedSlugs = new Set(rows.map(row => row.slug))
  for (const slug of draftComparisons.keys()) {
    if (!publishedSlugs.has(slug))
      draftComparisons.delete(slug)
  }

  const stats = new Map<string, DeckStats>()
  for (const row of rows) {
    const version = versionStats.get(row.versionId)
    if (!version)
      continue
    stats.set(row.slug, {
      ...version,
      versionId: row.versionId,
      updatedAt: Math.max(row.updatedAt.getTime(), row.publishedAt.getTime()),
      draftSavedAt: row.draftSavedAt?.getTime(),
    })
  }
  return stats
}

function deckPreview(stats: DeckStats | undefined, theme: string): Pick<PresentationListItem, 'preview'> {
  if (!stats)
    return {}
  return { preview: titleSlidePreview(stats.titleSlide, resolveThemeName(theme)) }
}

// A deck never published dates from its draft, which only an editor sees; a
// published deck dates from its draft when the draft differs from the version.
function deckDates(stats: DeckStats | undefined, draftChanged: boolean, unpublishedDraftAt?: number | null): Pick<PresentationListItem, 'slideCount' | 'updatedAt'> {
  if (!stats)
    return unpublishedDraftAt ? { updatedAt: unpublishedDraftAt } : {}
  const draftSavedAt = draftChanged ? stats.draftSavedAt ?? 0 : 0
  return { slideCount: stats.slideCount, updatedAt: Math.max(stats.updatedAt, draftSavedAt) }
}

/**
 * The catalog as one actor may see it — the single access-filtered source of
 * truth shared by GET /api/presentations and GET /api/projects. Every deck is a
 * database row (git content is the exported archive, not a runtime input); a
 * deck's visibility follows the shared `canList` on the actor's role plus any
 * per-deck or project-scoped grant. A deck with no published version is only
 * listed to people who can edit it.
 */
export async function listVisiblePresentations(event: H3Event): Promise<PresentationListItem[]> {
  const actor = await getActor(event)
  const grants = actor.id ? await useGrants().listForUser(actor.id) : new Map()
  // Resolving a deck's theme and background needs the tenant themes registered.
  await loadTenantThemes()

  const privileged = isPrivileged(actor.role)
  const decks = await useDeckMeta().listManaged()
  const shared = privileged ? await useStores().catalog.deckGrantCounts() : undefined
  // The same rule as assertCanEditDeck, so the card's pencil matches what the
  // server accepts.
  const canEdit = (deck: DeckMetaRecord) => mayEdit(actor.role, grants.get(deck.slug), deck.lifecycle)
  const mayShare = (slug: string) => canShare(actor.role, grants.get(slug))
  const stats = await deckStats()
  const changed = await unpublishedChanges(new Map(decks.flatMap((deck) => {
    const versionId = deck.published && canEdit(deck) ? stats.get(deck.slug)?.versionId : undefined
    return versionId === undefined ? [] : [[deck.slug, versionId] as const]
  })))
  const drafts = useDraftStore()
  const unpublishedDrafts = new Map(await Promise.all(decks
    .filter(d => !d.published && canEdit(d))
    .map(async d => [d.slug, await drafts.stamp(d.slug)] as const)))

  return decks
    // A deck with no published version has nothing to serve: only those who can
    // edit it should see it listed.
    .filter(deck => deck.published || canEdit(deck))
    .map(deck => ({
      slug: deck.slug,
      title: deck.title,
      theme: deckThemeName(deck),
      status: deck.status,
      filename: `${deck.slug}.md`,
      project: deck.project,
      unlisted: deck.unlisted,
      alias: deck.alias,
      lifecycle: deck.lifecycle,
      family: deck.family,
      variantLabel: deck.variantLabel,
      supersededBy: deck.supersededBy,
      ...deckDates(stats.get(deck.slug), changed.has(deck.slug), unpublishedDrafts.get(deck.slug)),
      ...deckPreview(stats.get(deck.slug), deckThemeName(deck)),
      ...(canEdit(deck) ? { canEdit: true } : {}),
      ...(changed.has(deck.slug) ? { unpublishedChanges: true } : {}),
      ...(mayShare(deck.slug) ? { canShare: true, hasPassword: Boolean(deck.accessPasswordHash) } : {}),
      ...(privileged
        ? {
            published: deck.published,
            sharedCount: shared?.get(deck.slug) ?? 0,
          }
        : {}),
    } satisfies PresentationListItem))
    .filter(p => canList({
      status: p.status,
      lifecycle: p.lifecycle,
      role: actor.role,
      grant: grants.get(p.slug),
      unlisted: p.unlisted,
    }))
}

/**
 * The project folders one actor may see. Folders are a grouping view over the
 * access-filtered catalog, so they follow the same discoverability rule as
 * decks: an unprivileged actor only sees a folder once it holds at least one
 * deck they can list. Privileged actors see every folder, including empty ones
 * (e.g. a project just created, before it has any deck). The ungrouped bucket
 * has no project row and is never returned here.
 */
export async function listVisibleProjects(event: H3Event): Promise<Project[]> {
  const [actor, projects, visible] = await Promise.all([
    getActor(event),
    projectDirectory.list(),
    listVisiblePresentations(event),
  ])
  if (isPrivileged(actor.role)) {
    const shared = await useStores().catalog.projectGrantCounts()
    return projects.map(p => ({ ...p, sharedCount: shared.get(p.slug) ?? 0 }))
  }

  // A folder grant applies to the whole folder (creating a deck inside it
  // included); the UI shows the create button from it.
  const mine = actor.id ? await useProjectPermissionStore().listForUser(actor.id) : new Map()
  const populated = new Set(
    visible.map(p => p.project).filter((slug): slug is string => !!slug && slug !== UNGROUPED_PROJECT),
  )
  return projects
    .filter(p => populated.has(p.slug) || mine.has(p.slug))
    .map(p => (mine.has(p.slug) ? { ...p, myGrant: mine.get(p.slug) } : p))
}

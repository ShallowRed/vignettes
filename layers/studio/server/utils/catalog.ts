import type { DeckPreview, PresentationListItem, TitleSlide } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { H3Event } from 'h3'
import { canList, isPrivileged, mayEdit } from '#shared/access'
import { yDocUpdateToMarkdown } from '#shared/collab/ydoc'
import { readTitleSlide, UNGROUPED_PROJECT } from '#shared/presentations'
import { parserIdFor, splitFrontmatter } from '@vignettes/core/deck'
import { resolveSlideBackground } from '@vignettes/core/render'
import { getDefaultTheme, resolveThemeName } from '@vignettes/core/theme'
import { slideRanges } from '@vignettes/nuxt/runtime/utils/slide-map.ts'
import { count, eq, gte } from 'drizzle-orm'
import { deckDrafts, deckPermissions, decks, deckVersions, projectPermissions } from '../db/schema'
import { getActor } from './actor'
import { useDraftStore } from './collab'
import { useDb } from './db'
import { projectDirectory, useDbContent, useDeckMeta, useGrants, useProjectPermissionStore } from './sources'
import { loadTenantThemes } from './themes'

/** slug → number of grants, for the privileged "shared" badges (one query). */
function grantCounts(table: typeof deckPermissions | typeof projectPermissions, column: 'deckSlug' | 'projectSlug'): Map<string, number> {
  const col = column === 'deckSlug'
    ? (table as typeof deckPermissions).deckSlug
    : (table as typeof projectPermissions).projectSlug
  return new Map(
    useDb().select({ slug: col, n: count() }).from(table).groupBy(col).all().map(r => [r.slug, r.n]),
  )
}

/**
 * Decks whose draft holds changes the published version does not. Drafts saved
 * since the publish are the candidates (one query); a text comparison confirms
 * them, because a draft seeded from the published text is newer without differing.
 */
export async function unpublishedChanges(candidates: Set<string>): Promise<Set<string>> {
  if (candidates.size === 0)
    return new Set()
  const rows = useDb().select({ slug: deckDrafts.deckSlug }).from(deckDrafts).innerJoin(decks, eq(decks.slug, deckDrafts.deckSlug)).innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId)).where(gte(deckDrafts.updatedAt, deckVersions.publishedAt)).all()
  const changed = new Set<string>()
  for (const { slug } of rows) {
    if (!candidates.has(slug))
      continue
    const [draft, published] = await Promise.all([useDraftStore().load(slug), useDbContent().source.load(slug)])
    if (draft && published && yDocUpdateToMarkdown(draft) !== published.raw)
      changed.add(slug)
  }
  return changed
}

interface DeckStats {
  slideCount: number
  /** Latest of the metadata edit and the publish, in milliseconds. */
  updatedAt: number
  /** Last draft save, in milliseconds, which counts only for whoever may edit. */
  draftSavedAt?: number
  titleSlide: TitleSlide
}

/** Slide count and dates of every published deck, from one query. */
function deckStats(): Map<string, DeckStats> {
  const rows = useDb()
    .select({ slug: decks.slug, updatedAt: decks.updatedAt, raw: deckVersions.raw, publishedAt: deckVersions.publishedAt, draftSavedAt: deckDrafts.updatedAt })
    .from(decks)
    .innerJoin(deckVersions, eq(deckVersions.id, decks.publishedVersionId))
    .leftJoin(deckDrafts, eq(deckDrafts.deckSlug, decks.slug))
    .all()
  return new Map(rows.map(row => [row.slug, {
    slideCount: slideRanges(row.raw, parserIdFor(splitFrontmatter(row.raw).data)).length,
    updatedAt: Math.max(row.updatedAt.getTime(), row.publishedAt.getTime()),
    draftSavedAt: row.draftSavedAt?.getTime(),
    titleSlide: readTitleSlide(row.raw),
  }]))
}

function deckPreview(stats: DeckStats | undefined, theme: string): Pick<PresentationListItem, 'preview'> {
  if (!stats)
    return {}
  const { title, pretitle, subtitle, headingLevel, backgroundImage, backgrounds } = stats.titleSlide
  const resolved = resolveThemeName(theme)
  const preview: DeckPreview = {
    theme: resolved,
    title,
    pretitle,
    subtitle,
    headingLevel,
    background: resolveSlideBackground({ headingLevel: headingLevel ?? 'h1', backgroundImage }, resolved, backgrounds),
  }
  return { preview }
}

function deckDates(stats: DeckStats | undefined, canEdit: boolean): Pick<PresentationListItem, 'slideCount' | 'updatedAt'> {
  if (!stats)
    return {}
  const draftSavedAt = canEdit ? stats.draftSavedAt ?? 0 : 0
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
  const grants = actor.id
    ? await useGrants().listForUser(actor.id).catch(() => new Map())
    : new Map()
  // Resolving a deck's theme and background needs the tenant themes registered.
  await loadTenantThemes()
  const fallbackTheme = getDefaultTheme()

  const privileged = isPrivileged(actor.role)
  const decks = await useDeckMeta().listManaged()
  const shared = privileged ? grantCounts(deckPermissions, 'deckSlug') : undefined
  // The same rule as assertCanEditDeck, so the card's pencil matches what the
  // server accepts.
  const canEdit = (slug: string) => mayEdit(actor.role, grants.get(slug))
  const changed = await unpublishedChanges(new Set(decks.filter(d => d.published && canEdit(d.slug)).map(d => d.slug)))
  const stats = deckStats()

  return decks
    // A deck with no published version has nothing to serve: only those who can
    // edit it should see it listed.
    .filter(deck => deck.published || canEdit(deck.slug))
    .map(deck => ({
      slug: deck.slug,
      title: deck.title,
      theme: deck.theme || fallbackTheme,
      status: deck.status,
      filename: `${deck.slug}.md`,
      project: deck.project,
      unlisted: deck.unlisted,
      alias: deck.alias,
      lifecycle: deck.lifecycle,
      family: deck.family,
      variantLabel: deck.variantLabel,
      supersededBy: deck.supersededBy,
      ...deckDates(stats.get(deck.slug), canEdit(deck.slug)),
      ...deckPreview(stats.get(deck.slug), deck.theme || fallbackTheme),
      ...(canEdit(deck.slug) ? { canEdit: true } : {}),
      ...(changed.has(deck.slug) ? { unpublishedChanges: true } : {}),
      ...(privileged
        ? {
            published: deck.published,
            hasPassword: Boolean(deck.accessPasswordHash),
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
    const shared = grantCounts(projectPermissions, 'projectSlug')
    return projects.map(p => ({ ...p, sharedCount: shared.get(p.slug) ?? 0 }))
  }

  // A folder grant applies to the whole folder (creating a deck inside it
  // included); the UI shows the create button from it.
  const mine = actor.id
    ? await useProjectPermissionStore().listForUser(actor.id).catch(() => new Map())
    : new Map()
  const populated = new Set(
    visible.map(p => p.project).filter((slug): slug is string => !!slug && slug !== UNGROUPED_PROJECT),
  )
  return projects
    .filter(p => populated.has(p.slug) || mine.has(p.slug))
    .map(p => (mine.has(p.slug) ? { ...p, myGrant: mine.get(p.slug) } : p))
}

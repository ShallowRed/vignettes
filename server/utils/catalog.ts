import type { PresentationListItem } from '#shared/presentations'
import type { Project } from '#shared/projects'
import type { H3Event } from 'h3'
import { canList, isPrivileged } from '#shared/access'
import { UNGROUPED_PROJECT } from '#shared/presentations'
import { getActor } from './actor'
import { projectDirectory, useDeckMeta, useGrants } from './sources'

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

  const privileged = isPrivileged(actor.role)
  const decks = await useDeckMeta().listManaged()

  return decks
    // A deck with no published version has nothing to serve: only those who can
    // edit it should see it listed.
    .filter(deck => deck.published || privileged)
    .map(deck => ({
      slug: deck.slug,
      title: deck.title,
      theme: deck.theme || 'dsfr',
      status: deck.status,
      filename: `${deck.slug}.md`,
      project: deck.project,
      unlisted: deck.unlisted,
      alias: deck.alias,
      lifecycle: deck.lifecycle,
      ...(privileged ? { published: deck.published } : {}),
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
  if (isPrivileged(actor.role))
    return projects

  const populated = new Set(
    visible.map(p => p.project).filter((slug): slug is string => !!slug && slug !== UNGROUPED_PROJECT),
  )
  return projects.filter(p => populated.has(p.slug))
}

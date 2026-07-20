import { isPrivileged } from '#shared/access'
import { getActorRole } from '../../../utils/actor'
import { useDeckMeta, useProjectStore } from '../../../utils/sources'

/**
 * GET /api/admin/trash — the corbeille: trashed projects (each with its deck
 * count) and standalone trashed decks. Decks trashed *with* a project are omitted
 * here — they are represented by, and restored/purged with, their project entry.
 * Privileged only.
 */
export default defineEventHandler(async (event) => {
  const role = await getActorRole(event)
  if (!isPrivileged(role)) {
    throw createError({
      statusCode: role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner or editor role required',
    })
  }

  const [projects, allDecks] = await Promise.all([
    useProjectStore().listTrashed(),
    useDeckMeta().listTrashed(),
  ])
  const trashedProjects = new Set(projects.map(p => p.slug))
  const decks = allDecks
    .filter(d => !(d.project && trashedProjects.has(d.project)))
    .map(d => ({ slug: d.slug, title: d.title, project: d.project, status: d.status }))

  return { projects, decks }
})

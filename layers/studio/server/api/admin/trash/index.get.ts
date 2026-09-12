import type { TrashListing } from '#shared/trash'
/**
 * GET /api/admin/trash — the corbeille: trashed projects (each with its deck
 * count) and standalone trashed decks. Decks trashed *with* a project are omitted
 * here — they are represented by, and restored/purged with, their project entry.
 * Privileged only.
 */
import { assertPrivileged } from '../../../utils/access'

import { useDeckMeta, useProjectStore } from '../../../utils/sources'

export default defineEventHandler(async (event): Promise<TrashListing> => {
  await assertPrivileged(event)

  const [projects, allDecks] = await Promise.all([
    useProjectStore().listTrashed(),
    useDeckMeta().listTrashed(),
  ])
  const trashedProjects = new Set(projects.map(p => p.slug))
  const decks = allDecks
    .filter(d => !(d.project && trashedProjects.has(d.project)))
    .map(d => ({ slug: d.slug, title: d.title, project: d.project, status: d.status }))

  return {
    // `Project.title` is optional at the type level; the store always sets it.
    projects: projects.map(p => ({ slug: p.slug, title: p.title ?? p.slug, color: p.color ?? null, deckCount: p.deckCount })),
    decks,
  }
})

import type { PresentationListItem } from '#shared/presentations'
import { canList, isPrivileged } from '#shared/access'
import { getActor } from '../utils/actor'
import { useDeckMeta, usePermissionStore } from '../utils/sources'

/**
 * Catalog endpoint. Every deck is a database row now (the git content is the
 * exported archive, not a runtime input); visibility is decided by the shared
 * `canList` on the actor's role plus any per-deck grant. A deck with no published
 * version yet is only listed to people who can edit it.
 */
export default defineEventHandler(async (event): Promise<PresentationListItem[]> => {
  const actor = await getActor(event)
  const grants = actor.id
    ? await usePermissionStore().listForUser(actor.id).catch(() => new Map())
    : new Map()

  try {
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
  catch (error) {
    console.error('Error loading presentations:', error)
    return []
  }
})

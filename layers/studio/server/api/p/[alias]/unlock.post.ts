import { gateOptionsOf, unlockDeck } from '../../../utils/access'
import { deckDirectory, publishedSource } from '../../../utils/sources'

/**
 * POST /api/p/:alias/unlock: the password of the semi-private deck an alias
 * names, in the body `{ password }`. A deck without a published version answers
 * 404, as `GET /api/p/:alias` does.
 */
export default defineEventHandler(async (event) => {
  const alias = getRouterParam(event, 'alias')
  const resolved = alias ? await deckDirectory.resolveAlias(alias) : null
  const entry = resolved && await publishedSource.load(resolved.slug) ? resolved : null
  const gate = entry ? await gateOptionsOf(entry.slug, { lifecycle: entry.lifecycle, folderStatus: entry.access }) : null
  if (!gate)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return await unlockDeck(event, gate)
})

import { safeRedirectPath } from '#shared/access'
import { isDeckPage } from '#shared/origins'
import { requestSide } from '../utils/deck-origin'
import { redeemDeckTicket } from '../utils/deck-pass'
import { deckOfPagePath } from '../utils/sources'

/**
 * `/deck-pass?ticket=…&to=<deck page>` on the deck origin: sets the view pass of
 * the deck the ticket names, then opens the page. A ticket that is spent,
 * expired or for another deck opens the page without a pass. The address
 * carries the ticket: no cache keeps the answer, and no Referer repeats it.
 */
export default defineEventHandler(async (event) => {
  if (requestSide(event) !== 'decks')
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  setResponseHeader(event, 'Referrer-Policy', 'no-referrer')
  const { ticket, to } = getQuery(event)
  const target = safeRedirectPath(to)
  if (!isDeckPage(target))
    return sendRedirect(event, '/', 302)
  const slug = await deckOfPagePath(target)
  if (slug && typeof ticket === 'string')
    await redeemDeckTicket(event, ticket, slug)
  return sendRedirect(event, target, 302)
})

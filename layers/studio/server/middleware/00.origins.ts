import type { H3Event } from 'h3'
import { isDeckPage, routeSide } from '#shared/origins'
import { decideDeckAccess, gateOptionsOf } from '../utils/access'
import { getActor } from '../utils/actor'
import { serverConfig } from '../utils/config'
import { requestSide } from '../utils/deck-origin'
import { mintDeckTicket } from '../utils/deck-pass'
import { deckOfPagePath } from '../utils/sources'
import { useUserStore } from '../utils/users'

const READ = new Set(['GET', 'HEAD'])

/**
 * On an instance that serves its decks apart from the studio, each origin
 * answers its own routes (`shared/origins`). The deck origin sends a page of
 * the studio to the studio, and refuses any other request of the studio; the
 * studio sends a deck page to the deck origin, with a ticket for a signed-in
 * person who may read the deck. The redirect is temporary: its target follows
 * the session.
 */
export default defineEventHandler(async (event) => {
  const side = requestSide(event)
  // The page reads it through `useOriginSide`.
  event.context.originSide = side
  if (side === 'single')
    return
  const { studio, decks } = serverConfig().origins
  if (side === 'decks') {
    if (routeSide(event.method, event.path) !== 'studio')
      return
    if (!READ.has(event.method))
      throw createError({ statusCode: 404, statusMessage: 'Not found' })
    return sendRedirect(event, `${studio}${event.path}`, 302)
  }
  if (!READ.has(event.method) || !isDeckPage(event.path))
    return
  const ticket = await ticketFor(event)
  return sendRedirect(event, ticket
    ? `${decks}/deck-pass?${new URLSearchParams({ ticket, to: event.path })}`
    : `${decks}${event.path}`, 302)
})

/**
 * A ticket for the deck of this page, when the request is a navigation the
 * person made in the studio or from the address bar: a page of the deck origin
 * can make the browser open the studio, from the same site or through another
 * one, and must not obtain a pass that way.
 */
async function ticketFor(event: H3Event): Promise<string | null> {
  const navigation = getRequestHeader(event, 'sec-fetch-mode') === 'navigate'
    && getRequestHeader(event, 'sec-fetch-dest') === 'document'
    && ['same-origin', 'none'].includes(getRequestHeader(event, 'sec-fetch-site') ?? '')
  const actor = await getActor(event)
  if (!navigation || !actor.id || !actor.login)
    return null
  const slug = await deckOfPagePath(event.path)
  const gate = slug ? await gateOptionsOf(slug) : null
  if (!slug || !gate || (await decideDeckAccess(event, gate)).outcome !== 'allow')
    return null
  const account = await useUserStore().getAccount(actor.id)
  return account ? await mintDeckTicket({ id: actor.id, login: actor.login, sessionVersion: account.sessionVersion }, slug) : null
}

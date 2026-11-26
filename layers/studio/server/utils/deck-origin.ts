import type { RequestSide } from '#shared/origins'
import type { H3Event } from 'h3'
import { loginHref, safeRedirectPath } from '#shared/access'
import { isDeckPage } from '#shared/origins'
import { serverConfig } from './config'

// The one reader of the host a request reaches: the `Host` header, which the
// proxy passes as the browser wrote it. `X-Forwarded-Host` is never read.

/**
 * The origin the browser called, `Host` with the protocol of the request. A
 * `Host` that is not a valid host, as one with a space, is the client's error.
 */
export function requestOrigin(event: H3Event): string {
  try {
    return getRequestURL(event).origin
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request: the Host header is not a valid host' })
  }
}

/** The origin a WebSocket upgrade reaches, which crossws builds from `Host`; a 400 for a `Host` that is not a valid host. */
export function upgradeOrigin(request: Pick<Request, 'url'>): string {
  try {
    return new URL(request.url).origin
  }
  catch {
    throw new Response('Bad Request: the Host header is not a valid host', { status: 400 })
  }
}

/**
 * The side of an origin, a request's or an upgrade's. Without both origins, as
 * a development server may run, one origin serves everything.
 */
export function sideOfOrigin(origin: string): RequestSide {
  const { decks, studio } = serverConfig().origins
  if (!decks || !studio)
    return 'single'
  return new URL(origin).host === new URL(decks).host ? 'decks' : 'studio'
}

/** The side of the origin a request reaches. */
export function requestSide(event: H3Event): RequestSide {
  const { decks, studio } = serverConfig().origins
  return decks && studio ? sideOfOrigin(requestOrigin(event)) : 'single'
}

/**
 * Where a login sends the person: the page they asked for, and for a deck page
 * on an instance that serves its decks apart, the login page, whose button opens
 * the deck with a ticket. The return from the provider is a navigation from
 * another site, which the studio gives no ticket.
 */
export function afterLoginPath(event: H3Event, intended: unknown): string {
  const path = safeRedirectPath(intended)
  return requestSide(event) === 'studio' && isDeckPage(path) ? loginHref(path) : path
}

/**
 * The page views an instance sends to Umami, through its documented sending API
 * (https://docs.umami.is/docs/api/sending-stats). The documentation site imports
 * this file by its path, so it uses no alias and no framework import.
 */

import { pathnameOf } from '../../shared/origins/routes'

/** `count` sends the route template, `deck` leaves the page to `StudioDeck`, `skip` sends nothing. */
export type PageViewKind = 'count' | 'deck' | 'skip'

/** Every page of the studio, by its route template, written out. */
export const PAGE_VIEW_PAGES: Record<string, PageViewKind> = {
  '/': 'count',
  '/confidentialite': 'count',
  '/edit/:slug': 'count',
  '/login': 'count',
  '/p/:alias': 'deck',
  '/projects/:slug': 'count',
  '/recette': 'skip',
  '/slides/:slug': 'deck',
  '/tokens': 'count',
  '/trash': 'count',
  '/unlock/:slug': 'skip',
  '/users': 'count',
}

export interface PageViewVisit {
  website: string
  hostname: string
  language: string
  screen: string
  /** The origin of the page, compared with the referrer. */
  origin: string
  /** The referrer of the document, empty after the first page view of the document. */
  referrer: string
}

export interface PageViewEvent {
  type: 'event'
  payload: {
    website: string
    hostname: string
    language: string
    screen: string
    url: string
    title: string
    referrer: string
  }
}

/** The origin of an address, empty when it has none, as `android-app://…` has. */
function originOf(url: string): string {
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? '' : origin
  }
  catch {
    return ''
  }
}

export function pageViewEvent(page: { url: string, title: string }, visit: PageViewVisit): PageViewEvent {
  const { origin, referrer, ...sent } = visit
  const referrerOrigin = originOf(referrer)
  return {
    type: 'event',
    payload: {
      ...sent,
      url: pathnameOf(page.url),
      title: page.title,
      referrer: referrerOrigin === origin ? '' : referrerOrigin,
    },
  }
}

let lastPath: string | undefined

/** Whether a navigation reaches another path than the previous one. Nuxt navigates twice to the first page. */
export function startsPageView(path: string): boolean {
  const starts = path !== lastPath
  lastPath = path
  return starts
}

let referrerSent = false

/** The visit of the current document: its referrer goes with its first page view. */
export function currentVisit(website: string): PageViewVisit {
  const referrer = referrerSent ? '' : document.referrer
  referrerSent = true
  return {
    website,
    hostname: location.hostname,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    origin: location.origin,
    referrer,
  }
}

/** A failed request raises no error. */
export function sendPageView(host: string, event: PageViewEvent): void {
  fetch(`${host.replace(/\/$/, '')}/api/send`, {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch(() => {})
}

export interface UmamiConfig {
  host: string
  studioWebsiteId: string
  decksWebsiteId: string
}

/** Sends the view of a studio page, under its template, when the page counts. */
export function trackStudioPage(config: UmamiConfig, routePath: string | undefined): void {
  if (!config.host || !config.studioWebsiteId || !routePath)
    return
  // Nuxt writes the path of a route with parentheses: `/edit/:slug()`.
  const template = routePath.replace(/\(\)/g, '')
  if (PAGE_VIEW_PAGES[template] === 'count')
    sendPageView(config.host, pageViewEvent({ url: template, title: template }, currentVisit(config.studioWebsiteId)))
}

export interface DeckView {
  publicDeck: boolean
  draft: boolean
  speakerViewFrame: boolean
  /** The query of the page. */
  search: string
}

/** A view of a deck counts for a public deck read as its visitors read it. */
export function deckViewCounts({ publicDeck, draft, speakerViewFrame, search }: DeckView): boolean {
  return publicDeck && !draft && !speakerViewFrame && !/print-pdf/i.test(search)
}

/** Sends the view of a deck, with its path and its title. */
export function trackDeckView(config: UmamiConfig, title: string): void {
  if (config.host && config.decksWebsiteId)
    sendPageView(config.host, pageViewEvent({ url: location.pathname, title }, currentVisit(config.decksWebsiteId)))
}

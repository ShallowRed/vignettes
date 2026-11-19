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
  '/recette/branche': 'skip',
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

/** The visit of the current document, without its referrer. */
function documentVisit(website: string): PageViewVisit {
  return {
    website,
    hostname: location.hostname,
    language: navigator.language,
    screen: `${screen.width}x${screen.height}`,
    origin: location.origin,
    referrer: '',
  }
}

/** The visit of the current document: its referrer goes with its first page view. */
export function currentVisit(website: string): PageViewVisit {
  const referrer = referrerSent ? '' : document.referrer
  referrerSent = true
  return { ...documentVisit(website), referrer }
}

/** The body of an event of the studio, whose data its catalog has accepted. */
export interface NamedEvent {
  type: 'event'
  payload: PageViewEvent['payload'] & {
    name: string
    data: Readonly<Record<string, string | boolean>>
  }
}

/**
 * An event of the studio, sent from a page under its route template, with no
 * referrer: the referrer of the visit stays for its first page view.
 */
export function studioEventPayload(name: string, data: NamedEvent['payload']['data'], template: string, website: string): NamedEvent {
  const { origin: _, ...sent } = documentVisit(website)
  return { type: 'event', payload: { ...sent, url: template, title: template, name, data } }
}

/** A failed request raises no error. */
export function sendToUmami(host: string, event: PageViewEvent | NamedEvent): void {
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

/** The template of a route path: Nuxt writes `/edit/:slug()`. */
export function routeTemplate(routePath: string): string {
  return routePath.replace(/\(\)/g, '')
}

/** The Umami website of a page of the studio, by its template: none for a page that sends nothing. */
export function pageSite(config: UmamiConfig, template: string): string | undefined {
  const kind = PAGE_VIEW_PAGES[template]
  const website = kind === 'count' ? config.studioWebsiteId : kind === 'deck' ? config.decksWebsiteId : ''
  return config.host && website ? website : undefined
}

/** Sends the view of a studio page, under its template, when the page counts. */
export function trackStudioPage(config: UmamiConfig, routePath: string | undefined): void {
  if (!routePath)
    return
  const template = routeTemplate(routePath)
  const website = PAGE_VIEW_PAGES[template] === 'count' ? pageSite(config, template) : undefined
  if (website)
    sendToUmami(config.host, pageViewEvent({ url: template, title: template }, currentVisit(website)))
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
    sendToUmami(config.host, pageViewEvent({ url: location.pathname, title }, currentVisit(config.decksWebsiteId)))
}

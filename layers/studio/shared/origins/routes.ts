/**
 * Which origin a request reaches, as the server decides it: `decks` for the
 * host of the deck origin, `studio` for any other host, `single` on an instance
 * that serves everything from one origin.
 */
export type RequestSide = 'studio' | 'decks' | 'single'

/**
 * Where a route answers on an instance that serves its decks from an origin of
 * their own: `deck` for the pages of a deck, which the studio redirects to the
 * deck origin; `both` for what a deck page reads, on either origin; `studio`
 * for every other route, which the deck origin redirects to the studio.
 */
export type RouteSide = 'deck' | 'both' | 'studio'

const READ = ['GET', 'HEAD']

interface RouteRule {
  pattern: RegExp
  side: Exclude<RouteSide, 'studio'>
  methods: string[]
}

const SEGMENT = '[^/]+'

/** The pages of a deck: the kind of page, then the rest of its path. */
const DECK_PAGE = /^\/(slides|p|unlock|frozen)\/(.+)$/

/**
 * The routes of the deck origin. A route left out answers on the studio alone:
 * a new route stays there until it is listed here.
 */
const RULES: RouteRule[] = [
  // The pages of a deck, and the route that turns a ticket into a view pass.
  { pattern: DECK_PAGE, side: 'deck', methods: READ },
  { pattern: /^\/deck-pass$/, side: 'deck', methods: READ },
  // The deck a page reads, and the password of a semi-private deck.
  { pattern: new RegExp(`^/api/presentations/${SEGMENT}(?:/viewer)?$`), side: 'both', methods: READ },
  { pattern: new RegExp(`^/api/p/${SEGMENT}$`), side: 'both', methods: READ },
  { pattern: new RegExp(`^/api/(?:presentations|p)/${SEGMENT}/unlock$`), side: 'both', methods: ['POST'] },
  // The session a page shows, which the deck origin answers as signed out.
  { pattern: /^\/api\/_?auth\/session$/, side: 'both', methods: READ },
  // The files and the module routes a deck page loads.
  { pattern: /^\/(?:themes|images|media|backgrounds|pictograms)\/./, side: 'both', methods: READ },
  { pattern: /^\/(?:_og|_i18n|__nuxt_island)\/./, side: 'both', methods: READ },
  { pattern: /^\/api\/_nuxt_icon\/./, side: 'both', methods: READ },
  { pattern: /^\/api\/_mdc\/highlight$/, side: 'both', methods: READ },
  { pattern: /^\/__nuxt_error$/, side: 'both', methods: READ },
]

/** A path or an address without its query and its fragment. */
export function pathnameOf(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? ''
}

/** The side of a request, from its method and its path, with or without its query. */
export function routeSide(method: string, path: string): RouteSide {
  const pathname = pathnameOf(path)
  const rule = RULES.find(rule => rule.pattern.test(pathname) && rule.methods.includes(method.toUpperCase()))
  return rule?.side ?? 'studio'
}

export interface DeckPage {
  page: 'slides' | 'p' | 'unlock' | 'frozen'
  /** The path after the kind of page, still encoded: a slug, an alias, or a bundle and its file. */
  rest: string
}

/** The deck page a path names, or `null`: `/deck-pass` is not one. */
export function deckPage(path: string): DeckPage | null {
  const match = DECK_PAGE.exec(pathnameOf(path))
  return match ? { page: match[1] as DeckPage['page'], rest: match[2]! } : null
}

export function isDeckPage(path: string): boolean {
  return deckPage(path) !== null
}

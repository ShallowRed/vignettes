/**
 * The addresses a deck may give, for a link, a frame, an image or its Storybook.
 * The schema, the parsers, the renderer and the editor apply this one rule. A
 * deck places its addresses in the page of the studio, so a scheme that runs
 * script there (`javascript:`, `vbscript:`, a `data:` document) and an address
 * that starts with `//`, which names another host, are refused.
 */

/** `page`: a link, a frame, or a media that may be a page. `image`: an image only, which also takes a `data:image` URL. */
export type DeckUrlKind = 'page' | 'image'

/** The message of the schema and of the editor when an address is refused. */
export const DECK_URL_MESSAGE = 'Expected an http:// or https:// address, or a path on this site'

const SCHEME_RE = /^([a-z][a-z\d+.-]*):/i
const DATA_IMAGE_RE = /^data:image\/(?:avif|gif|jpeg|png|svg\+xml|webp)[;,]/i

/** The address as the URL parser of a browser reads it: tabs and newlines dropped, control characters and spaces trimmed. */
function parsedForm(value: string): string {
  const url = value.replace(/[\t\n\r]/g, '')
  let start = 0
  let end = url.length
  while (start < end && url.charCodeAt(start) <= 0x20)
    start++
  while (end > start && url.charCodeAt(end - 1) <= 0x20)
    end--
  return url.slice(start, end)
}

/**
 * Whether `value` is an address a deck may give: an `http:` or `https:` URL, or
 * a path, a query or a fragment of the site that shows the deck.
 */
export function isDeckUrl(value: unknown, kind: DeckUrlKind = 'page'): value is string {
  if (typeof value !== 'string')
    return false
  const url = parsedForm(value)
  if (/^[/\\]{2}/.test(url))
    return false
  const scheme = SCHEME_RE.exec(url)?.[1]?.toLowerCase()
  if (!scheme)
    return true
  if (scheme === 'http' || scheme === 'https')
    return URL.canParse(url)
  return kind === 'image' && DATA_IMAGE_RE.test(url)
}

/**
 * The hosts a deck may load a frame, an image or a media from over `http:`:
 * the presenter's machine, such as a Storybook in development. The policy of
 * the studio's pages takes every other host over `https:` only.
 */
export const LOCAL_HTTP_HOSTS: readonly string[] = ['localhost', '127.0.0.1']

/**
 * Whether the page of a deck refuses to load `value` as a frame, an image or a
 * media: an `http:` address of a host outside `LOCAL_HTTP_HOSTS`. A link to it
 * opens.
 */
export function isRefusedEmbedUrl(value: unknown): boolean {
  if (typeof value !== 'string')
    return false
  const url = parsedForm(value)
  if (!/^http:/i.test(url) || !URL.canParse(url))
    return false
  return !LOCAL_HTTP_HOSTS.includes(new URL(url).hostname)
}

/**
 * The paths of the site that serve a file an account uploaded: `/media/` of the
 * studio. The other files of the site come from the application, its content
 * space and its frozen bundles, which the operator publishes.
 */
export const UPLOADED_FILE_PATHS: readonly string[] = ['/media/']

/**
 * Whether `src`, read from a page of `origin`, is a file an account uploaded on
 * that site. An address that does not parse counts as one.
 */
export function isUploadedFile(src: string, origin: string): boolean {
  try {
    const url = new URL(src, origin)
    if (url.origin !== new URL(origin).origin)
      return false
    // A server may decode the path before it routes it.
    const path = decodeURIComponent(url.pathname).toLowerCase()
    return UPLOADED_FILE_PATHS.some(prefix => path.startsWith(prefix))
  }
  catch {
    return true
  }
}

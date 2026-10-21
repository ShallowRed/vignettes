import { LOCAL_HTTP_HOSTS } from '@vignettes/core/deck'

/**
 * The directives of every response. The studio frames its own pages: to let
 * another site frame a deck, add its origin to `frame-ancestors` here.
 */
const BASE_DIRECTIVES = [
  'frame-ancestors \'self\'',
  'base-uri \'self\'',
  'object-src \'none\'',
  'form-action \'self\'',
]

/**
 * The headers of every response, set by the `/**` route rule. A rendered page
 * replaces this `Content-Security-Policy` with `pagePolicy`, and a route that
 * serves user files with a narrower one.
 */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': BASE_DIRECTIVES.join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

/** One year, the value the HSTS preload list asks for. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000'

/**
 * Reveal's speaker view writes its page, and its one inline script, into a
 * blank window that takes the policy of the deck. The hash follows the speaker
 * view page held in `reveal.js/plugin/notes/notes.esm.js`, which a test reads.
 */
export const SPEAKER_VIEW_SCRIPT_HASH = 'sha256-wfrJpa7dmlxqHmakgJIolYIQ+LOJmVS3HKfvdaO3GDE='

/**
 * A deck may embed a page, an image or a video served on the presenter's
 * machine, such as a Storybook in development. The editor warns about the
 * other `http:` addresses (`isRefusedEmbedUrl`).
 */
const LOCAL = LOCAL_HTTP_HOSTS.map(host => `http://${host}:*`).join(' ')

/**
 * The policy of a rendered page. A deck embeds any https page (`::Iframe`, a
 * Storybook story) and any https image or video, and the editor previews the
 * deck as it is typed, in the page the studio loaded first: the frames, images
 * and media accept any https origin. The scripts of the page are the build's
 * and the inline ones the renderer writes, which carry the nonce of the
 * response. zod tries `new Function` when it builds its first object schema,
 * which `#shared/access` does as its module loads, before any plugin could set
 * `jitless`: hence `'unsafe-eval'`. Without it, zod catches the refused probe
 * and parses without its compiled path, and every page reports a violation.
 */
export function pagePolicy(nonce: string): string {
  return [
    'default-src \'self\'',
    `script-src 'self' 'nonce-${nonce}' '${SPEAKER_VIEW_SCRIPT_HASH}' 'unsafe-eval'`,
    'style-src \'self\' \'unsafe-inline\'',
    `img-src 'self' data: blob: https: ${LOCAL}`,
    'font-src \'self\' data:',
    `media-src 'self' blob: https: ${LOCAL}`,
    `frame-src 'self' https: ${LOCAL}`,
    'connect-src \'self\'',
    'worker-src \'self\' blob:',
    ...BASE_DIRECTIVES,
  ].join('; ')
}

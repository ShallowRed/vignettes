import type { RevealConfig } from '../deck/schema.ts'
import { isUploadedFile } from '../deck/urls.ts'

// Shared render helpers for the live composable and the frozen bundle: Reveal
// defaults, the iframe sandbox policy, and asset-URL rebasing.

// Per-deck `reveal:` frontmatter merges over these via mergeRevealConfig.
export const DEFAULT_REVEAL_CONFIG: RevealConfig = {
  hash: true,
  slideNumber: 'c/t',
  embedded: true,
  margin: 0.1,
  minScale: 0.2,
  maxScale: 2.0,
  // The theme kit places the content of a slide (`:layout{align}`); a deck
  // cannot set `center`, which would move the slide itself.
  center: false,
  controls: true,
  progress: true,
  keyboard: true,
  touch: true,
  loop: false,
  fragments: true,
  help: true,
  showNotes: false,
  autoPlayMedia: null,
  // Reveal loads the frames of a slide when the slide is shown: a frame that
  // takes the focus once loaded takes it on its own slide only.
  preloadIframes: false,
  autoSlide: 0,
  // The scroll view of a phone stacks the slides at the width of the screen.
  scrollLayout: 'compact',
}

export function mergeRevealConfig(config?: Partial<RevealConfig>): RevealConfig {
  return { ...DEFAULT_REVEAL_CONFIG, ...(config || {}) }
}

// `sandbox` value for embedded story/app iframes of another site. Each flag lets
// the embedded page do one thing:
// - `allow-scripts`: a story or an app runs its script;
// - `allow-same-origin`: the page keeps the origin of its site, so its storage,
//   its cookies and the requests Storybook makes for its own index work;
// - `allow-forms`: an app submits its forms;
// - `allow-popups allow-popups-to-escape-sandbox`: a link that opens a new tab
//   opens an ordinary one;
// - `allow-storage-access-by-user-activation`: an app asks for its cookies on a click.
// It OMITS `allow-top-navigation` (and its by-user-activation variant): otherwise
// an embedded app calling window.parent.location.assign(...) would replace the
// whole slides window. Flags propagate to nested iframes; plain <a href> still works.
export const EMBED_SANDBOX
  = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation'

/**
 * The sandbox of a frame that shows `src` in a page of `origin`. A file an
 * account uploaded to the site (`isUploadedFile`) loses `allow-same-origin`:
 * with `allow-scripts`, a script it carries could reach the deck's page and
 * remove its own sandbox. It runs in an opaque origin.
 */
export function embedSandbox(src: string, origin: string): string {
  return isUploadedFile(src, origin) ? EMBED_SANDBOX.replace(' allow-same-origin', '') : EMBED_SANDBOX
}

// The deck's address stays out of the requests of its frames: another site
// receives the origin alone, which a video host checks before it plays.
export const EMBED_REFERRER_POLICY = 'strict-origin-when-cross-origin' as const

// Directories whose root-absolute URLs a self-contained bundle rebases to a
// location-relative prefix.
export const REBASEABLE_ASSET_DIRS = [
  '_storybook',
  'vitrine',
  'fonts',
  'images',
  'backgrounds',
  'geojson',
  'icons',
  'themes',
  'documents',
  'manifests',
] as const

// Rebase root-absolute asset URLs (`="/images/x.png"` → `="<prefix>/images/x.png"`),
// keyed on the path target not the attribute name, so src/href/data-preview-link
// are all covered.
export function rebaseAssetUrls(html: string, prefix: string): string {
  const dirs = REBASEABLE_ASSET_DIRS.join('|')
  const re = new RegExp(`(=")/((?:${dirs})/[^"]*)`, 'g')
  return html.replace(re, `$1${prefix}/$2`)
}

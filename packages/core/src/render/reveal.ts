import type { RevealConfig } from '../deck/schema.ts'

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
  preloadIframes: null,
  autoSlide: 0,
}

export function mergeRevealConfig(config?: Partial<RevealConfig>): RevealConfig {
  return { ...DEFAULT_REVEAL_CONFIG, ...(config || {}) }
}

// `sandbox` value for embedded story/app iframes. Crucially OMITS
// `allow-top-navigation` (and its by-user-activation variant): otherwise an
// embedded app calling window.parent.location.assign(...) would replace the whole
// slides window. Flags propagate to nested iframes; plain <a href> still works.
export const EMBED_SANDBOX
  = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation'

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

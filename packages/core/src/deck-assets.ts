// Deck assets of the content space: the files decks reference by path
// (`/images/...`, `/backgrounds/...`, `/pictograms/...`). They live in
// `<content>/assets/<prefix>/...` in the archive and under `assets/<prefix>/...`
// in the bucket, so a deck's URL never changes when the file moves between the
// repository, the bucket and another instance. Uploads from the editor take the
// content-hashed `media/` store instead.

/** URL prefixes the application serves from the content space. */
export const DECK_ASSET_PREFIXES = ['images', 'backgrounds', 'pictograms'] as const

/** Object key of a deck asset: `assets/<prefix>/<...parts>`. */
export function deckAssetKey(prefix: string, ...parts: string[]): string {
  return ['assets', prefix, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

/** The content space of an instance, relative to the project root, when `NUXT_CONTENT_DIR` names none. */
export const DEFAULT_CONTENT_DIR = 'presentations'

/** Path of the same asset in the content space, relative to the project root. */
export function deckAssetLocalPath(contentDir: string | undefined, prefix: string, ...parts: string[]): string {
  return [contentDir || DEFAULT_CONTENT_DIR, 'assets', prefix, ...parts.flatMap(p => p.split('/').filter(Boolean))].join('/')
}

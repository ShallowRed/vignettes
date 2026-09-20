// Upload names are `<hash>.<ext>` (see `media-s3.ts`).
const MEDIA_REFERENCE = /\/media\/([a-z0-9]+\.[a-z0-9]+)/gi
// Files of the content space, referenced by their served path. The lookbehind
// keeps `https://host/images/x.png` out: only a root-relative path is one of ours.
const ASSET_REFERENCE = /(?<![\w/])\/(images)\/([^\s"')\]]+)/gi

/**
 * The images a markdown document references, deduplicated: an upload by its
 * name, a file of the content space by `images/<path>`, which is the key both
 * are indexed and gated under.
 */
export function referencedMedia(markdown: string): string[] {
  const uploads = [...markdown.matchAll(MEDIA_REFERENCE)].map(match => match[1]!)
  const assets = [...markdown.matchAll(ASSET_REFERENCE)].map(match => `${match[1]!}/${match[2]!}`)
  return [...new Set([...uploads, ...assets])]
}

/** The key `/images/<path>` is indexed and gated under. */
export function assetKey(prefix: string, path: string): string {
  return `${prefix}/${path}`
}

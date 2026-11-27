// Upload names are `<hash>.<ext>` (see `mediaName` of `@vignettes/core/media`).
const UPLOAD_REFERENCE = /\/media\/([a-z0-9]+\.[a-z0-9]+)/gi
// Files of the content space, by their served path. The lookbehind leaves out
// `https://host/images/x.png`: only a root-relative path is served from here.
// The angle brackets close a markdown destination written between them.
const ASSET_REFERENCE = /(?<![\w/])\/(images)\/([^\s"')\]<>]+)/gi

/** The key `/<prefix>/<path>` is indexed and gated under. */
export function assetKey(prefix: string, path: string): string {
  return `${prefix}/${path}`
}

/**
 * The path a reference serves, as the route reads it: without the query or the
 * fragment an author may append, and decoded, since the route decodes it too.
 */
function servedPath(reference: string): string {
  const path = reference.split(/[?#]/)[0]!
  try {
    return decodeURIComponent(path)
  }
  catch {
    return path
  }
}

/**
 * The images a markdown document references, deduplicated: an upload by its
 * name, a file of the content space by its {@link assetKey}. Both are indexed
 * and gated under that key.
 */
export function referencedImages(markdown: string): string[] {
  const uploads = [...markdown.matchAll(UPLOAD_REFERENCE)].map(match => match[1]!)
  const assets = [...markdown.matchAll(ASSET_REFERENCE)].map(match => assetKey(match[1]!, servedPath(match[2]!)))
  return [...new Set([...uploads, ...assets])]
}

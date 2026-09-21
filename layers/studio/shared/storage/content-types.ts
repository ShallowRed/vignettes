/**
 * The media type each extension is served and stored with, for the routes that
 * read from object storage and the scripts that write to it. One table, so a
 * file uploaded by a script and a file served by a route agree on their type.
 */
export const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/** The media type of a file name, `application/octet-stream` when unknown. */
export function contentTypeOf(pathOrName: string): string {
  const dot = pathOrName.lastIndexOf('.')
  return (dot === -1 ? undefined : CONTENT_TYPES[pathOrName.slice(dot).toLowerCase()]) ?? 'application/octet-stream'
}

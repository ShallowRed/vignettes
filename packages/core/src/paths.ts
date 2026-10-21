// The relative paths a URL may name inside a served directory or a bucket
// prefix: a file route, an object key, a deck asset copied into a bundle.

/** A segment that names a file or a directory under its parent, never the parent itself or another root. */
function isSafePathSegment(segment: string): boolean {
  return segment !== '.' && segment !== '..' && !/[\\/\0]/.test(segment)
}

/**
 * The segments of a decoded relative path, empty segments dropped, or null when
 * one of them could leave the root the path is read under.
 */
export function safePathSegments(path: string): string[] | null {
  const segments = path.split('/').filter(Boolean)
  return segments.every(isSafePathSegment) ? segments : null
}

import type { H3Event } from 'h3'
import { resolve, sep } from 'node:path'
import { safePathSegments } from '@vignettes/core/paths'

function notFound(): Error {
  return createError({ statusCode: 404, statusMessage: 'Not found' })
}

/**
 * The segments of the `path` parameter of a file route, decoded once. A path
 * that could leave the directory or the prefix the route serves, a malformed
 * escape and an empty path answer 404, as a missing file does.
 */
export function requestPathSegments(event: H3Event): string[] {
  let decoded: string
  try {
    decoded = decodeURIComponent(getRouterParam(event, 'path') || '')
  }
  catch {
    throw notFound()
  }
  const segments = safePathSegments(decoded)
  if (!segments?.length)
    throw notFound()
  return segments
}

/** The file the segments name under `root`; 404 when the resolved path lands outside it. */
export function fileUnder(root: string, segments: string[]): string {
  const base = resolve(root)
  const path = resolve(base, ...segments)
  if (!path.startsWith(base + sep))
    throw notFound()
  return path
}

// Uploaded media (images) live in the same S3 bucket as frozen bundles, under a
// `media/` prefix. Keys are content-hashed → immutable and deduplicated.
// Nuxt/Nitro-free so both the upload endpoint and the serving route reuse it.

/** Object key for an uploaded media asset: `media/<name>`. */
export function mediaObjectKey(name: string): string {
  return `media/${name.split('/').filter(Boolean).join('/')}`
}

/** Accepted image mime types → file extension. */
const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
}

export function imageExtFor(mime: string): string | undefined {
  return IMAGE_EXT[mime]
}

/** The mime types an upload may carry, for the `accept` of a file chooser. */
export const IMAGE_MIME_TYPES: readonly string[] = Object.keys(IMAGE_EXT)

/** The accepted formats as people name them: PNG, JPG… */
export const IMAGE_FORMAT_NAMES: readonly string[] = Object.values(IMAGE_EXT).map(ext => ext.toUpperCase())

export const MAX_MEDIA_MEGABYTES = 10
export const MAX_MEDIA_BYTES = MAX_MEDIA_MEGABYTES * 1024 * 1024

/** Why `POST /api/media` refused an image, sent in the `data` of its error. */
export type MediaRefusal = 'type' | 'size' | 'storage'

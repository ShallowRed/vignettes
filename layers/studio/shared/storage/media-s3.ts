// Uploaded media (images) live in the same S3 bucket as frozen bundles, under a
// `media/` prefix. Keys are content-hashed → immutable and deduplicated; the
// rules of an image and its name are in `@vignettes/core/media`.
// Nuxt/Nitro-free so both the media store and the serving route reuse it.

/** Object key for an uploaded media asset: `media/<name>`. */
export function mediaObjectKey(name: string): string {
  return `media/${name.split('/').filter(Boolean).join('/')}`
}

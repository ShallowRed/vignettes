// Upload names are `<hash>.<ext>` (see `media-s3.ts`).
const MEDIA_REFERENCE = /\/media\/([a-z0-9]+\.[a-z0-9]+)/gi

/** The media names a markdown document references, deduplicated. */
export function referencedMedia(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(MEDIA_REFERENCE)].map(match => match[1]!))]
}

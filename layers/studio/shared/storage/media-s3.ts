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

function startsWith(data: Uint8Array, signature: string, offset = 0): boolean {
  return [...signature].every((char, i) => data[offset + i] === char.charCodeAt(0))
}

// The ISO BMFF `ftyp` box opens an AVIF file and lists the brand `avif` (still
// image) or `avis` (sequence): AV1 Image File Format, section 6.
function isAvif(data: Uint8Array): boolean {
  if (!startsWith(data, 'ftyp', 4))
    return false
  const boxSize = Math.min(data.length, new DataView(data.buffer, data.byteOffset).getUint32(0))
  const brands = [8, ...Array.from({ length: Math.max(0, (boxSize - 16) / 4) }, (_, i) => 16 + i * 4)]
  return brands.some(at => startsWith(data, 'avif', at) || startsWith(data, 'avis', at))
}

// An SVG document is text whose root element is `<svg`, after the XML prolog:
// declaration, processing instructions, comments, and a doctype without
// internal subset. The scan reads the text once, in a time linear in its length.
function hasSvgRoot(text: string): boolean {
  let at = 0
  while (at < text.length) {
    if (/\s/.test(text[at]!)) {
      at++
      continue
    }
    const close = text.startsWith('<?', at) ? '?>' : text.startsWith('<!--', at) ? '-->' : text.startsWith('<!DOCTYPE', at) ? '>' : undefined
    if (!close)
      return /^<svg[\s/>]/.test(text.slice(at, at + 5))
    const end = text.indexOf(close, at)
    if (end === -1 || (close === '>' && text.slice(at, end).includes('[')))
      return false
    at = end + close.length
  }
  return false
}

/**
 * Returns the accepted type that the bytes of an image show, whatever type the
 * client declared. It reads the image signatures of the WHATWG MIME Sniffing
 * standard (section 6.1) for PNG, JPEG, GIF and WebP, the `ftyp` box for AVIF
 * and the root element for SVG.
 */
export function sniffImageType(data: Uint8Array): string | undefined {
  if (startsWith(data, '\x89PNG\r\n\x1A\n'))
    return 'image/png'
  if (startsWith(data, '\xFF\xD8\xFF'))
    return 'image/jpeg'
  if (startsWith(data, 'GIF87a') || startsWith(data, 'GIF89a'))
    return 'image/gif'
  if (startsWith(data, 'RIFF') && startsWith(data, 'WEBPVP', 8))
    return 'image/webp'
  if (isAvif(data))
    return 'image/avif'
  if (hasSvgRoot(new TextDecoder().decode(data)))
    return 'image/svg+xml'
  return undefined
}

/** The mime types an upload may carry, for the `accept` of a file chooser. */
export const IMAGE_MIME_TYPES: readonly string[] = Object.keys(IMAGE_EXT)

/** The accepted formats as people name them: PNG, JPG… */
export const IMAGE_FORMAT_NAMES: readonly string[] = Object.values(IMAGE_EXT).map(ext => ext.toUpperCase())

export const MAX_MEDIA_MEGABYTES = 10
export const MAX_MEDIA_BYTES = MAX_MEDIA_MEGABYTES * 1024 * 1024

/** Why `POST /api/media` refused an image, sent in the `data` of its error. */
export type MediaRefusal = 'type' | 'size' | 'content' | 'storage'

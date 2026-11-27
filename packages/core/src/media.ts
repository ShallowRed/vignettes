// The rules of an image uploaded to the studio, `POST /api/media`: the accepted
// types, the weight, the type its bytes show, and the name it is stored under.
// The server, the editor and the command line read them here.

import { sha256Hex } from './digest.ts'

/** Accepted image mime types → file extension. */
const IMAGE_EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
} as const satisfies Record<string, string>

/** An accepted image mime type. */
export type ImageType = keyof typeof IMAGE_EXT

const SVG: ImageType = 'image/svg+xml'

function isImageType(mime: string): mime is ImageType {
  return Object.hasOwn(IMAGE_EXT, mime)
}

export function imageExtFor(mime: string): string | undefined {
  return isImageType(mime) ? IMAGE_EXT[mime] : undefined
}

/** The extensions a file of an accepted type has: those of the table, and `jpeg`. */
export const IMAGE_EXTENSIONS: readonly string[] = [...Object.values(IMAGE_EXT), 'jpeg']

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
export function sniffImageType(data: Uint8Array): ImageType | undefined {
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
    return SVG
  return undefined
}

/**
 * The type an image is stored under: the type its bytes show. A browser
 * declares the type of a file from its extension, so a raster image saved
 * under another extension keeps the type of its bytes; an SVG has to be
 * declared as one. Undefined when the upload is refused.
 */
export function acceptedImageType(declared: string, bytes: Uint8Array): ImageType | undefined {
  const sniffed = sniffImageType(bytes)
  return sniffed && (sniffed !== SVG || declared === SVG) ? sniffed : undefined
}

/** The name `/media/<name>` serves an image under: the first 32 hexadecimal digits of the SHA-256 of its bytes, and the extension of its type. */
export async function mediaName(bytes: Uint8Array, type: ImageType): Promise<string> {
  return `${(await sha256Hex(bytes)).slice(0, 32)}.${IMAGE_EXT[type]}`
}

/** The mime types an upload may carry, for the `accept` of a file chooser. */
export const IMAGE_MIME_TYPES: readonly string[] = Object.keys(IMAGE_EXT)

/** The accepted formats as people name them: PNG, JPG… */
export const IMAGE_FORMAT_NAMES: readonly string[] = Object.values(IMAGE_EXT).map(ext => ext.toUpperCase())

export const MAX_MEDIA_MEGABYTES = 10
export const MAX_MEDIA_BYTES = MAX_MEDIA_MEGABYTES * 1024 * 1024

/** Why `POST /api/media` refused an image, sent in the `data` of its error. */
export const MEDIA_REFUSALS = ['type', 'size', 'content', 'storage'] as const
export type MediaRefusal = typeof MEDIA_REFUSALS[number]

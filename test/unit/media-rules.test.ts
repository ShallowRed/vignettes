import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { sha256Hex, textDigest } from '@vignettes/core/digest'
import { acceptedImageType, IMAGE_EXTENSIONS, IMAGE_FORMAT_NAMES, IMAGE_MIME_TYPES, imageExtFor, MAX_MEDIA_BYTES, MAX_MEDIA_MEGABYTES, mediaName } from '@vignettes/core/media'
import { describe, expect, it } from 'vitest'

const bytes = (...parts: (string | number[])[]) => Buffer.from(parts.flatMap(part => typeof part === 'string' ? [...Buffer.from(part)] : part))

const SAMPLES: Record<string, Buffer> = {
  'image/png': bytes([0x89], 'PNG\r\n\x1A\n', [0, 0]),
  'image/jpeg': bytes([0xFF, 0xD8, 0xFF, 0xE0]),
  'image/webp': bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '),
  'image/gif': bytes('GIF89a', [1, 0]),
  'image/svg+xml': bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  'image/avif': bytes([0, 0, 0, 24], 'ftypmif1', [0, 0, 0, 0], 'mif1avif'),
}

describe('the rules of an uploaded image', () => {
  it('accepts six types, each with its extension and the name people give it', () => {
    expect(IMAGE_MIME_TYPES).toEqual(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'])
    expect(IMAGE_MIME_TYPES.map(imageExtFor)).toEqual(['png', 'jpg', 'webp', 'gif', 'svg', 'avif'])
    expect(IMAGE_FORMAT_NAMES).toEqual(['PNG', 'JPG', 'WEBP', 'GIF', 'SVG', 'AVIF'])
    expect(imageExtFor('image/bmp')).toBeUndefined()
    expect(imageExtFor('toString')).toBeUndefined()
  })

  it('lists the extension of each accepted type, and jpeg', () => {
    for (const type of IMAGE_MIME_TYPES)
      expect(IMAGE_EXTENSIONS).toContain(imageExtFor(type))
    expect(IMAGE_EXTENSIONS).toContain('jpeg')
  })

  it('weighs 10 MiB at most', () => {
    expect(MAX_MEDIA_MEGABYTES).toBe(10)
    expect(MAX_MEDIA_BYTES).toBe(10 * 2 ** 20)
  })

  it('stores a raster image under the type of its bytes, whatever its declared type', () => {
    expect(acceptedImageType('image/png', SAMPLES['image/jpeg']!)).toBe('image/jpeg')
    expect(acceptedImageType('image/svg+xml', SAMPLES['image/png']!)).toBe('image/png')
    expect(acceptedImageType('image/png', bytes('plain text'))).toBeUndefined()
  })

  it('accepts an SVG declared as one, and refuses an SVG declared as another type', () => {
    expect(acceptedImageType('image/svg+xml', SAMPLES['image/svg+xml']!)).toBe('image/svg+xml')
    expect(acceptedImageType('image/png', SAMPLES['image/svg+xml']!)).toBeUndefined()
  })

  it('names an image by the first 32 hexadecimal digits of the SHA-256 of its bytes and the extension of its type', async () => {
    const data = SAMPLES['image/png']!
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 32)
    expect(await mediaName(data, 'image/png')).toBe(`${hash}.png`)
    expect(await mediaName(data, 'image/jpeg')).toBe(`${hash}.jpg`)
  })
})

describe('the digest', () => {
  it('is the SHA-256 that Node computes, in lowercase hexadecimal', async () => {
    for (const data of [...Object.values(SAMPLES), Buffer.alloc(0)])
      expect(await sha256Hex(data)).toBe(createHash('sha256').update(data).digest('hex'))
  })

  it('hashes the UTF-8 bytes of a text', async () => {
    const text = '---\ntitle: Déjà\n---\n\n# Été 🌞\r\n'
    expect(await textDigest(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'))
  })
})

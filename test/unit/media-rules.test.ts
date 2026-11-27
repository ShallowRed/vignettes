import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { mediaNameOf } from '../../layers/studio/server/utils/media-store'
import { IMAGE_FORMAT_NAMES, IMAGE_MIME_TYPES, imageExtFor, MAX_MEDIA_BYTES, MAX_MEDIA_MEGABYTES, sniffImageType } from '../../layers/studio/shared/storage/media-s3'

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
  })

  it('weighs 10 MiB at most', () => {
    expect(MAX_MEDIA_MEGABYTES).toBe(10)
    expect(MAX_MEDIA_BYTES).toBe(10 * 2 ** 20)
  })

  it('reads the type of each accepted format from its bytes', () => {
    for (const [type, data] of Object.entries(SAMPLES))
      expect(sniffImageType(data)).toBe(type)
    expect(sniffImageType(bytes('plain text'))).toBeUndefined()
  })

  it('names an image by the first 32 hexadecimal digits of the SHA-256 of its bytes and the extension of its type', () => {
    const data = SAMPLES['image/png']!
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 32)
    expect(mediaNameOf(data, 'image/png')).toBe(`${hash}.png`)
    expect(mediaNameOf(data, 'image/jpeg')).toBe(`${hash}.jpg`)
    expect(mediaNameOf(data, 'image/bmp')).toBeUndefined()
  })
})

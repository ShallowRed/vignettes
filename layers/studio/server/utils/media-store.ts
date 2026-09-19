import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { frozenS3ConfigFromEnv, isFrozenS3Configured, makeFrozenS3Client } from '#shared/storage/frozen-s3'
import { imageExtFor, mediaObjectKey } from '#shared/storage/media-s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'

/** The name `/media/<name>` serves this image under: the hash of its content and the extension of its type. */
export function mediaNameOf(data: Buffer, mime: string): string | undefined {
  const ext = imageExtFor(mime)
  return ext && `${createHash('sha256').update(data).digest('hex').slice(0, 32)}.${ext}`
}

/** Writes an image to the bucket, or to the local `.media/` directory without bucket credentials. */
export async function storeMedia(name: string, data: Buffer, mime: string): Promise<void> {
  const cfg = frozenS3ConfigFromEnv(process.env)
  if (isFrozenS3Configured(cfg)) {
    await makeFrozenS3Client(cfg).send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: mediaObjectKey(name),
      Body: data,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    return
  }
  const dir = join(process.cwd(), '.media')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, name), data)
}

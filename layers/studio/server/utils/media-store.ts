import type { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { mediaObjectKey } from '#shared/storage/media-s3'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { serverConfig } from './config'
import { makeFrozenS3Client } from './frozen-s3-client'

/** Writes an image to the bucket, or to the local `.media/` directory without bucket credentials. */
export async function storeMedia(name: string, data: Buffer, mime: string): Promise<void> {
  const cfg = serverConfig().frozenS3
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

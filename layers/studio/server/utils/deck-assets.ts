import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { contentTypeOf } from '#shared/storage/content-types'
import { isFrozenS3Configured } from '#shared/storage/frozen-s3'
import { assetKey } from '#shared/storage/media-refs'
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { deckAssetKey, deckAssetLocalPath } from '@vignettes/core/deck-assets'
import { decideMediaAccess } from './access'
import { serverConfig } from './config'
import { makeFrozenS3Client } from './frozen-s3-client'
import { fileUnder, requestPathSegments } from './request-path'

/**
 * Serve a deck asset of the content space (`presentations/assets/<prefix>/...`,
 * referenced by decks as `/<prefix>/...`): from the bucket on a deployment,
 * from the content directory on disk otherwise. Files the application ships
 * under `public/` with the same prefix are static and never reach this.
 *
 * `gated` serves the file with the visibility of the decks referencing it, the
 * rule `/media/**` follows. Backgrounds and pictograms are the decoration of a
 * theme, named in stylesheets the index never reads, so they stay open.
 */
export async function serveDeckAsset(event: H3Event, prefix: string, { gated = false }: { gated?: boolean } = {}): Promise<Buffer> {
  const parts = requestPathSegments(event)

  // 404 rather than 403, which would tell which files exist.
  const access = gated ? await decideMediaAccess(event, assetKey(prefix, parts.join('/'))) : null
  if (access && !access.allowed)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const cfg = serverConfig().frozenS3
  let body: Buffer
  let contentType: string | undefined
  if (isFrozenS3Configured(cfg)) {
    try {
      const res = await makeFrozenS3Client(cfg).send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: deckAssetKey(prefix, ...parts) }),
      )
      body = Buffer.from(await res.Body!.transformToByteArray())
      contentType = res.ContentType
    }
    catch (err: unknown) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
      if (status === 404 || (err as { name?: string })?.name === 'NoSuchKey')
        throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
      throw err
    }
  }
  else {
    const file = fileUnder(resolve(process.cwd(), deckAssetLocalPath(serverConfig().contentDir, prefix)), parts)
    try {
      body = await readFile(file)
    }
    catch {
      throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
    }
  }

  setResponseHeader(event, 'Content-Type', contentType || contentTypeOf(parts[parts.length - 1]!))
  setResponseHeader(event, 'Content-Length', body.byteLength)
  setResponseHeader(event, 'Cache-Control', !access || access.public ? 'public, max-age=300' : 'private, no-store')
  return body
}

/**
 * The paths of the deck assets of the content space under `prefix`, relative to
 * it (`digital/coding.svg`): from the bucket on a deployment, from the content
 * directory on disk otherwise. An absent directory lists nothing.
 */
export async function listDeckAssets(prefix: string): Promise<string[]> {
  const cfg = serverConfig().frozenS3
  if (isFrozenS3Configured(cfg)) {
    const folder = `${deckAssetKey(prefix)}/`
    const client = makeFrozenS3Client(cfg)
    const paths: string[] = []
    let token: string | undefined
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: cfg.bucket, Prefix: folder, ContinuationToken: token }))
      for (const object of page.Contents ?? []) {
        if (object.Key)
          paths.push(object.Key.slice(folder.length))
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined
    } while (token)
    return paths
  }
  const root = resolve(process.cwd(), deckAssetLocalPath(serverConfig().contentDir, prefix))
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])
  return entries
    .filter(entry => entry.isFile())
    .map(entry => relative(root, resolve(entry.parentPath, entry.name)).split(sep).join('/'))
}

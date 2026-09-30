// The S3 client of the bucket hosting frozen bundles, themes and media. The
// standalone scripts import it by relative path, outside Nitro.
import type { FrozenS3Config } from '../../shared/storage/frozen-s3.ts'
import { S3Client } from '@aws-sdk/client-s3'

export function makeFrozenS3Client(c: FrozenS3Config): S3Client {
  return new S3Client({
    endpoint: c.endpoint,
    region: c.region,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
  })
}

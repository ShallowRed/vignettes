import { describe, expect, it } from 'vitest'
import { readDatabaseConfig } from '../../layers/studio/server/db/config'
import { productionConfigProblem, readOrigins } from '../../layers/studio/server/utils/config'
import { frozenS3ConfigFromEnv } from '../../layers/studio/shared/storage/frozen-s3'

const BUCKET = {
  NUXT_FROZEN_S3_BUCKET: 'vignettes',
  NUXT_FROZEN_S3_ACCESS_KEY_ID: 'key',
  NUXT_FROZEN_S3_SECRET_ACCESS_KEY: 'secret',
}

function problemWith(env: Record<string, string>): string | undefined {
  return productionConfigProblem({ database: readDatabaseConfig(env), frozenS3: frozenS3ConfigFromEnv(env), origins: readOrigins(env, { enabled: false }) })
}

describe('productionConfigProblem', () => {
  it('refuses a PostgreSQL server without the bucket, where the media would land on the container disk', () => {
    expect(problemWith({ NUXT_DATABASE_URL: 'postgres://db/app' })).toMatch(/NUXT_FROZEN_S3_BUCKET/)
    expect(problemWith({ NUXT_DATABASE_URL: 'postgres://db/app', NUXT_FROZEN_S3_BUCKET: 'vignettes' })).toMatch(/NUXT_FROZEN_S3_BUCKET/)
  })

  it('accepts a PostgreSQL server with the bucket, and a local database without it', () => {
    expect(problemWith({ NUXT_DATABASE_URL: 'postgres://db/app', ...BUCKET })).toBeUndefined()
    expect(problemWith({ NUXT_DATABASE_DRIVER: 'sqlite' })).toBeUndefined()
    expect(problemWith({})).toBeUndefined()
  })

  it('refuses a deck origin without a studio origin apart from it, or a value that is not an address', () => {
    expect(problemWith({ NUXT_PUBLIC_DECKS_URL: 'https://decks.example' })).toMatch(/NUXT_STUDIO_URL/)
    expect(problemWith({ NUXT_PUBLIC_DECKS_URL: 'https://decks.example', NUXT_STUDIO_URL: 'https://decks.example/studio' })).toMatch(/another origin/)
    expect(problemWith({ NUXT_PUBLIC_DECKS_URL: 'decks.example', NUXT_STUDIO_URL: 'https://app.example' })).toMatch(/are addresses/)
    expect(problemWith({ NUXT_PUBLIC_DECKS_URL: 'https://decks.example', NUXT_STUDIO_URL: 'https://app.example' })).toBeUndefined()
  })
})

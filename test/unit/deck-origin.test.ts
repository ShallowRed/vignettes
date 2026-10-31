import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readOrigins } from '../../layers/studio/server/utils/config'
import { afterLoginPath, sideOfOrigin } from '../../layers/studio/server/utils/deck-origin'

vi.stubGlobal('getRequestURL', (e: any) => new URL(`https://${e.headers.host}/`))

afterEach(() => {
  delete process.env.NUXT_PUBLIC_DECKS_URL
  delete process.env.NUXT_STUDIO_URL
})

describe('readOrigins', () => {
  it('reads the origin of each address, and nothing in a frozen bundle', () => {
    const env = { NUXT_PUBLIC_DECKS_URL: 'https://decks.example/', NUXT_STUDIO_URL: ' https://app.example/home ' }
    expect(readOrigins(env, { enabled: false })).toEqual({ decks: 'https://decks.example', studio: 'https://app.example' })
    expect(readOrigins(env, { enabled: true })).toEqual({})
  })
})

describe('sideOfOrigin', () => {
  it('names the deck origin by its host, and every other host the studio', () => {
    process.env.NUXT_PUBLIC_DECKS_URL = 'https://decks.example'
    process.env.NUXT_STUDIO_URL = 'https://app.example'
    expect(sideOfOrigin('https://decks.example')).toBe('decks')
    expect(sideOfOrigin('http://decks.example')).toBe('decks')
    expect(sideOfOrigin('https://app.example')).toBe('studio')
    expect(sideOfOrigin('http://127.0.0.1:3000')).toBe('studio')
  })

  it('answers single on an instance without both origins', () => {
    expect(sideOfOrigin('https://app.example')).toBe('single')
    process.env.NUXT_PUBLIC_DECKS_URL = 'https://decks.example'
    expect(sideOfOrigin('https://decks.example')).toBe('single')
  })
})

describe('afterLoginPath', () => {
  it('sends a deck page through the login page on the studio of an instance with a deck origin', () => {
    process.env.NUXT_PUBLIC_DECKS_URL = 'https://decks.example'
    process.env.NUXT_STUDIO_URL = 'https://app.example'
    const studio = { headers: { host: 'app.example' } } as any
    expect(afterLoginPath(studio, '/slides/talk')).toBe('/login?redirect=%2Fslides%2Ftalk')
    expect(afterLoginPath(studio, '/edit/talk')).toBe('/edit/talk')
    expect(afterLoginPath(studio, '//other.example')).toBe('/')
    delete process.env.NUXT_PUBLIC_DECKS_URL
    expect(afterLoginPath(studio, '/slides/talk')).toBe('/slides/talk')
  })
})

import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)
vi.stubGlobal('useRuntimeConfig', () => ({ session: {} }))
vi.stubGlobal('getRequestURL', (e: any) => new URL(`https://${e.headers.host}/`))

beforeAll(() => {
  process.env.NUXT_PUBLIC_DECKS_URL = 'https://decks.example'
  process.env.NUXT_STUDIO_URL = 'https://app.example'
})
afterAll(() => {
  delete process.env.NUXT_PUBLIC_DECKS_URL
  delete process.env.NUXT_STUDIO_URL
})

const { default: plugin } = await import('../../layers/studio/server/plugins/deck-origin-cookies')

/** The cookies a response to a request on this host writes. */
function answer(host: string, cookies: string | string[]): string[] {
  const hooks: Array<(event: any) => void> = []
  ;(plugin as any)({ hooks: { hook: (_name: string, fn: (event: any) => void) => hooks.push(fn) } })
  const headers = new Map<string, unknown>([['set-cookie', cookies]])
  let written: unknown
  const res: any = {
    getHeader: (n: string) => headers.get(n),
    setHeader: (n: string, v: unknown) => headers.set(n, v),
    writeHead: () => { written = headers.get('set-cookie') },
  }
  hooks[0]!({ headers: { host }, node: { res } })
  res.writeHead(302)
  return [written].flat() as string[]
}

describe('the cookies of a response', () => {
  it('leave out the session of the studio on the deck origin, and keep the others', () => {
    expect(answer('decks.example', ['nuxt-session=sealed; Path=/', 'vignettes_locale=fr; Path=/'])).toEqual(['vignettes_locale=fr; Path=/'])
    expect(answer('decks.example', 'nuxt-session=sealed; Path=/')).toEqual([])
    expect(answer('app.example', 'nuxt-session=sealed; Path=/')).toEqual(['nuxt-session=sealed; Path=/'])
  })
})

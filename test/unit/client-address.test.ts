import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { clientAddress } from '../../layers/studio/server/utils/client-address'
import { anon, stubH3Globals } from './helpers/server-db'

stubH3Globals()

afterEach(() => {
  delete process.env.NUXT_TRUSTED_PROXY_HOPS
})

/** A request that the proxy received from 203.0.113.7, whose client wrote its own `X-Forwarded-For`. */
const forged = anon({ ip: '172.18.0.2', headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.7' } })

describe('clientAddress', () => {
  it('reads the socket without a proxy declared', () => {
    expect(clientAddress(forged)).toBe('172.18.0.2')
  })

  it('reads the value the proxy added, never the one the client wrote', () => {
    process.env.NUXT_TRUSTED_PROXY_HOPS = '1'
    expect(clientAddress(forged)).toBe('203.0.113.7')
  })

  it('reads the socket when the header holds fewer values than proxies', () => {
    process.env.NUXT_TRUSTED_PROXY_HOPS = '2'
    expect(clientAddress(anon({ ip: '172.18.0.2', headers: { 'x-forwarded-for': '203.0.113.7' } }))).toBe('172.18.0.2')
  })
})

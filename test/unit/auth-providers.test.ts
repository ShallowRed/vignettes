import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('defineEventHandler', (handler: any) => handler)
vi.stubGlobal('useRuntimeConfig', (event: any) => event.runtimeConfig)

const { default: providers } = await import('../../layers/studio/server/api/auth/providers.get')

const event = (oauth: unknown) => ({ runtimeConfig: { oauth } })
const credentials = { clientId: 'id', clientSecret: 'secret' }

describe('the providers endpoint', () => {
  it('offers each provider holding both of its credentials', () => {
    expect(providers(event({ github: credentials, google: credentials }))).toEqual({ github: true, google: true })
  })

  it('hides a provider whose secret is missing', () => {
    expect(providers(event({ github: { clientId: 'id', clientSecret: '' }, google: credentials })))
      .toEqual({ github: false, google: true })
  })

  it('offers nothing on a deployment that registered no application', () => {
    expect(providers(event({ github: { clientId: '', clientSecret: '' }, google: { clientId: '', clientSecret: '' } })))
      .toEqual({ github: false, google: false })
    expect(providers(event(undefined))).toEqual({ github: false, google: false })
  })
})

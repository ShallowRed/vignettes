import { afterEach, describe, expect, it, vi } from 'vitest'

async function studioLayerConfig() {
  vi.resetModules()
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  return (await import('../../layers/studio/nuxt.config')).default as unknown as { modules: unknown[] }
}

async function applicationConfig() {
  vi.resetModules()
  vi.stubGlobal('defineNuxtConfig', (config: unknown) => config)
  return (await import('../../nuxt.config')).default as unknown as { features: { noScripts: boolean } }
}

describe('a frozen bundle', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('leaves the error tracking module out', async () => {
    vi.stubEnv('BUNDLE_ONLY_SLUG', 'deck')
    expect((await studioLayerConfig()).modules).not.toContain('@sentry/nuxt/module')
  })

  it('is served without scripts', async () => {
    vi.stubEnv('BUNDLE_ONLY_SLUG', 'deck')
    expect((await applicationConfig()).features.noScripts).toBe(true)
  })

  it('differs from a server build, which loads the module', async () => {
    vi.stubEnv('BUNDLE_ONLY_SLUG', '')
    expect((await studioLayerConfig()).modules).toContain('@sentry/nuxt/module')
  })
})

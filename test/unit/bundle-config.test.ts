import { bundleStorybookUrl, readBundleConfig } from '@vignettes/freeze/bundle'
import { describe, expect, it } from 'vitest'

describe('readBundleConfig', () => {
  it('is disabled with sane defaults when no toggles are set', () => {
    expect(readBundleConfig({})).toEqual({
      enabled: false,
      onlySlug: undefined,
      publicDir: undefined,
      theme: undefined,
      storybookUrl: '/_storybook',
      baseUrl: '/',
    })
  })

  it('enables bundle mode and reads every toggle once', () => {
    const cfg = readBundleConfig({
      BUNDLE_ONLY_SLUG: 'my-deck',
      BUNDLE_PUBLIC_DIR: '/tmp/bundle-public',
      BUNDLE_THEME: 'dsfr',
      NUXT_APP_BASE_URL: '/frozen/my-deck/',
    })
    expect(cfg).toEqual({
      enabled: true,
      onlySlug: 'my-deck',
      publicDir: '/tmp/bundle-public',
      theme: 'dsfr',
      storybookUrl: '/frozen/my-deck/_storybook',
      baseUrl: '/frozen/my-deck/',
    })
  })

  it('treats empty strings as unset', () => {
    const cfg = readBundleConfig({ BUNDLE_ONLY_SLUG: '', BUNDLE_THEME: '' })
    expect(cfg.enabled).toBe(false)
    expect(cfg.theme).toBeUndefined()
  })

  it('lets the storybook base be set explicitly', () => {
    expect(readBundleConfig({ BUNDLE_STORYBOOK_URL: '/sb' }).storybookUrl).toBe('/sb')
  })
})

describe('bundleStorybookUrl', () => {
  it('carries the bundle base so embeds resolve inside the bundle', () => {
    expect(bundleStorybookUrl('/frozen/talk/')).toBe('/frozen/talk/_storybook')
    expect(bundleStorybookUrl('/')).toBe('/_storybook')
  })
})

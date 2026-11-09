import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { deckThemeName, getDefaultTheme, setDefaultTheme, setThemeRegistry, themedReveal } from '@vignettes/core/theme'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { defaultMetadata } from '../../packages/nuxt/src/runtime/config/presentation.ts'

let configured: string | undefined
vi.stubGlobal('useRuntimeConfig', () => ({ public: { defaultTheme: configured } }))

const { invalidateTenantThemes, loadTenantThemes } = await import('../../layers/studio/server/utils/themes')

describe('the fallback theme', () => {
  afterEach(() => setDefaultTheme(null))

  it('is the neutral theme the packages ship with', () => {
    expect(getDefaultTheme()).toBe('minimal')
  })

  it('takes the name a host gives it', () => {
    expect(setDefaultTheme('brand')).toBe('brand')
    expect(getDefaultTheme()).toBe('brand')
  })

  it('returns to the built-in one when the host names none', () => {
    setDefaultTheme('brand')
    expect(setDefaultTheme('')).toBe('minimal')
    expect(setDefaultTheme(undefined)).toBe('minimal')
  })

  it('is the theme a deck without frontmatter renders in', () => {
    expect(defaultMetadata().theme).toBe('minimal')
    setDefaultTheme('brand')
    expect(defaultMetadata().theme).toBe('brand')
  })
})

describe('deckThemeName', () => {
  afterEach(() => setDefaultTheme(null))

  it('keeps the name the frontmatter writes', () => {
    expect(deckThemeName({ theme: 'brand' })).toBe('brand')
  })

  it.each([[undefined], [null], [''], [42]])('takes the fallback theme for %s', (theme) => {
    setDefaultTheme('brand')
    expect(deckThemeName({ theme })).toBe('brand')
  })
})

describe('themedReveal', () => {
  const tokens = { wide: { name: 'wide', reveal: { width: 1280, height: 720 } } }

  afterEach(() => {
    setThemeRegistry(null)
    setDefaultTheme(null)
  })

  it('lays the options of the deck over those of its theme', () => {
    setThemeRegistry({ tokens })
    expect(themedReveal({ theme: 'wide', reveal: { height: 800, margin: 0.2 } })).toEqual({ width: 1280, height: 800, margin: 0.2 })
  })

  it('reads the fallback theme of a deck that declares none', () => {
    setThemeRegistry({ tokens })
    setDefaultTheme('wide')
    expect(themedReveal({})).toEqual({ width: 1280, height: 720 })
  })

  it('leaves out the options the schema does not name', () => {
    expect(themedReveal({ theme: 'absent', reveal: { width: 1200, dependencies: [{ src: 'data:text/javascript,alert(1)' }] } })).toEqual({ width: 1200 })
  })
})

describe('the fallback theme of the studio', () => {
  let root: string
  let cwd: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'default-theme-'))
    cwd = process.cwd()
    process.chdir(root)
  })

  afterEach(() => {
    invalidateTenantThemes()
    setDefaultTheme(null)
  })

  afterAll(() => {
    process.chdir(cwd)
    rmSync(root, { recursive: true, force: true })
    setThemeRegistry(null)
    setDefaultTheme(null)
  })

  it('applies the configured theme once the registry holds it', async () => {
    configured = 'dsfr'
    await loadTenantThemes()
    expect(getDefaultTheme()).toBe('dsfr')
  })

  it('keeps the built-in one and warns when the configured theme is unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    configured = 'absent'
    await loadTenantThemes()
    expect(getDefaultTheme()).toBe('minimal')
    expect(warn.mock.calls[0]?.[0]).toContain('"absent" is not a known theme')
    warn.mockRestore()
  })

  it('keeps the built-in one when nothing is configured', async () => {
    configured = undefined
    await loadTenantThemes()
    expect(getDefaultTheme()).toBe('minimal')
  })
})

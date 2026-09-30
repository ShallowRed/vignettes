import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { getDefaultTheme, setDefaultTheme, setThemeRegistry } from '@vignettes/core/theme'
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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  builtInThemeRegistry,
  getThemeTokens,
  isKnownTheme,
  knownThemes,
  resolveThemeName,
  setThemeRegistry,
} from '@vignettes/core/theme'
import { themePackageVersions } from '@vignettes/nuxt/build/theme-build'
import { discoverThemes, manifestTokens, registryOf, themeAliases } from '@vignettes/nuxt/build/theme-registry'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { indexOf, themeVersionGaps } from '../../layers/studio/shared/storage/themes-s3'

describe('runtime theme registry', () => {
  afterEach(() => setThemeRegistry(null))

  it('starts with the application themes only', () => {
    expect(knownThemes()).toEqual(Object.keys(builtInThemeRegistry().tokens))
    expect(isKnownTheme('dsfr')).toBe(true)
    expect(isKnownTheme('brand-x')).toBe(false)
  })

  it('adds tenant themes and resolves their aliases', () => {
    setThemeRegistry({
      tokens: { 'brand-x': { name: 'brand-x', backgrounds: { h1: '/themes/brand-x/assets/h1.png' } } },
      aliases: { dsfr: 'brand-x' },
    })
    expect(knownThemes()).toContain('brand-x')
    expect(resolveThemeName('dsfr')).toBe('brand-x')
    expect(isKnownTheme('dsfr')).toBe(true)
    expect(getThemeTokens('dsfr')?.backgrounds?.h1).toBe('/themes/brand-x/assets/h1.png')
    expect(getThemeTokens('minimal')?.name).toBe('minimal')
  })

  it('a later set replaces the previous tenant themes', () => {
    setThemeRegistry({ tokens: { a: { name: 'a' } } })
    setThemeRegistry({ tokens: { b: { name: 'b' } } })
    expect(knownThemes()).toContain('b')
    expect(knownThemes()).not.toContain('a')
  })
})

describe('manifest discovery', () => {
  let root: string
  const previousContentDir = process.env.NUXT_CONTENT_DIR

  function manifest(dir: string, body: Record<string, unknown>) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'theme.json'), JSON.stringify(body))
  }

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'themes-'))
    process.env.NUXT_CONTENT_DIR = join(root, 'content')
    manifest(join(root, 'themes/base'), { name: 'base', lang: 'fr', reveal: { width: 1200 } })
    manifest(join(root, 'content/themes/brand'), { name: 'brand', extends: 'base', aliases: ['base'], backgrounds: { h1: 'assets/h1.png', h2: '/shared/h2.png' } })
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
    if (previousContentDir === undefined)
      delete process.env.NUXT_CONTENT_DIR
    else process.env.NUXT_CONTENT_DIR = previousContentDir
  })

  it('finds application and content themes with their source', () => {
    const themes = discoverThemes(root)
    expect(themes.map(t => `${t.source}:${t.name}`)).toEqual(['app:base', 'content:brand'])
    expect(themes[1].entry.endsWith('/content/themes/brand/brand.scss')).toBe(true)
  })

  it('turns relative backgrounds into theme URLs and keeps absolute ones', () => {
    const brand = discoverThemes(root).find(t => t.name === 'brand')!
    expect(manifestTokens(brand.manifest).backgrounds).toEqual({ h1: '/themes/brand/assets/h1.png', h2: '/shared/h2.png' })
  })

  it('turns the path of the font the PowerPoint export embeds into a theme URL', () => {
    const tokens = manifestTokens({ name: 'brand', pptx: { font: { family: 'Quicksand', src: 'assets/fonts/Quicksand-Regular.ttf' } } })
    expect(tokens.pptx).toEqual({ font: { family: 'Quicksand', src: '/themes/brand/assets/fonts/Quicksand-Regular.ttf' } })
  })

  it('reports an alias that shadows a theme and lets the content theme win', () => {
    const themes = discoverThemes(root)
    const { aliases, warnings } = themeAliases(themes)
    expect(aliases).toEqual({ base: 'brand' })
    expect(warnings[0]).toContain('shadows')
    expect(registryOf(themes).aliases).toEqual({ base: 'brand' })
  })

  it('rejects a manifest whose name differs from its directory', () => {
    manifest(join(root, 'themes/wrong'), { name: 'other' })
    expect(() => discoverThemes(root)).toThrow(/"name" is "other"/)
    rmSync(join(root, 'themes/wrong'), { recursive: true })
  })
})

describe('published index', () => {
  it('folds published themes into tokens and aliases', () => {
    const index = indexOf([
      { tokens: { name: 'brand-b' }, aliases: [], publishedAt: '2026-09-11' },
      { tokens: { name: 'brand-a' }, aliases: ['dsfr'], publishedAt: '2026-09-11' },
    ])
    expect(Object.keys(index.tokens)).toEqual(['brand-a', 'brand-b'])
    expect(index.aliases).toEqual({ dsfr: 'brand-a' })
  })

  it('reports the themes compiled with other theme packages than the instance', () => {
    const index = indexOf([
      { tokens: { name: 'current' }, aliases: [], publishedAt: '2026-10-27', compiledWith: { '@vignettes/theme-kit': '0.1.0+new' } },
      { tokens: { name: 'stale' }, aliases: [], publishedAt: '2026-10-27', compiledWith: { '@vignettes/theme-kit': '0.1.0+old' } },
      { tokens: { name: 'unversioned' }, aliases: [], publishedAt: '2026-09-11' },
    ])
    expect(themeVersionGaps(index, { '@vignettes/theme-kit': '0.1.0+new' })).toEqual([
      { theme: 'stale', package: '@vignettes/theme-kit', compiled: '0.1.0+old', instance: '0.1.0+new' },
      { theme: 'unversioned', package: '@vignettes/theme-kit', compiled: null, instance: '0.1.0+new' },
    ])
  })
})

describe('themePackageVersions', () => {
  it('changes with the stylesheets of a theme package while its version stays', () => {
    const root = mkdtempSync(join(tmpdir(), 'theme-packages-'))
    const pkg = join(root, 'node_modules/@vignettes/theme-kit')
    mkdirSync(pkg, { recursive: true })
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ version: '0.1.0' }))
    writeFileSync(join(pkg, '_index.scss'), ':root { --accent: red; }')
    const before = themePackageVersions(root)['@vignettes/theme-kit']
    writeFileSync(join(pkg, '_index.scss'), ':root { --accent: blue; }')
    const after = themePackageVersions(root)['@vignettes/theme-kit']
    expect(before).toMatch(/^0\.1\.0\+[0-9a-f]{10}$/)
    expect(after).not.toBe(before)
    rmSync(root, { recursive: true, force: true })
  })
})

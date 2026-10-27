import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setThemeRegistry } from '@vignettes/core/theme'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { indexOf, themeLocalPath } from '../../layers/studio/shared/storage/themes-s3'

const INSTANCE = { '@vignettes/theme-kit': '0.1.0+new' }
vi.stubGlobal('useRuntimeConfig', () => ({ themePackages: INSTANCE, public: {} }))

const { loadTenantThemes, publishedThemeVersionGaps } = await import('../../layers/studio/server/utils/themes')

describe('the published themes compiled with other theme packages', () => {
  let root: string
  let cwd: string
  const contentDir = process.env.NUXT_CONTENT_DIR

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'theme-gaps-'))
    process.env.NUXT_CONTENT_DIR = join(root, 'content')
    const old = { '@vignettes/theme-kit': '0.1.0+old' }
    mkdirSync(join(root, themeLocalPath()), { recursive: true })
    writeFileSync(join(root, themeLocalPath('index.json')), JSON.stringify(indexOf([
      { tokens: { name: 'published' }, aliases: [], publishedAt: '2026-10-27', compiledWith: old },
      { tokens: { name: 'on-disk' }, aliases: [], publishedAt: '2026-10-27', compiledWith: old },
    ])))
    mkdirSync(join(root, 'content/themes/on-disk'), { recursive: true })
    writeFileSync(join(root, 'content/themes/on-disk/theme.json'), JSON.stringify({ name: 'on-disk' }))
    cwd = process.cwd()
    process.chdir(root)
  })

  afterAll(() => {
    if (contentDir === undefined)
      delete process.env.NUXT_CONTENT_DIR
    else process.env.NUXT_CONTENT_DIR = contentDir
    process.chdir(cwd)
    rmSync(root, { recursive: true, force: true })
    setThemeRegistry(null)
  })

  it('are logged and listed, except a theme the content space on disk compiles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadTenantThemes()
    expect(publishedThemeVersionGaps()).toEqual([
      { theme: 'published', package: '@vignettes/theme-kit', compiled: '0.1.0+old', instance: '0.1.0+new' },
    ])
    expect(warn.mock.calls.map(call => String(call[0])).join('\n')).toContain('published: @vignettes/theme-kit 0.1.0+old, this instance 0.1.0+new')
    warn.mockRestore()
  })
})

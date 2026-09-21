import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
// @ts-expect-error the watcher is a plain JavaScript Vite plugin with no declaration file
import { packageDirs } from '../../packages/nuxt/src/build/theme-watcher.js'

const dir = mkdtempSync(join(tmpdir(), 'watcher-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function theme(name: string, scss: string) {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, `${name}.scss`), scss)
  return { name, dir: join(dir, name) }
}

describe('the packages a theme watcher follows', () => {
  it('are the ones the stylesheets import, resolved where they are installed', () => {
    const brand = theme('brand', '@use \'pkg:@vignettes/theme-kit\';\n@use \'pkg:@vignettes/theme-kit/presets/layout\';')
    expect(packageDirs(process.cwd(), [brand])).toEqual([resolve('packages/theme-kit')])
  })

  it('leave out a package that is not installed and a theme that imports none', () => {
    const plain = theme('plain', '.reveal { color: red; }')
    const ghost = theme('ghost', '@use \'pkg:@nobody/nothing\';')
    expect(packageDirs(process.cwd(), [plain, ghost])).toEqual([])
  })
})

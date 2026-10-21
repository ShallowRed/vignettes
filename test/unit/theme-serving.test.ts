import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { themeLocalPath, themeObjectKey } from '../../layers/studio/shared/storage/themes-s3'

vi.stubGlobal('defineEventHandler', (handler: any) => handler)
vi.stubGlobal('createError', (e: any) => Object.assign(new Error(e.statusMessage), e))
vi.stubGlobal('getRouterParam', (e: any, name: string) => e.params?.[name])
vi.stubGlobal('setResponseHeader', (e: any, name: string, value: unknown) => {
  ;(e.headers ??= {})[name] = value
})

const { default: serveTheme } = await import('../../layers/studio/server/routes/themes/[...path]')

let root: string
let cwd: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'themes-'))
  mkdirSync(join(root, themeLocalPath('brand')), { recursive: true })
  writeFileSync(join(root, themeLocalPath('brand.css')), ':root { --accent: rebeccapurple }')
  cwd = process.cwd()
  process.chdir(root)
})

afterAll(() => {
  process.chdir(cwd)
  rmSync(root, { recursive: true, force: true })
})

describe('themeLocalPath', () => {
  it('mirrors the object key under the local directory', () => {
    expect(themeObjectKey('brand', 'assets/bg.png')).toBe('themes/brand/assets/bg.png')
    expect(themeLocalPath('brand', 'assets/bg.png')).toBe('.themes/brand/assets/bg.png')
  })
})

describe('the themes route', () => {
  it('serves a theme stylesheet from disk when no bucket is configured', async () => {
    const event: any = { params: { path: 'brand.css' } }
    const body = await serveTheme(event)
    expect(body.toString()).toContain('rebeccapurple')
    expect(event.headers['Content-Type']).toBe('text/css; charset=utf-8')
  })

  it('answers 404 on a theme it does not hold', async () => {
    await expect(serveTheme({ params: { path: 'absent.css' } })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('refuses a path that climbs out of the directory', async () => {
    await expect(serveTheme({ params: { path: '..%2F.env' } })).rejects.toMatchObject({ statusCode: 404 })
  })
})

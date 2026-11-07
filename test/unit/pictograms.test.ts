import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('useStorage', () => ({ getKeys: async () => ['README.md', 'digital:coding.svg', 'buildings:house.svg'] }))

const { listPictograms } = await import('../../layers/studio/server/utils/pictograms')

describe('the pictograms a deck can name', () => {
  let root: string
  const contentDir = process.env.NUXT_CONTENT_DIR

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'pictograms-'))
    for (const file of ['equipe/atelier.svg', 'digital/coding.svg', 'equipe/notes.txt']) {
      const path = join(root, 'content/assets/pictograms', file)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, '<svg/>')
    }
  })

  afterAll(() => {
    if (contentDir === undefined)
      delete process.env.NUXT_CONTENT_DIR
    else process.env.NUXT_CONTENT_DIR = contentDir
    rmSync(root, { recursive: true, force: true })
  })

  it('lists those of the application and of the content space once each, by their path without the extension', async () => {
    process.env.NUXT_CONTENT_DIR = join(root, 'content')
    expect(await listPictograms()).toEqual(['buildings/house', 'digital/coding', 'equipe/atelier'])
  })

  it('lists those of the application for a content space without pictograms', async () => {
    process.env.NUXT_CONTENT_DIR = join(root, 'empty')
    expect(await listPictograms()).toEqual(['buildings/house', 'digital/coding'])
  })
})

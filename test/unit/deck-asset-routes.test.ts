import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anon, stubH3Globals } from './helpers/server-db'

// The deck assets of the content space, read from `presentations/assets/` under
// the working directory when no bucket is configured.
stubH3Globals()

const { default: serveImage } = await import('../../layers/studio/server/routes/images/[...path]')
const { default: serveBackground } = await import('../../layers/studio/server/routes/backgrounds/[...path]')
const { default: servePictogram } = await import('../../layers/studio/server/routes/pictograms/[...path]')

const cwd = process.cwd()
const workdir = mkdtempSync(join(tmpdir(), 'deck-assets-'))
beforeAll(() => {
  mkdirSync(join(workdir, 'presentations', 'assets', 'backgrounds'), { recursive: true })
  writeFileSync(join(workdir, 'presentations', 'assets', 'backgrounds', 'plan.svg'), '<svg id="backgrounds"/>')
  mkdirSync(join(workdir, '.data'))
  writeFileSync(join(workdir, '.data', 'slides.db'), 'accounts')
  process.chdir(workdir)
})
afterAll(() => {
  process.chdir(cwd)
  rmSync(workdir, { recursive: true, force: true })
})

describe('the deck asset routes', () => {
  it('read a file of the content space from disk', async () => {
    expect(String(await serveBackground(anon({ params: { path: 'plan.svg' } })))).toBe('<svg id="backgrounds"/>')
  })

  it.each([
    ['/images', serveImage],
    ['/backgrounds', serveBackground],
    ['/pictograms', servePictogram],
  ])('%s answers 404 on a path that climbs out of the directory', async (_, serve) => {
    await expect(serve(anon({ params: { path: '..%2F..%2F..%2F.data%2Fslides.db' } }))).rejects.toMatchObject({ statusCode: 404 })
  })
})

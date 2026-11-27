import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { classifyImageSource, SITE_PATH_PREFIXES, UPLOADED_FILE_PATHS } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

const ROUTES = resolve('layers/studio/server/routes')

describe('the paths of the site that serve files (SITE_PATH_PREFIXES)', () => {
  it('names each folder of the routes of the studio that serves files, the uploads apart', () => {
    const served = readdirSync(ROUTES, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && readdirSync(resolve(ROUTES, entry.name)).includes('[...path].ts'))
      .map(entry => entry.name)
    const uploads = UPLOADED_FILE_PATHS.map(path => path.replaceAll('/', ''))
    expect(served.filter(name => !uploads.includes(name)).sort()).toEqual([...SITE_PATH_PREFIXES].sort())
  })

  it('reads each entry of public/ as a file of the site', () => {
    for (const entry of readdirSync(resolve('public'), { withFileTypes: true })) {
      const path = entry.isDirectory() ? `/${entry.name}/x.png` : `/${entry.name}`
      expect([path, classifyImageSource(path).kind]).toEqual([path, 'site'])
    }
  })
})

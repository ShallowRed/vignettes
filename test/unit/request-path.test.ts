import { join } from 'node:path'
import { safePathSegments } from '@vignettes/core/paths'
import { describe, expect, it } from 'vitest'
import { fileUnder, requestPathSegments } from '../../layers/studio/server/utils/request-path'
import { ESCAPING_PATHS } from './helpers/fixtures'
import { stubH3Globals } from './helpers/server-db'

stubH3Globals()

const segmentsOf = (path: string) => requestPathSegments({ params: { path } } as any)

describe('safePathSegments', () => {
  it('keeps the segments of a relative path, empty ones dropped', () => {
    expect(safePathSegments('brand/assets//bg.png')).toEqual(['brand', 'assets', 'bg.png'])
    expect(safePathSegments('/images/mon plan.svg')).toEqual(['images', 'mon plan.svg'])
    expect(safePathSegments('archive.2026.tar.gz')).toEqual(['archive.2026.tar.gz'])
  })

  it('refuses a dot segment, a backslash and a NUL byte', () => {
    for (const path of ['..', 'a/../b', './a', 'a\\..\\b', 'a\0.png'])
      expect(safePathSegments(path)).toBeNull()
  })
})

describe('requestPathSegments', () => {
  it('decodes the path once', () => {
    expect(segmentsOf('mon%20plan.svg')).toEqual(['mon plan.svg'])
    // A double encoding stays a literal name after the one decoding.
    expect(segmentsOf('%252e%252e/x')).toEqual(['%2e%2e', 'x'])
  })

  it.each(ESCAPING_PATHS)('answers 404 on %s', (path) => {
    expect(() => segmentsOf(path)).toThrow(expect.objectContaining({ statusCode: 404 }))
  })

  it('answers 404 on an empty path', () => {
    expect(() => segmentsOf('')).toThrow(expect.objectContaining({ statusCode: 404 }))
  })

  it('reads an absolute path under the root', () => {
    expect(fileUnder('/srv/media', segmentsOf('%2Fetc%2Fpasswd'))).toBe(join('/srv/media', 'etc', 'passwd'))
  })
})

describe('fileUnder', () => {
  it('answers 404 on segments that resolve outside the root', () => {
    expect(() => fileUnder('/srv/media', ['..', 'secret'])).toThrow(expect.objectContaining({ statusCode: 404 }))
    expect(() => fileUnder('/srv/media', [])).toThrow(expect.objectContaining({ statusCode: 404 }))
  })
})

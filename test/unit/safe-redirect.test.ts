import { safeRedirectPath } from '#shared/access'
import { describe, expect, it } from 'vitest'

describe('safeRedirectPath', () => {
  it.each([
    ['/edit/deck', '/edit/deck'],
    ['/p/demo?draft#/2', '/p/demo?draft#/2'],
    ['/a/../b', '/b'],
    // A percent-encoded separator stays a character of the path.
    ['/%5Cother.example', '/%5Cother.example'],
    ['/%2F%2Fother.example', '/%2F%2Fother.example'],
    ['/./%5Cother.example', '/%5Cother.example'],
  ])('keeps the path %s of this instance', (value, path) => {
    expect(safeRedirectPath(value)).toBe(path)
  })

  it.each([
    '//other.example',
    '/\\other.example',
    '\\\\other.example',
    '/\t/other.example',
    '/\n/other.example',
    '/..//other.example',
    '/.//other.example',
    '/%2e//other.example',
    // `getQuery` decodes `/./%5Cother.example` into this value.
    '/./\\other.example',
    'https://other.example/',
    'javascript:alert(1)',
    'other.example',
    '',
  ])('answers the fallback for %j, which a browser resolves outside the instance', (value) => {
    expect(safeRedirectPath(value)).toBe('/')
  })

  it('answers the fallback for a value that is not a string', () => {
    expect(safeRedirectPath(['/a', '/b'])).toBe('/')
    expect(safeRedirectPath(undefined, '/login')).toBe('/login')
  })
})

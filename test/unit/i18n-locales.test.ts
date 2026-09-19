import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const LOCALES_DIR = join(import.meta.dirname, '../../layers/studio/i18n/locales')

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null)
    return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
}

function messages(locale: string, file: string): unknown {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), 'utf8'))
}

describe('the locale files', () => {
  const files = readdirSync(join(LOCALES_DIR, 'fr'))

  it('exist for every locale', () => {
    expect(readdirSync(join(LOCALES_DIR, 'en')).sort()).toEqual([...files].sort())
  })

  it.each(files)('%s carries the same keys in every locale', (file) => {
    expect(keysOf(messages('en', file)).sort()).toEqual(keysOf(messages('fr', file)).sort())
  })
})

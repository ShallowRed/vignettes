import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitFrontmatter } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'

// The header and the index of each series of decisions, as docs/decisions/0000-recording-decisions.md sets them.
const docs = join(dirname(fileURLToPath(import.meta.url)), '../../docs')
const STATUS_RE = /^(?:proposed|accepted|rejected|deprecated|superseded by (\d{4}))$/

describe.each(['decisions', 'design'])('the series %s', (series) => {
  const folder = join(docs, series)
  const files = readdirSync(folder).filter(file => /^\d{4}-[a-z0-9-]+\.md$/.test(file)).sort()
  const numbers = new Set(files.map(file => file.slice(0, 4)))

  it.each(files)('%s has a known status, a date and its decision-makers', (file) => {
    const { status, date, 'decision-makers': makers } = splitFrontmatter(readFileSync(join(folder, file), 'utf8')).data
    const known = STATUS_RE.exec(String(status))
    expect(known, `status "${status}"`).not.toBeNull()
    if (known?.[1])
      expect(numbers.has(known[1]), `${file} is superseded by a decision that does not exist`).toBe(true)
    expect(String(date instanceof Date ? date.toISOString().slice(0, 10) : date)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(makers).toBeTruthy()
  })

  it('lists every decision in its index', () => {
    const index = readFileSync(join(folder, 'README.md'), 'utf8')
    expect(files.filter(file => !index.includes(`(${file})`))).toEqual([])
  })
})

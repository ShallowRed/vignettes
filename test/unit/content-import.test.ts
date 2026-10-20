import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { migrateSqlite, openSqlite } from '../../layers/studio/server/db/sqlite/index'

const dir = mkdtempSync(join(tmpdir(), 'content-import-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('content import (scripts/content-import.ts)', () => {
  it('leaves out a stub whose frontmatter is not YAML and says so in the plan', () => {
    const content = join(dir, 'presentations')
    const db = join(dir, 'slides.db')
    migrateSqlite(openSqlite(db))
    mkdirSync(content)
    writeFileSync(join(content, 'bilan.md'), '---\ntitle: Bilan\n---\n\n# Bilan\n')
    writeFileSync(join(content, 'casse.md'), '---\ntitle: [Casse\n---\n\n# Casse\n')

    const plan = execFileSync(process.execPath, ['scripts/content-import.ts', `--content=${content}`, `--db=${db}`], { encoding: 'utf8' })

    expect(plan).toMatch(/decks à créer \(1\)\n {2}· bilan\n/)
    expect(plan).toContain('casse : frontmatter illisible, stub ignoré')
  })
})

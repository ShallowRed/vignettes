import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { createSqliteStores, migrateSqlite, openSqlite } from '../../layers/studio/server/db/sqlite/index'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'

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

  it('leaves out a registry entry whose bundle is not a slug and says so in the plan', () => {
    const content = join(dir, 'registry')
    const db = join(dir, 'registry.db')
    migrateSqlite(openSqlite(db))
    mkdirSync(content)
    writeFileSync(join(content, 'talk.md'), '---\ntitle: Talk\n---\n\n# Talk\n')
    writeFileSync(join(content, 'registry.yml'), 'talk:\n  lifecycle: frozen\n  frozenBundle: ..\n')

    const plan = execFileSync(process.execPath, ['scripts/content-import.ts', `--content=${content}`, `--db=${db}`], { encoding: 'utf8' })

    expect(plan).toMatch(/alias canoniques \(0\)\n/)
    expect(plan).toContain('entrée de registre "talk" ignorée')
  })

  it('brings along the draft of a managed deck it republishes and of a row that predates the managed flag', async () => {
    const content = join(dir, 'follow')
    const db = join(dir, 'follow.db')
    const sqlite = openSqlite(db)
    migrateSqlite(sqlite)
    const stores = createSqliteStores(sqlite)
    mkdirSync(content)
    const v1 = (title: string) => `---\ntitle: ${title}\n---\n\n# v1\n`
    const v2 = (title: string) => `---\ntitle: ${title}\n---\n\n# v2\n`
    writeFileSync(join(content, 'gere.md'), v1('Géré'))
    execFileSync(process.execPath, ['scripts/content-import.ts', `--content=${content}`, `--db=${db}`, '--apply'], { encoding: 'utf8' })
    await stores.drafts.create('gere', markdownToYDocUpdate(v1('Géré')))
    // A deck the studio created, with a published version and no managed flag.
    await stores.drafts.create('ancien', markdownToYDocUpdate(v1('Ancien')))
    await stores.archive.apply([{ kind: 'version', slug: 'ancien', raw: v1('Ancien') }], { by: 'ed', at: new Date() })
    writeFileSync(join(content, 'gere.md'), v2('Géré'))
    writeFileSync(join(content, 'ancien.md'), v2('Ancien'))

    const output = execFileSync(process.execPath, ['scripts/content-import.ts', `--content=${content}`, `--db=${db}`, '--apply', '--republish=gere'], { encoding: 'utf8' })

    expect(output).toContain('brouillons mis à jour : gere, ancien')
    expect(yDocUpdateToMarkdown((await stores.drafts.load('gere'))!)).toBe(v2('Géré'))
    expect(yDocUpdateToMarkdown((await stores.drafts.load('ancien'))!)).toBe(v2('Ancien'))
  })
})

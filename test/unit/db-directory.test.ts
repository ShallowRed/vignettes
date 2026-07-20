import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDeckMeta } from '../../server/db/deck-meta'
import { createDbDirectory } from '../../server/db/directory'
import { deckAliases, deckDrafts, deckPermissions, decks, deckVersions, projects, users } from '../../server/db/schema'
import { freshDb } from './helpers/db'

describe('db directory', () => {
  let db: ReturnType<typeof freshDb>
  let directory: ReturnType<typeof createDbDirectory>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
    directory = createDbDirectory(db)
  })

  it('resolves a deck by canonical alias, slug and historical alias', async () => {
    db.insert(decks).values({
      slug: 'pipeline-recrutement',
      alias: 'ecran-pipeline',
      title: 'Pipeline',
      lifecycle: 'frozen',
      frozenBundle: 'ecran-pipeline',
      createdAt: now,
      updatedAt: now,
    }).run()
    db.insert(deckAliases).values({ alias: 'codimd/abc123', deckSlug: 'pipeline-recrutement' }).run()

    for (const key of ['ecran-pipeline', 'pipeline-recrutement', 'codimd/abc123']) {
      const entry = await directory.decks.resolveAlias(key)
      expect(entry).toMatchObject({
        alias: 'ecran-pipeline',
        slug: 'pipeline-recrutement',
        lifecycle: 'frozen',
        frozenBundle: 'ecran-pipeline',
        aliases: ['codimd/abc123'],
      })
    }
  })

  it('keeps alias-less decks out of the directory', async () => {
    db.insert(decks).values({ slug: 'draft-only', title: 'D', createdAt: now, updatedAt: now }).run()
    expect(await directory.decks.resolveAlias('draft-only')).toBeNull()
    expect(await directory.decks.list()).toEqual([])
  })

  it('lists projects ordered, resolving one by slug', async () => {
    db.insert(projects).values([
      { slug: 'zeta', title: 'Zeta', order: 2, createdAt: now, updatedAt: now },
      { slug: 'alpha', title: 'Alpha', order: 1, color: '#2563eb', createdAt: now, updatedAt: now },
    ]).run()
    expect((await directory.projects.list()).map(p => p.slug)).toEqual(['alpha', 'zeta'])
    expect(await directory.projects.resolve('alpha')).toMatchObject({ title: 'Alpha', color: '#2563eb' })
    expect(await directory.projects.resolve('ghost')).toBeNull()
  })
})

describe('deck meta', () => {
  let db: ReturnType<typeof freshDb>
  const now = new Date(1700000000000)

  beforeEach(() => {
    db = freshDb()
  })

  it('lists only managed rows, so draft anchors never shadow file stubs', async () => {
    db.insert(decks).values([
      { slug: 'anchor', title: 'anchor', createdAt: now, updatedAt: now },
      { slug: 'curated', title: 'Curated', status: 'public', managed: true, createdAt: now, updatedAt: now },
    ]).run()
    const meta = createDeckMeta(db)
    expect((await meta.listManaged()).map(d => d.slug)).toEqual(['curated'])
    expect(await meta.get('anchor')).toMatchObject({ managed: false, status: 'private' })
  })

  it('fails closed on an invalid stored status', async () => {
    db.insert(decks).values({ slug: 'd', title: 'D', status: 'everyone', managed: true, createdAt: now, updatedAt: now }).run()
    expect((await createDeckMeta(db).get('d'))!.status).toBe('private')
  })

  it('update makes the row managed, creating or patching it', async () => {
    const meta = createDeckMeta(db)
    const created = await meta.update('fresh', { status: 'public', alias: 'fresh-alias' })
    expect(created).toMatchObject({ slug: 'fresh', status: 'public', alias: 'fresh-alias', managed: true })

    const patched = await meta.update('fresh', { title: 'Fresh', unlisted: true })
    // A partial patch leaves earlier fields intact.
    expect(patched).toMatchObject({ title: 'Fresh', status: 'public', alias: 'fresh-alias', unlisted: true })
  })

  it('purge erases every trace of the deck and only that deck', async () => {
    const meta = createDeckMeta(db)
    db.insert(users).values({ id: 7, login: 'ana', createdAt: now, lastLoginAt: now }).run()
    db.insert(decks).values([
      { slug: 'doomed', title: 'Doomed', managed: true, createdAt: now, updatedAt: now },
      { slug: 'kept', title: 'Kept', managed: true, createdAt: now, updatedAt: now },
    ]).run()
    const version = db.insert(deckVersions)
      .values({ deckSlug: 'doomed', raw: '# d', publishedBy: 'ana', publishedAt: now })
      .returning({ id: deckVersions.id })
      .get()!
    db.update(decks).set({ publishedVersionId: version.id }).where(eq(decks.slug, 'doomed')).run()
    db.insert(deckDrafts).values({ deckSlug: 'doomed', ydoc: Buffer.from([1]), updatedAt: now }).run()
    db.insert(deckAliases).values({ alias: 'old-path', deckSlug: 'doomed' }).run()
    db.insert(deckPermissions).values({ deckSlug: 'doomed', userId: 7, role: 'viewer', grantedBy: 'ana', createdAt: now }).run()

    expect(await meta.purge('doomed')).toBe(true)
    expect(await meta.get('doomed')).toBeNull()
    expect(db.select().from(deckVersions).all()).toEqual([])
    expect(db.select().from(deckDrafts).all()).toEqual([])
    expect(db.select().from(deckAliases).all()).toEqual([])
    expect(db.select().from(deckPermissions).all()).toEqual([])
    expect(await meta.get('kept')).not.toBeNull()

    expect(await meta.purge('ghost')).toBe(false)
  })
})

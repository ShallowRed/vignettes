import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { copySqliteToPostgres } from '../../layers/studio/server/db/postgres/copy-from-sqlite'
import { createPostgresStores } from '../../layers/studio/server/db/postgres/index'
import * as pgSchema from '../../layers/studio/server/db/postgres/schema'
import { createSqliteStores } from '../../layers/studio/server/db/sqlite/index'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { freshPglite, freshSqlite, NOW, PGLITE_TIMEOUT, seedUser, sqliteRows } from './helpers/adapters'

describe('copy of a SQLite database into PostgreSQL', () => {
  let target: Awaited<ReturnType<typeof freshPglite>>

  beforeAll(async () => {
    target = await freshPglite()
  }, PGLITE_TIMEOUT)

  afterAll(() => target.close(), PGLITE_TIMEOUT)

  it('copies every row, then numbers the next version and the next account after the ids the source gave', async () => {
    const source = freshSqlite()
    const from = createSqliteStores(source)
    await seedUser(sqliteRows(source), 101, 'alice')
    await seedUser(sqliteRows(source), 202, 'bob')
    await from.users.remove(202)
    await from.projects.create({ title: 'Atelier' })
    await from.content.writer.save({ slug: 'deck', raw: '---\ntitle: Deck\nproject: atelier\n---\n\n# One', actor: 'alice' })
    await from.drafts.save('deck', markdownToYDocUpdate('# Draft'))
    await from.snapshots.add('deck', { raw: '# Snapshot', authors: ['alice'], at: NOW })
    await from.deckGrants.set('deck', 101, 'editor', 'alice')

    // A server that started on the target recorded its data migrations there.
    await target.db.insert(pgSchema.dataMigrations).values({ name: 'index-existing-deck-media', appliedAt: NOW })
    const copied = await copySqliteToPostgres(source, target.db)

    expect(copied).toMatchObject({ users: 1, projects: 1, decks: 1, deck_versions: 1, deck_draft_snapshots: 1, deck_drafts: 1, deck_permissions: 1, data_migrations: 0 })
    expect(await target.db.select().from(pgSchema.dataMigrations)).toEqual([])
    const to = createPostgresStores(target.db)
    expect(await to.archive.decks()).toEqual(await from.archive.decks())
    expect(yDocUpdateToMarkdown((await to.drafts.load('deck'))!)).toBe('# Draft')
    expect(await to.snapshots.list('deck')).toEqual(await from.snapshots.list('deck'))
    expect(await to.deckGrants.listForDeck('deck')).toEqual(await from.deckGrants.listForDeck('deck'))
    await to.content.writer.save({ slug: 'deck', raw: '# Two', actor: 'alice' })
    expect((await to.versionHistory.list('deck')).map(version => version.id)).toEqual([2, 1])
    await expect(to.users.upsertOAuthLogin({ provider: 'google', providerId: 'sub-carol', login: 'carol@example.com' }, 'viewer')).resolves.toMatchObject({ id: 203 })

    await expect(copySqliteToPostgres(source, target.db)).rejects.toThrow(/already holds rows/)
  })
})

import { beforeEach, describe, expect, it } from 'vitest'
import { listVisiblePresentations, listVisibleProjects } from '../../layers/studio/server/utils/catalog'
import { useDraftStore, writeDraftText } from '../../layers/studio/server/utils/collab'
import { useDbContent, useDeckMeta, usePermissionStore, useProjectPermissionStore } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals, testRows } from './helpers/server-db'

// The catalog reports capability, not role: an `editor` grant is what the server
// accepts for editing, so the payload must say so (the card's pencil follows it).
stubH3Globals()
setupServerDb()

const collab = () => asUser(10, 'collab')

beforeEach(async () => {
  // A published private deck plus an unpublished one, both in the same folder.
  await useDeckMeta().update('published-deck', { title: 'Publié', status: 'private', project: 'client' })
  await useDeckMeta().update('draft-deck', { title: 'Brouillon', status: 'private', project: 'client' })
  await testRows().update('decks', { publishedVersionId: 1 }, { slug: 'published-deck' })
  await seedAccount(10, 'collab', 'viewer')
})

describe('listVisiblePresentations', () => {
  it('reports canEdit for an editor grant on the deck', async () => {
    await usePermissionStore().set('published-deck', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
  })

  it('reports canShare and the password state to the editor of the deck, and to nobody else', async () => {
    await usePermissionStore().set('published-deck', 10, 'editor', 'boss')
    await seedAccount(11, 'reader', 'viewer')
    await usePermissionStore().set('published-deck', 11, 'viewer', 'boss')
    const mine = (await listVisiblePresentations(collab())).find(d => d.slug === 'published-deck')
    expect(mine).toMatchObject({ canShare: true, hasPassword: false })
    const theirs = (await listVisiblePresentations(asUser(11, 'reader'))).find(d => d.slug === 'published-deck')
    expect(theirs?.canShare).toBeUndefined()
    expect(theirs?.hasPassword).toBeUndefined()
  })

  it('a folder editor grant opens every deck in it, unpublished ones included', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.find(d => d.slug === 'published-deck')?.canEdit).toBe(true)
    expect(listed.map(d => d.slug)).toContain('draft-deck')
  })

  it('a read-only grant sees published decks only, with no edit affordance', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    const listed = await listVisiblePresentations(collab())
    expect(listed.map(d => d.slug)).toEqual(['published-deck'])
    expect(listed[0]!.canEdit).toBeUndefined()
  })

  it('says nothing about editing to an anonymous visitor', async () => {
    const listed = await listVisiblePresentations(anon())
    expect(listed.every(d => d.canEdit === undefined)).toBe(true)
  })
})

describe('listVisibleProjects', () => {
  it('exposes the actor\'s own folder grant so the UI can key create on it', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const folders = await listVisibleProjects(collab())
    expect(folders.find(p => p.slug === 'client')?.myGrant).toBe('editor')
  })
})

describe('unpublished changes', () => {
  const DECK = '---\ntitle: Live\nstatus: public\n---\n# v1\n'

  it('flags, for whoever may edit, a draft that differs from the published text', async () => {
    await seedAccount(3, 'ed', 'editor')
    await useDbContent().writer.save({ slug: 'live', raw: DECK, actor: 'ed', accessFromText: true })
    await writeDraftText('live', DECK.replace('# v1', '# v2'))
    const listed = await listVisiblePresentations(asUser(3, 'ed'))
    expect(listed.find(d => d.slug === 'live')?.unpublishedChanges).toBe(true)
    // A visitor never learns about drafts.
    expect((await listVisiblePresentations(anon())).find(d => d.slug === 'live')?.unpublishedChanges).toBeUndefined()
  })

  it('stays quiet when the draft only repeats the published text', async () => {
    await seedAccount(3, 'ed', 'editor')
    await useDbContent().writer.save({ slug: 'live', raw: DECK, actor: 'ed', accessFromText: true })
    await writeDraftText('live', DECK)
    const listed = await listVisiblePresentations(asUser(3, 'ed'))
    expect(listed.find(d => d.slug === 'live')?.unpublishedChanges).toBeUndefined()
  })
})

describe('the date and the flag of a published deck', () => {
  const DECK = '---\ntitle: Live\nstatus: public\n---\n# v1\n'
  const PAST = new Date('2026-01-01T00:00:00Z')
  const FUTURE = new Date(Date.now() + 3_600_000)
  const card = async (slug: string) => (await listVisiblePresentations(asUser(3, 'ed'))).find(d => d.slug === slug)

  beforeEach(async () => {
    await seedAccount(3, 'ed', 'editor')
    await useDbContent().writer.save({ slug: 'live', raw: DECK, actor: 'ed', accessFromText: true })
  })

  it('keep the date of the version for a draft equal to it, saved later', async () => {
    await testRows().update('deckVersions', { publishedAt: PAST }, { deckSlug: 'live' })
    await testRows().update('decks', { updatedAt: PAST }, { slug: 'live' })
    await writeDraftText('live', DECK)
    expect(await card('live')).toMatchObject({ updatedAt: PAST.getTime() })
    expect((await card('live'))?.unpublishedChanges).toBeUndefined()
  })

  it('take the date of a draft that differs from the version', async () => {
    await testRows().update('deckVersions', { publishedAt: PAST }, { deckSlug: 'live' })
    await testRows().update('decks', { updatedAt: PAST }, { slug: 'live' })
    await writeDraftText('live', DECK.replace('# v1', '# v2'))
    expect(await card('live')).toMatchObject({ updatedAt: await useDraftStore().stamp('live'), unpublishedChanges: true })
  })

  it('flag a draft that differs from a version published after it', async () => {
    await writeDraftText('live', DECK.replace('# v1', '# v2'))
    await testRows().update('deckVersions', { publishedAt: FUTURE }, { deckSlug: 'live' })
    expect(await card('live')).toMatchObject({ unpublishedChanges: true })
  })
})

describe('the date of a deck never published', () => {
  const DRAFT = '---\ntitle: Brouillon\n---\n# Brouillon\n'

  it('is the last draft save, for whoever may edit the deck', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    await writeDraftText('draft-deck', DRAFT)
    const stamp = await useDraftStore().stamp('draft-deck')
    const listed = await listVisiblePresentations(collab())
    expect(listed.find(d => d.slug === 'draft-deck')?.updatedAt).toBe(stamp)
  })
})

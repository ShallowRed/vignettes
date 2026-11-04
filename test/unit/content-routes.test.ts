import { Buffer } from 'node:buffer'
import process from 'node:process'
import { MAX_DECK_LENGTH } from '@vignettes/core/deck'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { hasRoom, useCollabServer, useDraftStore, useSnapshotStore, writeDraftText } from '../../layers/studio/server/utils/collab'
import { useStores } from '../../layers/studio/server/utils/db'
import { useMediaIndex, useProjectStore } from '../../layers/studio/server/utils/sources'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { NOW, seedDeck } from './helpers/adapters'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals, testRows } from './helpers/server-db'

// The routes of the remote content scripts, reached with the content token.
stubH3Globals()
setupServerDb()

const { default: push } = await import('../../layers/studio/server/api/content/push.post')
const { default: pull } = await import('../../layers/studio/server/api/content/decks.get')
const { default: renameTheme } = await import('../../layers/studio/server/api/content/theme-rename.post')

const token = (over: Record<string, unknown>) => anon({ headers: { authorization: 'Bearer secret-token' }, ...over })
const stub = (slug: string, raw: string, over: Record<string, unknown> = {}) => ({ slug, raw, registry: null, unlisted: false, ...over })

let previous: string | undefined
beforeAll(() => {
  previous = process.env.NUXT_CONTENT_TOKEN
  process.env.NUXT_CONTENT_TOKEN = 'secret-token'
})
afterAll(() => {
  if (previous === undefined)
    delete process.env.NUXT_CONTENT_TOKEN
  else process.env.NUXT_CONTENT_TOKEN = previous
})

describe('the content routes', () => {
  it('refuse a request without the token or a privileged session', async () => {
    await expect(pull(anon({ query: { slugs: 'deck' } }))).rejects.toMatchObject({ statusCode: 401 })
    await seedAccount(7, 'viewer', 'viewer')
    await expect(pull(asUser(7, 'viewer', { query: { slugs: 'deck' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('push plans, then creates a deck from its frontmatter and the registry', async () => {
    const raw = '---\ntitle: Pushed\nstatus: public\n---\n\n# One'
    const registry = { alias: 'pushed-alias', lifecycle: 'live', frozenBundle: null }
    await expect(push(token({ body: { stubs: [stub('pushed', raw, { registry })], apply: false } })))
      .resolves
      .toEqual([{ slug: 'pushed', action: 'create', folderMissing: null }])
    expect(await testRows().select('decks', { slug: 'pushed' })).toEqual([])

    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    await push(token({ body: { stubs: [stub('pushed', raw, { registry })], apply: true } }))
    expect(log).toHaveBeenCalledWith('[content] content-token pushed pushed (create)')
    log.mockRestore()
    expect((await testRows().select('decks', { slug: 'pushed' }))[0]).toMatchObject({ title: 'Pushed', status: 'public', alias: 'pushed-alias', managed: true })
    await expect(push(token({ body: { stubs: [stub('pushed', raw)], apply: true } })))
      .resolves
      .toEqual([{ slug: 'pushed', action: 'identical', folderMissing: null }])
  })

  it('push republishes a deck it owns with its access axes untouched, and refuses a trashed one', async () => {
    await push(token({ body: { stubs: [stub('owned', '---\ntitle: Owned\n---\n\n# One')], apply: true } }))
    await push(token({ body: { stubs: [stub('owned', '---\ntitle: Renamed\nstatus: public\n---\n\n# Two')], apply: true } }))
    expect((await testRows().select('decks', { slug: 'owned' }))[0]).toMatchObject({ title: 'Renamed', status: 'private' })
    expect(await testRows().select('deckVersions', { deckSlug: 'owned' })).toHaveLength(2)

    await seedDeck(testRows(), 'binned', { deletedAt: NOW })
    await expect(push(token({ body: { stubs: [stub('binned', '# B')], apply: true } })))
      .resolves
      .toEqual([{ slug: 'binned', action: 'trashed', folderMissing: null }])
  })

  it('push brings along a draft that holds the version it replaces, in its lineage, and tells an open room', async () => {
    const push1 = (raw: string, apply = true) => push(token({ body: { stubs: [stub('followed', raw)], apply } }))
    await push1('# v1')
    const open = await useCollabServer().openDirectConnection('followed', { deck: 'followed' })
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(open.document!))
    const announced = vi.spyOn(open.document!, 'broadcastStateless')
    const snapshots = await useSnapshotStore().list('followed')

    await expect(push1('# v2', false)).resolves.toEqual([{ slug: 'followed', action: 'republish', folderMissing: null, draft: 'updated' }])
    expect(open.document!.getText('codemirror').toString()).toBe('# v1')
    await expect(push1('# v2')).resolves.toEqual([{ slug: 'followed', action: 'republish', folderMissing: null, draft: 'updated' }])
    expect(open.document!.getText('codemirror').toString()).toBe('# v2')
    expect(announced).toHaveBeenCalledWith(expect.stringContaining('"published"'))
    Y.applyUpdate(tab, (await useDraftStore().load('followed'))!)
    expect(tab.getText('codemirror').toString()).toBe('# v2')
    expect(await useSnapshotStore().list('followed')).toEqual(snapshots)
    await open.disconnect()
  })

  it('push keeps a draft with changes the editor did not publish, and gives no draft to a deck without one', async () => {
    const push1 = (slug: string, raw: string) => push(token({ body: { stubs: [stub(slug, raw)], apply: true } }))
    await push1('edited', '# v1')
    await writeDraftText('edited', '# v1 edited online')
    const stamp = await useDraftStore().stamp('edited')
    await expect(push1('edited', '# v2')).resolves.toEqual([{ slug: 'edited', action: 'republish', folderMissing: null, draft: 'kept' }])
    expect(yDocUpdateToMarkdown((await useDraftStore().load('edited'))!)).toBe('# v1 edited online')
    expect(await useDraftStore().stamp('edited')).toBe(stamp)

    await push1('bare', '# v1')
    await expect(push1('bare', '# v2')).resolves.toEqual([{ slug: 'bare', action: 'republish', folderMissing: null, draft: 'none' }])
    expect(await useDraftStore().load('bare')).toBeNull()

    // A deck never published whose draft was written in the studio.
    await writeDraftText('unpublished', '# work in progress')
    await expect(push1('unpublished', '# v1')).resolves.toEqual([{ slug: 'unpublished', action: 'republish', folderMissing: null, draft: 'kept' }])
    expect(yDocUpdateToMarkdown((await useDraftStore().load('unpublished'))!)).toBe('# work in progress')
  })

  it('push writes nothing to a draft that already holds the new version', async () => {
    const push1 = (raw: string) => push(token({ body: { stubs: [stub('ahead', raw)], apply: true } }))
    await push1('# v1')
    await writeDraftText('ahead', '# v2')
    const stamp = await useDraftStore().stamp('ahead')
    const snapshots = await useSnapshotStore().list('ahead')
    await expect(push1('# v2')).resolves.toEqual([{ slug: 'ahead', action: 'republish', folderMissing: null, draft: 'updated' }])
    expect(await useDraftStore().stamp('ahead')).toBe(stamp)
    expect(await useSnapshotStore().list('ahead')).toEqual(snapshots)
  })

  it('push brings along the draft of a room still loading', async () => {
    const push1 = (raw: string) => push(token({ body: { stubs: [stub('loading', raw)], apply: true } }))
    await push1('# v1')
    const opening = useCollabServer().openDirectConnection('loading', { deck: 'loading' })
    await expect(push1('# v2')).resolves.toEqual([{ slug: 'loading', action: 'republish', folderMissing: null, draft: 'updated' }])
    const open = await opening
    expect(open.document!.getText('codemirror').toString()).toBe('# v2')
    await open.disconnect()
    expect(yDocUpdateToMarkdown((await useDraftStore().load('loading'))!)).toBe('# v2')
  })

  it('push names a draft that failed to follow, and still follows the next decks', async () => {
    const both = (a: string, b: string) => push(token({ body: { stubs: [stub('first', a), stub('second', b)], apply: true } }))
    await both('# a1', '# b1')
    await (await useCollabServer().openDirectConnection('first', { deck: 'first' })).disconnect()
    await (await useCollabServer().openDirectConnection('second', { deck: 'second' })).disconnect()
    vi.spyOn(useStores().drafts, 'update').mockRejectedValueOnce(new Error('disk full'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(both('# a2', '# b2')).resolves.toMatchObject([{ slug: 'first', draft: 'failed' }, { slug: 'second', draft: 'updated' }])
    expect(yDocUpdateToMarkdown((await useDraftStore().load('second'))!)).toBe('# b2')
    warn.mockRestore()
    expect(hasRoom('first')).toBe(false)
  })

  it('push refuses a version longer than a deck may be', async () => {
    await expect(push(token({ body: { stubs: [stub('long', 'x'.repeat(MAX_DECK_LENGTH + 1))], apply: true } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(await testRows().select('decks', { slug: 'long' })).toEqual([])
  })

  it('push indexes the images of each version it writes, so the deck serves them', async () => {
    await push(token({ body: { stubs: [stub('illustrated', '# I\n\n![](/images/team/a.png)')], apply: true } }))
    await push(token({ body: { stubs: [stub('illustrated', '# I\n\n![](/images/team/b.png)')], apply: true } }))
    expect(await useMediaIndex().decksFor('images/team/a.png')).toEqual(['illustrated'])
    expect(await useMediaIndex().decksFor('images/team/b.png')).toEqual(['illustrated'])
  })

  it('push refuses an alias or a frozen bundle that is not a slug', async () => {
    for (const registry of [{ alias: '../probe', lifecycle: 'frozen', frozenBundle: null }, { alias: 'probe', lifecycle: 'frozen', frozenBundle: '..' }])
      await expect(push(token({ body: { stubs: [stub('probe', '# P', { registry })], apply: true } }))).rejects.toMatchObject({ statusCode: 400 })
    expect(await testRows().select('decks', { slug: 'probe' })).toEqual([])
  })

  it('push refuses a plaintext access password', async () => {
    await expect(push(token({ body: { stubs: [stub('locked', '---\naccessPassword: hunter22\n---\n\n# L')], apply: true } })))
      .rejects
      .toMatchObject({ statusCode: 400 })
  })

  it('push files a created deck in the folder it names, and refuses a folder the instance lacks or a deck filed elsewhere', async () => {
    await expect(push(token({ body: { stubs: [stub('filed', '# F')], apply: true, folder: 'nowhere' } })))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: 'No folder "nowhere"' })

    const { slug: folder } = await useProjectStore().create({ title: 'Équipe' })
    const raw = '---\ntitle: Filed\nstatus: public\nproject: ailleurs\n---\n\n# F'
    await expect(push(token({ body: { stubs: [stub('filed', raw)], apply: true, folder } })))
      .resolves
      .toEqual([{ slug: 'filed', action: 'create', folderMissing: null }])
    expect((await testRows().select('decks', { slug: 'filed' }))[0]).toMatchObject({ project: folder, status: 'public' })
    expect((await testRows().select('deckVersions', { deckSlug: 'filed' }))[0]!.raw).toBe(`---\ntitle: Filed\nstatus: public\nproject: ${folder}\n---\n\n# F`)
    await expect(push(token({ body: { stubs: [stub('filed', raw)], apply: true, folder } })))
      .resolves
      .toEqual([{ slug: 'filed', action: 'identical', folderMissing: null }])

    await push(token({ body: { stubs: [stub('elsewhere', '# E')], apply: true } }))
    await expect(push(token({ body: { stubs: [stub('elsewhere', '# E')], apply: true, folder } })))
      .rejects
      .toMatchObject({ statusCode: 400, statusMessage: `elsewhere: filed in no folder, move it to "${folder}" from the studio` })
    expect((await testRows().select('decks', { slug: 'elsewhere' }))[0]!.project).toBeNull()
  })

  it('pull answers the live decks without their access password', async () => {
    await push(token({ body: { stubs: [stub('shared', '---\ntitle: Shared\n---\n\n# S')], apply: true } }))
    const [deck, missing] = await pull(token({ query: { slugs: 'shared,unknown' } }))
    expect(deck).toMatchObject({ slug: 'shared', title: 'Shared', raw: '---\ntitle: Shared\n---\n\n# S' })
    expect(deck).not.toHaveProperty('accessPasswordHash')
    expect(missing).toBeNull()
  })

  it('theme-rename plans, then renames the column, the versions and the draft', async () => {
    await push(token({ body: { stubs: [stub('themed', '---\ntheme: dsfr\n---\n\n# T')], apply: true } }))
    await testRows().insert('deckDrafts', { deckSlug: 'themed', ydoc: Buffer.from(markdownToYDocUpdate('---\ntheme: dsfr\n---\n\n# Draft')), updatedAt: NOW })
    const summary = [{ slug: 'themed', column: true, versions: 1, snapshots: 0, draft: true }]

    await expect(renameTheme(token({ body: { from: 'dsfr', to: 'harbor', apply: false } }))).resolves.toEqual(summary)
    expect((await testRows().select('decks', { slug: 'themed' }))[0]!.theme).toBe('dsfr')

    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(renameTheme(token({ body: { from: 'dsfr', to: 'harbor', apply: true } }))).resolves.toEqual(summary)
    expect(log).toHaveBeenCalledWith('[content] content-token renamed the theme dsfr to harbor in themed')
    log.mockRestore()
    expect((await testRows().select('decks', { slug: 'themed' }))[0]!.theme).toBe('harbor')
    expect((await testRows().select('deckVersions', { deckSlug: 'themed' }))[0]!.raw).toBe('---\ntheme: harbor\n---\n\n# T')
    const [draft] = await testRows().select('deckDrafts', { deckSlug: 'themed' })
    expect(yDocUpdateToMarkdown(new Uint8Array(draft!.ydoc))).toBe('---\ntheme: harbor\n---\n\n# Draft')
    expect(draft!.updatedAt.getTime()).toBeGreaterThan(NOW.getTime())
  })
})

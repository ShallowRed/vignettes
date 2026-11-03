import { Buffer } from 'node:buffer'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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

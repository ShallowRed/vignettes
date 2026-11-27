import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftStore, writeDraftText } from '../../layers/studio/server/utils/collab'
import { useStores } from '../../layers/studio/server/utils/db'
import { useDbContent, useDeckMeta, usePermissionStore, useProjectStore } from '../../layers/studio/server/utils/sources'
import { yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The family routes: the guards of the metadata patch, the copy of a deck as a
// variant or a new edition, and the variants the viewer route offers.
stubH3Globals()
setupServerDb()

const { default: patchDeck } = await import('../../layers/studio/server/api/admin/decks/[slug].patch')
const { default: duplicate } = await import('../../layers/studio/server/api/presentations/[slug]/duplicate.post')
const { default: viewer } = await import('../../layers/studio/server/api/presentations/[slug]/viewer.get')

const owner = (over: Record<string, unknown>) => asUser(1, 'boss', over)
const patch = (slug: string, body: Record<string, unknown>) => patchDeck(owner({ params: { slug }, body }))

beforeEach(async () => {
  await seedAccount(1, 'boss', 'owner')
  await seedAccount(10, 'vi', 'viewer')
  await useProjectStore().create({ title: 'Client' })
  await useProjectStore().create({ title: 'Autre' })
  await useDbContent().writer.save({ slug: 'talk', raw: '---\ntitle: Talk\nstatus: public\nproject: client\n---\n\n# Talk\n', actor: 'boss', accessFromText: true })
  await useDbContent().writer.save({ slug: 'other', raw: '---\ntitle: Other\nproject: autre\n---\n\n# Other\n', actor: 'boss', accessFromText: true })
})

describe('the family fields of PATCH /api/admin/decks/:slug', () => {
  it('refuses a replacement by an unknown deck, by itself, or by a deck it replaces', async () => {
    await expect(patch('talk', { supersededBy: 'nope' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch('talk', { supersededBy: 'talk' })).rejects.toMatchObject({ statusCode: 400 })
    await patch('other', { supersededBy: 'talk' })
    await expect(patch('talk', { supersededBy: 'other' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('keeps a family inside one folder', async () => {
    await patch('talk', { family: 'Conf' })
    await expect(patch('other', { family: 'Conf' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch('other', { family: 'Conf', project: 'client' })).resolves.toMatchObject({ family: 'Conf', project: 'client' })
    // Moving one member to another folder would split the family.
    await expect(patch('other', { project: 'autre' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch('other', { project: 'autre', family: null })).resolves.toMatchObject({ project: 'autre', family: undefined })
  })
})

describe('the alias and the frozen bundle of PATCH /api/admin/decks/:slug', () => {
  it('accepts only slugs', async () => {
    for (const frozenBundle of ['..', '../.data', 'a/b', '.', 'talk\\..'])
      await expect(patch('talk', { frozenBundle })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch('talk', { alias: '../probe' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(patch('talk', { frozenBundle: 'talk-2026', alias: 'talk_v2' })).resolves.toMatchObject({ frozenBundle: 'talk-2026', alias: 'talk_v2' })
  })
})

describe('the folder of PATCH /api/admin/decks/:slug', () => {
  it('refuses a move to a folder that does not exist', async () => {
    await expect(patch('talk', { project: 'nowhere' })).rejects.toMatchObject({ statusCode: 400 })
  })

  it('saves a deck published under a folder that was never created', async () => {
    await useDbContent().writer.save({ slug: 'orphan', raw: '---\ntitle: Orphan\nproject: nowhere\n---\n\n# Orphan\n', actor: 'boss', accessFromText: true })
    await expect(patch('orphan', { project: 'nowhere', status: 'private' })).resolves.toMatchObject({ project: 'nowhere', status: 'private' })
  })
})

describe('copying a deck (POST /api/presentations/:slug/duplicate)', () => {
  const copy = (body: Record<string, unknown>, slug = 'talk') => duplicate(owner({ params: { slug }, body }))

  it('creates a variant beside the source, in its family, with its access', async () => {
    const created = await copy({ slug: 'talk-en', mode: 'variant', title: 'Talk EN', variantLabel: 'EN', sourceVariantLabel: 'FR' })
    expect(created).toMatchObject({ slug: 'talk-en', title: 'Talk EN', status: 'public', project: 'client', family: 'Talk', variantLabel: 'EN', published: false })
    expect(await useDeckMeta().get('talk')).toMatchObject({ family: 'Talk', variantLabel: 'FR' })
    const draft = yDocUpdateToMarkdown((await useDraftStore().load('talk-en'))!)
    expect(draft).toContain('title: Talk EN')
    expect(draft).toContain('# Talk')
  })

  it('creates a new edition that replaces the source', async () => {
    await copy({ slug: 'talk-2027', mode: 'edition' })
    expect(await useDeckMeta().get('talk')).toMatchObject({ supersededBy: 'talk-2027' })
    expect(await useDeckMeta().get('talk-2027')).toMatchObject({ title: 'Talk', supersededBy: undefined })
  })

  it('copies the draft of a deck never published', async () => {
    await writeDraftText('wip', '# Work in progress')
    await useDeckMeta().update('wip', { title: 'WIP' })
    await copy({ slug: 'wip-2', mode: 'variant', variantLabel: 'B' }, 'wip')
    expect(yDocUpdateToMarkdown((await useDraftStore().load('wip-2'))!)).toContain('# Work in progress')
  })

  it('answers 409 when another write created the draft of the copy meanwhile', async () => {
    vi.spyOn(useStores().drafts, 'create').mockResolvedValueOnce(false)
    await expect(copy({ slug: 'talk-copy', mode: 'variant' })).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refuses a taken slug, a malformed body, and a read-only account', async () => {
    await expect(copy({ slug: 'other', mode: 'variant' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(copy({ slug: 'x', mode: 'clone' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(duplicate(asUser(10, 'vi', { params: { slug: 'talk' }, body: { slug: 'x', mode: 'variant' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers a visitor the same way for an unknown deck and a private one', async () => {
    const body = { slug: 'x', mode: 'variant' }
    await expect(duplicate(anon({ params: { slug: 'nope' }, body }))).rejects.toMatchObject({ statusCode: 401 })
    await expect(duplicate(anon({ params: { slug: 'other' }, body }))).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses a source with nothing to copy', async () => {
    await useDeckMeta().update('empty', { title: 'Empty' })
    await expect(copy({ slug: 'empty-2', mode: 'variant', variantLabel: 'B' }, 'empty')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('the variants the viewer route offers', () => {
  it('lists the family members the visitor may open, and nothing else to a visitor', async () => {
    await patch('talk', { family: 'Conf', variantLabel: 'FR' })
    await useDbContent().writer.save({ slug: 'talk-en', raw: '---\ntitle: Talk EN\nstatus: public\nproject: client\n---\n\n# EN\n', actor: 'boss', accessFromText: true })
    await patch('talk-en', { family: 'Conf', variantLabel: 'EN' })
    await useDbContent().writer.save({ slug: 'talk-secret', raw: '---\ntitle: Secret\nproject: client\n---\n\n# S\n', actor: 'boss', accessFromText: true })
    await patch('talk-secret', { family: 'Conf', variantLabel: 'Interne' })

    const seen = await viewer(anon({ params: { slug: 'talk' } }))
    expect(seen).toEqual({ canEdit: false, signedIn: false, publicDeck: true, variants: [{ slug: 'talk', alias: null, title: 'Talk', variantLabel: 'FR' }, { slug: 'talk-en', alias: null, title: 'Talk EN', variantLabel: 'EN' }] })

    await usePermissionStore().set('talk-secret', 10, 'viewer', 'boss')
    const granted = await viewer(asUser(10, 'vi', { params: { slug: 'talk' } }))
    expect(granted.variants.map(v => v.slug)).toEqual(['talk', 'talk-en', 'talk-secret'])

    // A variant still unpublished has no page: neither the owner nor a
    // collaborator holding an editor grant on it gets it.
    await duplicate(owner({ params: { slug: 'talk' }, body: { slug: 'talk-de', mode: 'variant', variantLabel: 'DE' } }))
    const mine = await viewer(owner({ params: { slug: 'talk' } }))
    expect(mine.variants.map(v => v.slug)).toEqual(['talk', 'talk-en', 'talk-secret'])
    await usePermissionStore().set('talk-de', 10, 'editor', 'boss')
    const collaborator = await viewer(asUser(10, 'vi', { params: { slug: 'talk' } }))
    expect(collaborator.variants.map(v => v.slug)).toEqual(['talk', 'talk-en', 'talk-secret'])
  })

  it('tells whoever may edit whether the deck has a published version', async () => {
    await expect(viewer(owner({ params: { slug: 'talk' } }))).resolves.toMatchObject({ canEdit: true, published: true })
    await duplicate(owner({ params: { slug: 'talk' }, body: { slug: 'talk-draft', mode: 'variant', variantLabel: 'B' } }))
    await expect(viewer(owner({ params: { slug: 'talk-draft' } }))).resolves.toMatchObject({ canEdit: true, published: false })
    await expect(viewer(anon({ params: { slug: 'talk-draft' } }))).resolves.not.toHaveProperty('published')
  })

  it('offers nothing on a trashed or frozen deck', async () => {
    await patch('talk', { family: 'Conf', variantLabel: 'FR' })
    await useDeckMeta().softDelete('talk')
    await expect(viewer(owner({ params: { slug: 'talk' } }))).resolves.toEqual({ canEdit: false, signedIn: true, publicDeck: false, variants: [] })
    await useDeckMeta().restore('talk')
    await patch('talk', { lifecycle: 'frozen' })
    await expect(viewer(owner({ params: { slug: 'talk' } }))).resolves.toMatchObject({ canEdit: false })
  })
})

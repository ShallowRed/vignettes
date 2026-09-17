import { beforeEach, describe, expect, it } from 'vitest'
import { useDraftStore } from '../../layers/studio/server/utils/collab'
import { useDbContent, useDeckMeta, usePermissionStore, useProjectStore } from '../../layers/studio/server/utils/sources'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
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
  await useDbContent().writer.save({ slug: 'talk', raw: '---\ntitle: Talk\nstatus: public\nproject: client\n---\n\n# Talk\n', actor: 'boss' })
  await useDbContent().writer.save({ slug: 'other', raw: '---\ntitle: Other\nproject: autre\n---\n\n# Other\n', actor: 'boss' })
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
    await useDraftStore().save('wip', markdownToYDocUpdate('# Work in progress'))
    await useDeckMeta().update('wip', { title: 'WIP' })
    await copy({ slug: 'wip-2', mode: 'variant', variantLabel: 'B' }, 'wip')
    expect(yDocUpdateToMarkdown((await useDraftStore().load('wip-2'))!)).toContain('# Work in progress')
  })

  it('refuses a taken slug, a malformed body, and a read-only account', async () => {
    await expect(copy({ slug: 'other', mode: 'variant' })).rejects.toMatchObject({ statusCode: 409 })
    await expect(copy({ slug: 'x', mode: 'clone' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(duplicate(asUser(10, 'vi', { params: { slug: 'talk' }, body: { slug: 'x', mode: 'variant' } }))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('the variants the viewer route offers', () => {
  it('lists the family members the visitor may open, and nothing else to a visitor', async () => {
    await patch('talk', { family: 'Conf', variantLabel: 'FR' })
    await useDbContent().writer.save({ slug: 'talk-en', raw: '---\ntitle: Talk EN\nstatus: public\nproject: client\n---\n\n# EN\n', actor: 'boss' })
    await patch('talk-en', { family: 'Conf', variantLabel: 'EN' })
    await useDbContent().writer.save({ slug: 'talk-secret', raw: '---\ntitle: Secret\nproject: client\n---\n\n# S\n', actor: 'boss' })
    await patch('talk-secret', { family: 'Conf', variantLabel: 'Interne' })

    const seen = await viewer(anon({ params: { slug: 'talk' } }))
    expect(seen).toEqual({ canEdit: false, variants: [{ slug: 'talk', alias: null, title: 'Talk', variantLabel: 'FR' }, { slug: 'talk-en', alias: null, title: 'Talk EN', variantLabel: 'EN' }] })

    await usePermissionStore().set('talk-secret', 10, 'viewer', 'boss')
    const granted = await viewer(asUser(10, 'vi', { params: { slug: 'talk' } }))
    expect(granted.variants.map(v => v.slug)).toEqual(['talk', 'talk-en', 'talk-secret'])

    // A variant still unpublished has no page: the owner does not get it either.
    await duplicate(owner({ params: { slug: 'talk' }, body: { slug: 'talk-de', mode: 'variant', variantLabel: 'DE' } }))
    const mine = await viewer(owner({ params: { slug: 'talk' } }))
    expect(mine.variants.map(v => v.slug)).toEqual(['talk', 'talk-en', 'talk-secret'])
  })
})

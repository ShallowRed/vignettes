import { beforeEach, describe, expect, it } from 'vitest'
import { useDbContent, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()

const { default: downloadMarkdown } = await import('../../layers/studio/server/api/presentations/[slug]/markdown.get')
const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')

const editor = (over: Record<string, unknown> = {}) => asUser(3, 'ed', over)
const reader = (over: Record<string, unknown> = {}) => asUser(10, 'reader', over)

beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
  await seedAccount(10, 'reader', 'viewer')
})

describe('downloading the markdown (GET /api/presentations/:slug/markdown)', () => {
  const published = '---\ntitle: Privé\n---\n\n# Publié\n'
  const download = (event: any) => downloadMarkdown(Object.assign(event, { params: event.params ?? { slug: 'deck' } }))

  beforeEach(async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: published, actor: 'ed' })
  })

  it('serves the published version under the reading rules', async () => {
    await expect(download(anon())).rejects.toMatchObject({ statusCode: 401 })
    await expect(download(reader())).rejects.toMatchObject({ statusCode: 404 })
    await usePermissionStore().set('deck', 10, 'viewer', 'boss')
    await expect(download(reader())).resolves.toBe(published)
    const event = editor()
    await expect(download(event)).resolves.toBe(published)
    expect(event.responseHeaders['content-disposition']).toBe('attachment; filename="deck.md"')
  })

  it('serves the draft to whoever may edit the deck', async () => {
    await saveDraft(editor({ params: { slug: 'deck' }, body: { raw: '# Brouillon' } }))
    const draft = { query: { draft: '' } }
    await expect(download(anon(draft))).rejects.toMatchObject({ statusCode: 401 })
    await expect(download(reader(draft))).rejects.toMatchObject({ statusCode: 404 })
    await usePermissionStore().set('deck', 10, 'viewer', 'boss')
    await expect(download(reader(draft))).rejects.toMatchObject({ statusCode: 403 })
    await expect(download(editor(draft))).resolves.toBe('# Brouillon')
  })

  it('serves the published text as the draft of a deck nobody has edited', async () => {
    await expect(download(editor({ query: { draft: '' } }))).resolves.toBe(published)
  })

  it('answers 404 for a deck that was never published', async () => {
    await expect(download({ ...editor(), params: { slug: 'absent' } })).rejects.toMatchObject({ statusCode: 404 })
  })
})

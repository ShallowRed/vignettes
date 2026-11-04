import { Buffer } from 'node:buffer'
import { MAX_DECK_LENGTH } from '@vignettes/core/deck'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { hasRoom, useCollabServer, useDraftStore, useSnapshotStore } from '../../layers/studio/server/utils/collab'
import { useStores } from '../../layers/studio/server/utils/db'
import { storeMedia } from '../../layers/studio/server/utils/media-store'
import { useContentArchive, useDbContent, useDeckMeta, usePermissionStore, useProjectPermissionStore } from '../../layers/studio/server/utils/sources'
import { yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// Drive the write handlers directly: the h3 auto-imports read from the event
// object each test builds, and the stores hit a migrated temp file.
stubH3Globals()
setupServerDb()
vi.mock('../../layers/studio/server/utils/media-store', async importOriginal => ({
  ...await importOriginal<typeof import('../../layers/studio/server/utils/media-store')>(),
  storeMedia: vi.fn(),
}))

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: createDeck } = await import('../../layers/studio/server/api/presentations.post')
const { default: uploadMedia } = await import('../../layers/studio/server/api/media.post')
const { default: loadDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')
const { default: trashDeck } = await import('../../layers/studio/server/api/presentations/[slug].delete')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const collab = (over: Record<string, unknown>) => asUser(10, 'collab', over)
function save(raw: string, stamp?: number | null, publishedVersion?: number | null) {
  const body = { raw, ...(stamp === undefined ? {} : { stamp }), ...(publishedVersion === undefined ? {} : { publishedVersion }) }
  return saveDraft(editor({ params: { slug: 'deck' }, body }))
}
const storedText = async () => yDocUpdateToMarkdown((await useDraftStore().load('deck'))!)

beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
  await seedAccount(10, 'collab', 'viewer')
})

describe('saving a draft solo (PUT /api/presentations/:slug)', () => {
  it('refuses a stale stamp instead of overwriting a newer draft', async () => {
    // First save: no draft existed, so the loaded stamp was null.
    const first = await save('# v1', null)
    expect(typeof first.stamp).toBe('number')
    // A second writer who loaded before that save still carries null.
    await expect(save('# theirs', null)).rejects.toMatchObject({ statusCode: 409, data: { conflict: true } })
    // The current stamp goes through.
    await expect(save('# mine', first.stamp)).resolves.toMatchObject({ ok: true })
  })

  it('keeps accepting a client that sends no stamp at all', async () => {
    await save('# v1', null)
    await expect(save('# legacy')).resolves.toMatchObject({ ok: true })
  })

  it('writes in the lineage of the stored draft: a tab that holds it merges one copy', async () => {
    await save('# v1', null)
    const tab = new Y.Doc()
    Y.applyUpdate(tab, (await useDraftStore().load('deck'))!)
    await save('# v2')
    Y.applyUpdate(tab, (await useDraftStore().load('deck'))!)
    expect(tab.getText('codemirror').toString()).toBe('# v2')
    expect(await storedText()).toBe('# v2')
  })

  it('passes a save that loaded no draft while the stored draft is the published version it loaded', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# v1', actor: 'ed' })
    const loaded = await useDbContent().publishedVersion('deck')
    // An editor opened in real time stores the published text as the draft.
    await (await useCollabServer().openDirectConnection('deck', { deck: 'deck' })).disconnect()
    await expect(save('# solo', null)).rejects.toMatchObject({ statusCode: 409 })
    await expect(save('# solo', null, loaded)).resolves.toMatchObject({ ok: true })
    expect(await storedText()).toBe('# solo')
  })

  it('refuses a save that loaded no draft once another version is published, or once the draft changed', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# v1', actor: 'ed' })
    const loaded = await useDbContent().publishedVersion('deck')
    await useDbContent().writer.save({ slug: 'deck', raw: '# v2', actor: 'content-push' })
    await (await useCollabServer().openDirectConnection('deck', { deck: 'deck' })).disconnect()
    await expect(save('# solo', null, loaded)).rejects.toMatchObject({ statusCode: 409 })
    await expect(save('# typed', null, await useDbContent().publishedVersion('deck'))).resolves.toMatchObject({ ok: true })
    await expect(save('# late', null, await useDbContent().publishedVersion('deck'))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('fails when the store does not keep the text, and leaves the stamp and the history as they were', async () => {
    const first = await save('# v1', null)
    const snapshots = await useSnapshotStore().list('deck')
    vi.spyOn(useStores().drafts, 'update').mockRejectedValueOnce(new Error('disk full'))
    await expect(save('# v2', first.stamp)).rejects.toThrow(/does not hold the text just written/)
    expect(await useDraftStore().stamp('deck')).toBe(first.stamp)
    expect(await storedText()).toBe('# v1')
    expect(await useSnapshotStore().list('deck')).toEqual(snapshots)
    expect(hasRoom('deck')).toBe(false)
  })

  it('creates the draft of a deck whose published version is past the limit', async () => {
    await useContentArchive().apply([
      { kind: 'deck', slug: 'deck', axes: { title: 'Long', status: 'private', lifecycle: 'live', project: null, theme: null, accessPasswordHash: null, unlisted: false } },
      { kind: 'version', slug: 'deck', raw: 'x'.repeat(MAX_DECK_LENGTH + 1) },
    ], { by: 'content-push', at: new Date() })
    await expect(save('# short', null)).resolves.toMatchObject({ ok: true })
    expect(await storedText()).toBe('# short')
  })
})

describe('creating a deck (POST /api/presentations)', () => {
  const body = (project?: string) => ({ body: { slug: 'new-deck', title: 'Nouveau', project } })

  it('answers 409 when another write created the draft meanwhile', async () => {
    vi.spyOn(useStores().drafts, 'create').mockResolvedValueOnce(false)
    await expect(createDeck(editor(body()))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('lets a collaborator create a deck inside a folder they can edit', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    const event = collab(body('client'))
    await expect(createDeck(event)).resolves.toMatchObject({ slug: 'new-deck', project: 'client' })
    expect(event.status).toBe(201)
  })

  it('refuses the same collaborator outside their folder (403)', async () => {
    await useProjectPermissionStore().set('client', 10, 'editor', 'boss')
    await expect(createDeck(collab(body('other')))).rejects.toMatchObject({ statusCode: 403 })
    await expect(createDeck(collab(body()))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a read-only folder grant (403)', async () => {
    await useProjectPermissionStore().set('client', 10, 'viewer', 'boss')
    await expect(createDeck(collab(body('client')))).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('uploading an image (POST /api/media)', () => {
  it('requires a session (401) and, for a non-privileged account, a deck to check (403)', async () => {
    await expect(uploadMedia(anon())).rejects.toMatchObject({ statusCode: 401 })
    await expect(uploadMedia(collab({}))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a read-only grant on the named deck (403)', async () => {
    await usePermissionStore().set('deck', 10, 'viewer', 'boss')
    await expect(uploadMedia(collab({ query: { deck: 'deck' } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets an editor grant through to the upload itself', async () => {
    await usePermissionStore().set('deck', 10, 'editor', 'boss')
    // Past the guard, the handler complains about the (absent) file, not the right.
    await expect(uploadMedia(collab({ query: { deck: 'deck' } }))).rejects.toMatchObject({ statusCode: 400 })
  })

  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
  function upload(type: string, { bytes = 8, data = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(bytes - PNG_SIGNATURE.length, 1)]) } = {}) {
    return uploadMedia(editor({ parts: [{ name: 'file', filename: 'picture', type, data }] }))
  }

  it('names the accepted formats when it refuses a type (415)', async () => {
    await expect(upload('image/bmp')).rejects.toMatchObject({
      statusCode: 415,
      statusMessage: 'Unsupported image type image/bmp: the accepted formats are PNG, JPG, WEBP, GIF, SVG, AVIF',
      data: { reason: 'type' },
    })
  })

  it('stores a raster image under the type of its bytes', async () => {
    const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0])
    await expect(upload('image/png', { data: jpeg })).resolves.toMatchObject({ src: expect.stringMatching(/\.jpg$/) })
    expect(storeMedia).toHaveBeenLastCalledWith(expect.stringMatching(/\.jpg$/), jpeg, 'image/jpeg')
    await expect(upload('image/svg+xml')).resolves.toMatchObject({ src: expect.stringMatching(/\.png$/) })
  })

  it('refuses a file whose content does not match its declared type (415)', async () => {
    await expect(upload('image/png', { data: Buffer.from('plain text') })).rejects.toMatchObject({
      statusCode: 415,
      statusMessage: 'The content of the file does not match its declared type image/png',
      data: { reason: 'content' },
    })
    await expect(upload('image/png', { data: Buffer.from('<svg/>') })).rejects.toMatchObject({ statusCode: 415, data: { reason: 'content' } })
  })

  it('names the limit when it refuses a size (413)', async () => {
    await expect(upload('image/png', { bytes: 10 * 1024 * 1024 + 1 })).rejects.toMatchObject({
      statusCode: 413,
      statusMessage: 'The image weighs more than the 10 MB limit',
      data: { reason: 'size' },
    })
  })

  it('reports a storage failure as such (503)', async () => {
    vi.mocked(storeMedia).mockRejectedValueOnce(new Error('bucket unreachable'))
    await expect(upload('image/png')).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'The image storage did not accept the file',
      data: { reason: 'storage' },
    })
  })

  it('answers the address of a stored image', async () => {
    await expect(upload('image/png')).resolves.toMatchObject({ src: expect.stringMatching(/^\/media\/[0-9a-f]{32}\.png$/) })
  })
})

describe('loading a deck for edit (GET /api/presentations/:slug?draft)', () => {
  it('returns the draft with the published text and date alongside', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    await save('# draft', null)
    const loaded = await loadDeck(editor({ params: { slug: 'deck' }, query: { draft: '' } }))
    expect(loaded).toMatchObject({ content: '# draft', from: 'draft', publishedRaw: '# published', publishedVersion: await useDbContent().publishedVersion('deck') })
    expect(typeof loaded.publishedAt).toBe('number')
  })

  it('reports a never-published deck as such', async () => {
    await save('# draft', null)
    await expect(loadDeck(editor({ params: { slug: 'deck' }, query: { draft: '' } })))
      .resolves
      .toMatchObject({ publishedRaw: null, publishedAt: null, publishedVersion: null })
  })
})

describe('moving a deck to the trash (DELETE /api/presentations/:slug)', () => {
  const trash = (over: Record<string, unknown> = {}) => ({ params: { slug: 'deck' }, ...over })

  beforeEach(async () => {
    await useDeckMeta().update('deck', { title: 'Deck' })
  })

  it('requires a session (401) and a privileged role (403)', async () => {
    await expect(trashDeck(anon(trash()))).rejects.toMatchObject({ statusCode: 401 })
    await expect(trashDeck(collab(trash()))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('lets a global editor trash a deck, as they may restore it', async () => {
    await expect(trashDeck(editor(trash()))).resolves.toEqual({ ok: true })
    expect(await useDeckMeta().isTrashed('deck')).toBe(true)
  })

  it('refuses while a collab session is open on the deck (409)', async () => {
    const documents = useCollabServer().documents
    documents.set('deck', {} as any)
    try {
      await expect(trashDeck(editor(trash()))).rejects.toMatchObject({ statusCode: 409 })
    }
    finally {
      documents.delete('deck')
    }
  })

  it('answers 404 for a slug with no deck', async () => {
    await expect(trashDeck(editor({ params: { slug: 'nowhere' } }))).rejects.toMatchObject({ statusCode: 404 })
  })
})

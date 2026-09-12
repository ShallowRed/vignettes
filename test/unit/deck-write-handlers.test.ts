import { beforeEach, describe, expect, it } from 'vitest'
import { useDbContent, usePermissionStore, useProjectPermissionStore } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// Drive the write handlers directly: the h3 auto-imports read from the event
// object each test builds, and the stores hit a migrated temp file.
stubH3Globals()
setupServerDb()

const { default: saveDraft } = await import('../../layers/studio/server/api/presentations/[slug].put')
const { default: createDeck } = await import('../../layers/studio/server/api/presentations.post')
const { default: uploadMedia } = await import('../../layers/studio/server/api/media.post')
const { default: loadDeck } = await import('../../layers/studio/server/api/presentations/[slug].get')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const collab = (over: Record<string, unknown>) => asUser(10, 'collab', over)
function save(raw: string, stamp?: number | null) {
  return saveDraft(editor({ params: { slug: 'deck' }, body: stamp === undefined ? { raw } : { raw, stamp } }))
}

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
})

describe('creating a deck (POST /api/presentations)', () => {
  const body = (project?: string) => ({ body: { slug: 'new-deck', title: 'Nouveau', project } })

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
})

describe('loading a deck for edit (GET /api/presentations/:slug?draft)', () => {
  it('returns the draft with the published text and date alongside', async () => {
    await useDbContent().writer.save({ slug: 'deck', raw: '# published', actor: 'ed' })
    await save('# draft', null)
    const loaded = await loadDeck(editor({ params: { slug: 'deck' }, query: { draft: '' } }))
    expect(loaded).toMatchObject({ content: '# draft', from: 'draft', publishedRaw: '# published' })
    expect(typeof loaded.publishedAt).toBe('number')
  })

  it('reports a never-published deck as such', async () => {
    await save('# draft', null)
    await expect(loadDeck(editor({ params: { slug: 'deck' }, query: { draft: '' } })))
      .resolves
      .toMatchObject({ publishedRaw: null, publishedAt: null })
  })
})

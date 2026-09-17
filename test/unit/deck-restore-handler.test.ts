import { Document } from '@hocuspocus/server'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { useCollabServer, useDraftStore } from '../../layers/studio/server/utils/collab'
import { useDbContent } from '../../layers/studio/server/utils/sources'
import { markdownToYDocUpdate, yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The restore route, driven like the other write handlers: a migrated temp
// database and the h3 helpers reading from the event object.
stubH3Globals()
setupServerDb()

const { default: listVersions } = await import('../../layers/studio/server/api/presentations/[slug]/versions.get')
const { default: restoreVersion } = await import('../../layers/studio/server/api/presentations/[slug]/versions/[id]/restore.post')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const viewer = (over: Record<string, unknown>) => asUser(10, 'vi', over)
const params = (id?: number) => ({ params: { slug: 'deck', ...(id === undefined ? {} : { id: String(id) }) } })

async function publish(raw: string) {
  await useDbContent().writer.save({ slug: 'deck', raw, actor: 'ed' })
  const { versions } = await listVersions(editor(params()))
  return versions[0]!.id
}

beforeEach(async () => {
  await seedAccount(3, 'ed', 'editor')
  await seedAccount(10, 'vi', 'viewer')
  useCollabServer().documents.delete('deck')
})

describe('restoring a version (POST /api/presentations/:slug/versions/:id/restore)', () => {
  it('rewrites the stored draft, keeping the lineage a client already holds', async () => {
    const v1 = await publish('# v1')
    await publish('# v2')
    await useDraftStore().save('deck', markdownToYDocUpdate('# v2 edited'))
    const client = new Y.Doc()
    Y.applyUpdate(client, (await useDraftStore().load('deck'))!)

    const result = await restoreVersion(editor(params(v1)))
    expect(result).toMatchObject({ ok: true })
    expect(typeof result.stamp).toBe('number')
    const stored = (await useDraftStore().load('deck'))!
    expect(yDocUpdateToMarkdown(stored)).toBe('# v1')
    // A client that loaded the previous draft merges the restore, with no copy.
    Y.applyUpdate(client, stored)
    expect(client.getText('codemirror').toString()).toBe('# v1')
  })

  it('creates the draft when the deck had none', async () => {
    const v1 = await publish('# v1')
    await restoreVersion(editor(params(v1)))
    expect(yDocUpdateToMarkdown((await useDraftStore().load('deck'))!)).toBe('# v1')
  })

  it('goes through the live room when one is open', async () => {
    const v1 = await publish('# v1')
    const room = new Document('deck')
    room.getText('codemirror').insert(0, '# live text')
    useCollabServer().documents.set('deck', room)

    await restoreVersion(editor(params(v1)))
    expect(room.getText('codemirror').toString()).toBe('# v1')
  })

  it('refuses an unknown version and a read-only account', async () => {
    const v1 = await publish('# v1')
    await expect(restoreVersion(editor(params(999)))).rejects.toMatchObject({ statusCode: 404 })
    await expect(restoreVersion(viewer(params(v1)))).rejects.toMatchObject({ statusCode: 403 })
  })
})

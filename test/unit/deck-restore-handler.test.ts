import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { useCollabServer, useDraftStore, writeDraftText } from '../../layers/studio/server/utils/collab'
import { useDbContent } from '../../layers/studio/server/utils/sources'
import { yDocUpdateToMarkdown } from '../../layers/studio/shared/collab/ydoc'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The restore route, driven like the other write handlers: a migrated temp
// database and the h3 helpers reading from the event object.
stubH3Globals()
setupServerDb()

const { default: listHistory } = await import('../../layers/studio/server/api/presentations/[slug]/history.get')
const { default: restoreVersion } = await import('../../layers/studio/server/api/presentations/[slug]/versions/[id]/restore.post')

const editor = (over: Record<string, unknown>) => asUser(3, 'ed', over)
const viewer = (over: Record<string, unknown>) => asUser(10, 'vi', over)
const params = (id?: number) => ({ params: { slug: 'deck', ...(id === undefined ? {} : { id: String(id) }) } })

async function publish(raw: string) {
  await useDbContent().writer.save({ slug: 'deck', raw, actor: 'ed' })
  const { entries } = await listHistory(editor(params()))
  return entries.find(e => e.kind === 'version')!.id
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
    await writeDraftText('deck', '# v2 edited')
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

  it('goes through the live room when one is open: the room, the stored draft and a tab of its lineage hold one copy', async () => {
    const v1 = await publish('# v1')
    await publish('# v2')
    const open = await useCollabServer().openDirectConnection('deck', { deck: 'deck' })
    const tab = new Y.Doc()
    Y.applyUpdate(tab, Y.encodeStateAsUpdate(open.document!))

    await restoreVersion(editor(params(v1)))
    expect(open.document!.getText('codemirror').toString()).toBe('# v1')
    const stored = (await useDraftStore().load('deck'))!
    expect(yDocUpdateToMarkdown(stored)).toBe('# v1')
    Y.applyUpdate(tab, stored)
    expect(tab.getText('codemirror').toString()).toBe('# v1')
    await open.disconnect()
  })

  it('refuses an unknown version and a read-only account', async () => {
    const v1 = await publish('# v1')
    await expect(restoreVersion(editor(params(999)))).rejects.toMatchObject({ statusCode: 404 })
    // The reader holds no grant on this private deck, so it answers as absent.
    await expect(restoreVersion(viewer(params(v1)))).rejects.toMatchObject({ statusCode: 404 })
  })
})

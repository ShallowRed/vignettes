import { beforeEach, describe, expect, it } from 'vitest'
import { useDbContent, usePermissionStore } from '../../layers/studio/server/utils/sources'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// The history reads, driven like the other handlers: a migrated temp database
// and the h3 helpers reading from the event object.
stubH3Globals()
setupServerDb()

const { default: listVersions } = await import('../../layers/studio/server/api/presentations/[slug]/versions.get')
const { default: loadVersion } = await import('../../layers/studio/server/api/presentations/[slug]/versions/[id].get')

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
})

describe('reading the history (GET /api/presentations/:slug/versions)', () => {
  it('needs the edit right, like the draft', async () => {
    await publish('# v1')
    await expect(listVersions(viewer(params()))).rejects.toMatchObject({ statusCode: 403 })
    await usePermissionStore().set('deck', 10, 'viewer', 'ed')
    await expect(listVersions(viewer(params()))).rejects.toMatchObject({ statusCode: 403 })
    await usePermissionStore().set('deck', 10, 'editor', 'ed')
    await expect(listVersions(viewer(params()))).resolves.toMatchObject({ versions: [{ current: true }] })
  })

  it('answers 404 for a version of another deck and 400 for a malformed id', async () => {
    const id = await publish('# v1')
    await useDbContent().writer.save({ slug: 'other', raw: '# other', actor: 'ed' })
    await expect(loadVersion(editor({ params: { slug: 'other', id: String(id) } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(loadVersion(editor({ params: { slug: 'deck', id: 'abc' } }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(loadVersion(editor(params(id)))).resolves.toMatchObject({ raw: '# v1' })
  })
})

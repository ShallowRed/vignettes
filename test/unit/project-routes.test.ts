import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../../layers/studio/server/utils/sources'
import { UNGROUPED_FOLDER_SLUG } from '../../layers/studio/shared/presentations/folder-view'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()

const { default: createProject } = await import('../../layers/studio/server/api/admin/projects/index.post')
const { default: patchProject } = await import('../../layers/studio/server/api/admin/projects/[slug].patch')

const owner = (over: Record<string, unknown> = {}) => asUser(1, 'boss', over)

beforeEach(async () => {
  await seedAccount(1, 'boss', 'owner')
})

describe('the slug of the decks without a project', () => {
  it('refuses it as the chosen slug of a new folder (409)', async () => {
    await expect(createProject(owner({ body: { title: 'Divers', slug: UNGROUPED_FOLDER_SLUG } }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('refuses it as the new slug of a folder (409)', async () => {
    const { slug } = await useProjectStore().create({ title: 'Archives' })
    await expect(patchProject(owner({ params: { slug }, body: { slug: UNGROUPED_FOLDER_SLUG } }))).rejects.toMatchObject({ statusCode: 409 })
    expect(await useProjectStore().slugExists(slug)).toBe(true)
  })
})

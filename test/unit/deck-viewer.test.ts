import { PUBLICATION_STATUSES } from '@vignettes/core/status'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// Which decks the viewer route calls public, which their page views depend on.
stubH3Globals()
setupServerDb()

const { default: patchDeck } = await import('../../layers/studio/server/api/admin/decks/[slug].patch')
const { default: duplicate } = await import('../../layers/studio/server/api/presentations/[slug]/duplicate.post')
const { default: viewer } = await import('../../layers/studio/server/api/presentations/[slug]/viewer.get')

const owner = (over: Record<string, unknown>) => asUser(1, 'boss', over)
const save = (slug: string, status: string) => useDbContent().writer.save({ slug, raw: `---\ntitle: ${slug}\nstatus: ${status}\n---\n\n# ${slug}\n`, actor: 'boss', accessFromText: true })
const read = (slug: string) => viewer(anon({ params: { slug } }))

beforeEach(() => seedAccount(1, 'boss', 'owner'))

describe('the publicDeck field of the viewer route', () => {
  it.each(PUBLICATION_STATUSES)('follows the status of a published deck (%s)', async (status) => {
    await save('deck', status)
    await expect(read('deck')).resolves.toMatchObject({ publicDeck: status === 'public' })
  })

  it('reads the status of the database, whatever the frontmatter says', async () => {
    await save('deck', 'public')
    await patchDeck(owner({ params: { slug: 'deck' }, body: { status: 'private' } }))
    await expect(read('deck')).resolves.toMatchObject({ publicDeck: false })
  })

  it('answers the same for a deck in the trash and for a slug that does not exist', async () => {
    await save('deck', 'public')
    await useDeckMeta().softDelete('deck')
    await expect(read('deck')).resolves.toEqual({ canEdit: false, signedIn: false, publicDeck: false, variants: [] })
    await expect(read('nowhere')).resolves.toEqual({ canEdit: false, signedIn: false, publicDeck: false, variants: [] })
  })

  it('answers false for a public deck without a published version', async () => {
    await save('deck', 'public')
    await duplicate(owner({ params: { slug: 'deck' }, body: { slug: 'deck-draft', mode: 'variant', variantLabel: 'B' } }))
    await expect(read('deck-draft')).resolves.toMatchObject({ publicDeck: false })
  })

  it('gives the same field to whoever may edit', async () => {
    await save('deck', 'public')
    await expect(viewer(owner({ params: { slug: 'deck' } }))).resolves.toMatchObject({ canEdit: true, publicDeck: true })
  })
})

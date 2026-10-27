import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentDraftText } from '../../layers/studio/server/utils/collab'
import { useDbContent, useDeckMeta, useProjectStore } from '../../layers/studio/server/utils/sources'
import { deckFromTemplate, listTemplates, loadTemplate } from '../../layers/studio/server/utils/templates'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()

const { default: createDeck } = await import('../../layers/studio/server/api/presentations.post')

const owner = (over: Record<string, unknown> = {}) => asUser(1, 'boss', over)

beforeEach(async () => {
  await seedAccount(1, 'boss', 'owner')
})

describe('templates', () => {
  it('lists the files of the template directory by id', async () => {
    expect(await listTemplates()).toEqual(['blank', 'example'])
  })

  it('lists the default template first, then the others in name order', async () => {
    const storage = (globalThis as any).useStorage
    vi.stubGlobal('useStorage', () => ({ getKeys: async () => ['example.md', 'blank.md', 'atelier.md', 'notes.txt'] }))
    try {
      expect(await listTemplates()).toEqual(['blank', 'atelier', 'example'])
    }
    finally {
      vi.stubGlobal('useStorage', storage)
    }
  })

  it('loads a template by id and refuses an id that is not a file name', async () => {
    expect(await loadTemplate('example')).toContain('::Quote')
    expect(await loadTemplate('missing')).toBeNull()
    expect(await loadTemplate('../package')).toBeNull()
  })

  it('gives the new deck the title, theme and folder chosen at creation, and no status', () => {
    const raw = deckFromTemplate('---\ntitle: Modèle\nstatus: public\nlang: fr\n---\n\n# Modèle\n\n---\n\n## Suite\n', { title: 'Bilan 2026', theme: 'dsfr', project: 'equipe' })
    expect(raw).toBe('---\ntitle: Bilan 2026\nlang: fr\ntheme: dsfr\nproject: equipe\n---\n\n# Bilan 2026\n\n---\n\n## Suite\n')
  })
})

describe('creating a deck from a template (POST /api/presentations)', () => {
  it('starts from the blank template when the request names none', async () => {
    await createDeck(owner({ body: { slug: 'vide', title: 'Vide' } }))
    expect(await currentDraftText('vide')).toContain('# Vide\n\n---\n\n## Première section')
  })

  it('starts from the named template', async () => {
    await createDeck(owner({ body: { slug: 'exemple', title: 'Mon exemple', template: 'example' } }))
    const draft = await currentDraftText('exemple')
    expect(draft).toMatch(/^---\ntitle: Mon exemple\ntheme: dsfr\nparser: heading\n---/)
    expect(draft).toContain('# Mon exemple\n')
    expect(draft).toContain(':::Columns')
  })

  it('refuses a template that does not exist (400)', async () => {
    await expect(createDeck(owner({ body: { slug: 'x', title: 'X', template: 'missing' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

describe('importing a file at creation (POST /api/presentations)', () => {
  const file = '---\ntitle: "Revue de sprint"\ntheme: dsfr\nstatus: public\nproject: ailleurs\n---\n\n# Revue de sprint\n'

  it('reads the title and theme from the frontmatter, and writes the chosen folder in place of the status and folder of the file', async () => {
    const { slug: project } = await useProjectStore().create({ title: 'Équipe' })
    const event = owner({ body: { slug: 'revue', raw: file, project } })
    await expect(createDeck(event)).resolves.toMatchObject({ slug: 'revue', title: 'Revue de sprint', theme: 'dsfr', status: 'private', project })
    expect(event.status).toBe(201)
    expect(await currentDraftText('revue')).toBe(`---\ntitle: Revue de sprint\ntheme: dsfr\nproject: ${project}\n---\n\n# Revue de sprint\n`)
  })

  it('removes the folder of the file when none is chosen', async () => {
    await createDeck(owner({ body: { slug: 'revue', raw: file } }))
    expect(await currentDraftText('revue')).toBe('---\ntitle: Revue de sprint\ntheme: dsfr\n---\n\n# Revue de sprint\n')
  })

  it('refuses a frontmatter value the schema rejects, naming the key (400)', async () => {
    await expect(createDeck(owner({ body: { slug: 'revue', raw: '---\ntitle: Revue\nparser: titres\n---\n' } })))
      .rejects
      .toMatchObject({ statusCode: 400, data: { issues: [{ key: 'parser' }] } })
    expect(await useDeckMeta().existsIncludingTrashed('revue')).toBe(false)
  })

  it('refuses a file without a title, and a frontmatter that is not YAML (400)', async () => {
    await expect(createDeck(owner({ body: { slug: 'revue', raw: '# Revue\n' } })))
      .rejects
      .toMatchObject({ statusCode: 400, data: { issues: [{ key: 'title' }] } })
    await expect(createDeck(owner({ body: { slug: 'revue', raw: '---\ntitle: [Revue\n---\n' } })))
      .rejects
      .toMatchObject({ statusCode: 400, data: { issues: [{ key: '' }] } })
  })

  it('refuses a slug already taken (409)', async () => {
    await useDbContent().writer.save({ slug: 'revue', raw: '# Autre', actor: 'boss' })
    await expect(createDeck(owner({ body: { slug: 'revue', raw: file } }))).rejects.toMatchObject({ statusCode: 409 })
  })

  it('writes the title typed in the form into a file without one', async () => {
    await expect(createDeck(owner({ body: { slug: 'revue', raw: '# Revue\n', title: 'Revue de sprint' } }))).resolves.toMatchObject({ title: 'Revue de sprint' })
    expect(await currentDraftText('revue')).toBe('---\ntitle: Revue de sprint\n---\n\n# Revue\n')
  })

  it('writes the title typed in the form over a blank title of the file', async () => {
    await expect(createDeck(owner({ body: { slug: 'revue', raw: '---\ntitle: "  "\n---\n# Revue\n', title: 'Revue de sprint' } }))).resolves.toMatchObject({ title: 'Revue de sprint' })
  })

  it('refuses a title beside a file that has one, or a theme beside a file (400)', async () => {
    await expect(createDeck(owner({ body: { slug: 'revue', raw: file, title: 'Autre' } }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(createDeck(owner({ body: { slug: 'revue', raw: file, theme: 'dsfr' } }))).rejects.toMatchObject({ statusCode: 400 })
  })
})

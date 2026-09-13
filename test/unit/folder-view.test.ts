import type { PresentationListItem } from '../../layers/studio/shared/presentations/list-item'
import type { Project } from '../../layers/studio/shared/projects/schema'
import { describe, expect, it } from 'vitest'
import { buildCatalogFolders, buildFolderContents, UNGROUPED_FOLDER_SLUG } from '../../layers/studio/shared/presentations/folder-view'
import { listItem as item, project } from './helpers/fixtures'

const decks: PresentationListItem[] = [
  item({ slug: 'r1', title: 'RSE one', project: 'portail-rse', theme: 'dsfr' }),
  item({ slug: 'v1', title: 'Vitrine one', project: 'vitrine', theme: 'corporate' }),
  item({ slug: 'r2', title: 'RSE two', project: 'portail-rse', theme: 'dsfr-alt' }),
  item({ slug: 'orphan', title: 'No project' }),
]

const projects: Project[] = [
  project('portail-rse', { title: 'Portail RSE', color: '#f00', order: 0 }),
  project('vitrine', { title: 'Vitrine', order: 1 }),
]

describe('buildCatalogFolders', () => {
  it('builds one folder per project, in the projects input order', () => {
    const folders = buildCatalogFolders(decks, projects)
    expect(folders.map(f => f.routeSlug)).toEqual(['portail-rse', 'vitrine', UNGROUPED_FOLDER_SLUG])
  })

  it('enriches folders with project title and color, counts and distinct themes', () => {
    const [rse] = buildCatalogFolders(decks, projects)
    expect(rse).toMatchObject({
      routeSlug: 'portail-rse',
      title: 'Portail RSE',
      color: '#f00',
      count: 2,
      ungrouped: false,
    })
    expect(rse.themes.sort()).toEqual(['dsfr', 'dsfr-alt'])
  })

  it('appends the ungrouped "Divers" bucket last, only when it holds decks', () => {
    const withUngrouped = buildCatalogFolders(decks, projects)
    const last = withUngrouped.at(-1)!
    expect(last).toMatchObject({ routeSlug: UNGROUPED_FOLDER_SLUG, title: 'Divers', count: 1, ungrouped: true })

    const noOrphans = buildCatalogFolders(decks.filter(d => d.project), projects)
    expect(noOrphans.some(f => f.ungrouped)).toBe(false)
  })

  it('keeps empty named folders (privileged sees a freshly created project)', () => {
    const folders = buildCatalogFolders([], [project('brand-new', { title: 'Brand new' })])
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ routeSlug: 'brand-new', count: 0, themes: [] })
  })

  it('adds orphan folders for decks whose project has no row, sorted by slug', () => {
    const orphanDecks = [
      item({ slug: 'z', project: 'zeta-legacy' }),
      item({ slug: 'a', project: 'alpha-legacy' }),
    ]
    const folders = buildCatalogFolders(orphanDecks, projects)
    expect(folders.map(f => f.routeSlug)).toEqual(['portail-rse', 'vitrine', 'alpha-legacy', 'zeta-legacy'])
    // Orphan folders fall back to the slug for the title (no project row).
    expect(folders.find(f => f.routeSlug === 'alpha-legacy')).toMatchObject({ title: 'alpha-legacy', count: 1 })
  })

  it('returns an empty list when there is nothing to show', () => {
    expect(buildCatalogFolders([], [])).toEqual([])
  })
})

describe('buildFolderContents', () => {
  const deck = item({ slug: 'solo', updatedAt: 30 })
  const fr = item({ slug: 'talk-fr', family: 'Talk', variantLabel: 'FR', updatedAt: 10 })
  const en = item({ slug: 'talk-en', family: 'Talk', variantLabel: 'EN', updatedAt: 40 })
  const old = item({ slug: 'talk-v1', family: 'Talk', supersededBy: 'talk-fr', updatedAt: 50 })

  it('gathers a family on one card, its most recent version first', () => {
    const { entries } = buildFolderContents([deck, fr, en])
    expect(entries.map(e => e.variants.map(v => v.slug))).toEqual([['talk-en', 'talk-fr'], ['solo']])
    expect(entries[0]!.family).toBe('Talk')
  })

  it('moves a replaced deck to the former versions, even inside a family', () => {
    const { entries, superseded } = buildFolderContents([old, fr, deck])
    expect(superseded.map(d => d.slug)).toEqual(['talk-v1'])
    expect(entries.flatMap(e => e.variants.map(v => v.slug))).toEqual(['solo', 'talk-fr'])
  })
})

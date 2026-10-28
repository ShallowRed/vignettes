import type { PresentationListItem } from '../../layers/studio/shared/presentations/list-item'
import { describe, expect, it } from 'vitest'
import { applyCatalogQuery, countByStatus, groupByProject, UNGROUPED_PROJECT } from '../../layers/studio/shared/presentations/catalog-view'
import { deckTarget } from '../../layers/studio/shared/presentations/list-item'
import { listItem as item } from './helpers/fixtures'

const catalog: PresentationListItem[] = [
  item({ slug: 'zeta', title: 'Zeta deck', theme: 'corporate', status: 'public' }),
  item({ slug: 'alpha', title: 'Alpha intro', theme: 'dsfr', status: 'public' }),
  item({ slug: 'mid', title: 'Mid talk', theme: 'dsfr', status: 'semi-private' }),
  item({ slug: 'priv', title: 'Private notes', theme: 'dsfr', status: 'private' }),
]

describe('applyCatalogQuery', () => {
  it('returns all items sorted by title asc by default', () => {
    expect(applyCatalogQuery(catalog).map(p => p.slug))
      .toEqual(['alpha', 'mid', 'priv', 'zeta'])
  })

  it('does not mutate the input array', () => {
    const before = catalog.map(p => p.slug)
    applyCatalogQuery(catalog, { sortDir: 'desc' })
    expect(catalog.map(p => p.slug)).toEqual(before)
  })

  it('search matches title, slug and theme, case-insensitively', () => {
    expect(applyCatalogQuery(catalog, { search: 'ZETA' }).map(p => p.slug)).toEqual(['zeta'])
    expect(applyCatalogQuery(catalog, { search: 'corporate' }).map(p => p.slug)).toEqual(['zeta'])
    expect(applyCatalogQuery(catalog, { search: 'priv' }).map(p => p.slug)).toEqual(['priv'])
  })

  it('filters by status set; empty set means all', () => {
    expect(applyCatalogQuery(catalog, { statuses: ['public'] }).map(p => p.slug))
      .toEqual(['alpha', 'zeta'])
    expect(applyCatalogQuery(catalog, { statuses: [] }).map(p => p.slug))
      .toEqual(['alpha', 'mid', 'priv', 'zeta'])
  })

  it('sorts by status in canonical order, ties broken by title', () => {
    expect(applyCatalogQuery(catalog, { sortKey: 'status' }).map(p => p.status))
      .toEqual(['public', 'public', 'semi-private', 'private'])
  })

  it('reverses with sortDir desc', () => {
    expect(applyCatalogQuery(catalog, { sortKey: 'title', sortDir: 'desc' }).map(p => p.slug))
      .toEqual(['zeta', 'priv', 'mid', 'alpha'])
  })

  it('combines search + filter + sort', () => {
    const big: PresentationListItem[] = [
      item({ slug: 'd1', title: 'Demo one', status: 'public' }),
      item({ slug: 'd2', title: 'Demo two', status: 'private' }),
      item({ slug: 'x', title: 'Other', status: 'public' }),
    ]
    expect(applyCatalogQuery(big, { search: 'demo', statuses: ['public'], sortKey: 'title', sortDir: 'desc' })
      .map(p => p.slug)).toEqual(['d1'])
  })
})

describe('countByStatus', () => {
  it('counts each status, zero for absent', () => {
    expect(countByStatus(catalog)).toEqual({
      'public': 2,
      'semi-private': 1,
      'private': 1,
    })
    expect(countByStatus([])).toEqual({ 'public': 0, 'semi-private': 0, 'private': 0 })
  })
})

const projectCatalog: PresentationListItem[] = [
  item({ slug: 'r1', title: 'RSE one', project: 'portail-rse' }),
  item({ slug: 'v1', title: 'Vitrine one', project: 'vitrine' }),
  item({ slug: 'r2', title: 'RSE two', project: 'portail-rse' }),
  item({ slug: 'orphan', title: 'No project' }),
]

describe('applyCatalogQuery — project filter', () => {
  it('filters by project set; empty/undefined means all', () => {
    expect(applyCatalogQuery(projectCatalog, { projects: ['portail-rse'] }).map(p => p.slug))
      .toEqual(['r1', 'r2'])
    expect(applyCatalogQuery(projectCatalog, { projects: [] }).map(p => p.slug).sort())
      .toEqual(['orphan', 'r1', 'r2', 'v1'])
  })

  it('matches the ungrouped sentinel against project-less decks', () => {
    expect(applyCatalogQuery(projectCatalog, { projects: [UNGROUPED_PROJECT] }).map(p => p.slug))
      .toEqual(['orphan'])
  })

  it('combines project + status filters', () => {
    const mixed: PresentationListItem[] = [
      item({ slug: 'a', project: 'p', status: 'public' }),
      item({ slug: 'b', project: 'p', status: 'private' }),
      item({ slug: 'c', project: 'q', status: 'public' }),
    ]
    expect(applyCatalogQuery(mixed, { projects: ['p'], statuses: ['public'] }).map(p => p.slug))
      .toEqual(['a'])
  })
})

describe('groupByProject', () => {
  it('buckets by project, ungrouped last, order from registry', () => {
    const groups = groupByProject(projectCatalog, ['vitrine', 'portail-rse'])
    expect(groups.map(g => g.project)).toEqual(['vitrine', 'portail-rse', UNGROUPED_PROJECT])
    expect(groups.find(g => g.project === 'portail-rse')!.items.map(i => i.slug)).toEqual(['r1', 'r2'])
  })

  it('appends unknown projects alphabetically before the ungrouped bucket', () => {
    const groups = groupByProject(projectCatalog, ['vitrine'])
    expect(groups.map(g => g.project)).toEqual(['vitrine', 'portail-rse', UNGROUPED_PROJECT])
  })

  it('preserves input (e.g. already-sorted) order within a bucket', () => {
    const items = [
      item({ slug: 'b', title: 'B', project: 'p' }),
      item({ slug: 'a', title: 'A', project: 'p' }),
    ]
    expect(groupByProject(items).find(g => g.project === 'p')!.items.map(i => i.slug))
      .toEqual(['b', 'a'])
  })
})

describe('deckTarget', () => {
  it('opens the editor of a deck with nothing published for whoever may edit it, and the deck otherwise', () => {
    expect(deckTarget(item({ slug: 'new', published: false, canEdit: true }))).toBe('/edit/new')
    expect(deckTarget(item({ slug: 'new', published: false }))).toBe('/slides/new')
    expect(deckTarget(item({ slug: 'live', alias: 'talk', published: true, canEdit: true }))).toBe('/p/talk')
  })
})

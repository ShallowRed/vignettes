import { describe, expect, it } from 'vitest'
import { parseProjects, slugifyProject } from '../../shared/projects/schema'

describe('slugifyProject', () => {
  it('lowercases, strips accents and collapses to dashes', () => {
    expect(slugifyProject('Refonte Présentation')).toBe('refonte-presentation')
    expect(slugifyProject('  Été 2026 !! ')).toBe('ete-2026')
    expect(slugifyProject('Client — Acme')).toBe('client-acme')
  })

  it('returns an empty string when nothing survives (caller falls back)', () => {
    expect(slugifyProject('🎉')).toBe('')
    expect(slugifyProject('   ')).toBe('')
  })
})

describe('parseProjects', () => {
  it('maps slug → metadata and sorts by order then title', () => {
    const projects = parseProjects({
      'vitrine': { title: 'Site vitrine', order: 2 },
      'portail-rse': { title: 'Portail RSE', order: 1, color: '#fff' },
    })
    expect(projects.map(p => p.slug)).toEqual(['portail-rse', 'vitrine'])
    expect(projects[0]).toMatchObject({ slug: 'portail-rse', title: 'Portail RSE', order: 1, color: '#fff' })
  })

  it('orders unset order last, ties broken by title (falling back to slug)', () => {
    const projects = parseProjects({
      zeta: { order: 1 },
      beta: {}, // no order, no title → sorts by slug
      alpha: {},
    })
    expect(projects.map(p => p.slug)).toEqual(['zeta', 'alpha', 'beta'])
  })

  it('coerces a numeric-string order', () => {
    const projects = parseProjects({ a: { order: '3' }, b: { order: '1' } })
    expect(projects.map(p => p.slug)).toEqual(['b', 'a'])
  })

  it('returns an empty list for nullish or malformed input (non-throwing)', () => {
    expect(parseProjects(null)).toEqual([])
    expect(parseProjects(undefined)).toEqual([])
    expect(parseProjects('nope')).toEqual([])
  })
})

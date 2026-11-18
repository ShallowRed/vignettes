import type { z } from 'zod'
import type { HistoryEntry } from '../../layers/studio/shared/presentations'
import type { HISTORY_ENTRY_KINDS } from '../../layers/studio/shared/telemetry/events'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { componentEventName, SLIDE_TEMPLATE_KEYS, STUDIO_EVENTS, studioEventData } from '../../layers/studio/shared/telemetry/events'
import { SLIDE_TEMPLATES } from '../../layers/studio/src/config/editor-reference'
import { currentVisit, pageSite, studioEventPayload } from '../../layers/studio/src/utils/page-view'

/** The data properties of a schema, as `event.property: type`, unions and optional values unwrapped. */
function propertyTypes(schema: z.ZodType, at: string): string[] {
  const def = (schema as unknown as { _zod: { def: { type: string, options?: z.ZodType[], shape?: Record<string, z.ZodType>, innerType?: z.ZodType } } })._zod.def
  if (def.type === 'union')
    return def.options!.flatMap(option => propertyTypes(option, at))
  if (def.type === 'object')
    return Object.entries(def.shape!).flatMap(([key, value]) => propertyTypes(value, `${at}.${key}`))
  if (def.type === 'optional')
    return propertyTypes(def.innerType!, at)
  return [`${at}: ${def.type}`]
}

describe('the catalog of the studio events', () => {
  it('takes each data property from a fixed list', () => {
    const types = Object.entries(STUDIO_EVENTS).flatMap(([name, schema]) => propertyTypes(schema, name))
    expect(types.filter(type => !/: (?:enum|literal|boolean)$/.test(type))).toEqual([])
  })

  it('refuses a value outside its lists', () => {
    expect(studioEventData('access-granted', { scope: 'deck', role: 'owner' as never, via: 'account' })).toBeUndefined()
    expect(studioEventData('editor-inserted', { kind: 'component', name: 'Secret', via: 'toolbar' })).toBeUndefined()
    expect(studioEventData('deck-published', { slug: 'plan' } as never)).toBeUndefined()
    expect(studioEventData('access-granted', { scope: 'deck', role: 'editor', via: 'account' })).toEqual({ scope: 'deck', role: 'editor', via: 'account' })
  })

  it('sends a component registered at runtime under one name', () => {
    expect(componentEventName('Quote')).toBe('Quote')
    expect(componentEventName('slide-background')).toBe('slide-background')
    expect(componentEventName('TenantCard')).toBe('extension')
  })

  it('has a sender for each event', () => {
    const src = fileURLToPath(new URL('../../layers/studio/src', import.meta.url))
    const sources = (readdirSync(src, { recursive: true }) as string[])
      .filter(file => /\.(?:ts|vue)$/.test(file))
      .map(file => readFileSync(`${src}/${file}`, 'utf8'))
      .join('\n')
    expect(Object.keys(STUDIO_EVENTS).filter(name => !sources.includes(`track('${name}'`))).toEqual([])
  })

  it('lists the templates of a slide and the kinds of a history entry', () => {
    expect(SLIDE_TEMPLATES.map(template => template.key).sort()).toEqual([...SLIDE_TEMPLATE_KEYS].sort())
    expectTypeOf<typeof HISTORY_ENTRY_KINDS[number]>().toEqualTypeOf<HistoryEntry['kind']>()
  })
})

describe('studioEventPayload', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the route template, without a referrer, and leaves the referrer to the first page view', () => {
    vi.stubGlobal('document', { referrer: 'https://other.example/a', title: 'The secret title of a deck' })
    vi.stubGlobal('location', { hostname: 'app.example.org', origin: 'https://app.example.org', pathname: '/edit/secret-slug' })
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    vi.stubGlobal('screen', { width: 1440, height: 900 })

    const { payload } = studioEventPayload('deck-published', {}, '/edit/:slug', 'studio')
    expect(payload).toMatchObject({ website: 'studio', url: '/edit/:slug', title: '/edit/:slug', referrer: '', name: 'deck-published', data: {} })
    expect(JSON.stringify(payload)).not.toContain('secret')
    expect(currentVisit('studio').referrer).toBe('https://other.example/a')
  })
})

describe('pageSite', () => {
  const config = { host: 'https://stats.example.org', studioWebsiteId: 'studio', decksWebsiteId: 'decks' }

  it('sends a page of the studio to the studio and a deck page to the decks', () => {
    expect(pageSite(config, '/edit/:slug')).toBe('studio')
    expect(pageSite(config, '/slides/:slug')).toBe('decks')
  })

  it('sends nothing from a page that counts nothing, or without a host or a website', () => {
    expect(pageSite(config, '/recette')).toBeUndefined()
    expect(pageSite(config, '/not-a-page')).toBeUndefined()
    expect(pageSite({ ...config, host: '' }, '/edit/:slug')).toBeUndefined()
    expect(pageSite({ ...config, decksWebsiteId: '' }, '/slides/:slug')).toBeUndefined()
  })
})

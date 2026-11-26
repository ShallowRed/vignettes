import type { PageViewVisit } from '../../layers/studio/src/utils/page-view'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { measuresAudience } from '../../layers/studio/shared/telemetry/umami'
import { deckViewCounts, PAGE_VIEW_PAGES, pageViewEvent, startsPageView, trackStudioPage } from '../../layers/studio/src/utils/page-view'

const PAGES_DIR = fileURLToPath(new URL('../../layers/studio/src/pages', import.meta.url))

function templateOfFile(file: string): string {
  const path = file.replace(/\.vue$/, '').replace(/(^|\/)index$/, '').replace(/\[(\w+)\]/g, ':$1')
  return `/${path}`
}

const visit: PageViewVisit = {
  website: 'site-id',
  hostname: 'app.example.org',
  language: 'fr-FR',
  screen: '1440x900',
  origin: 'https://app.example.org',
  referrer: '',
}

describe('the classification of the pages', () => {
  const templates = (readdirSync(PAGES_DIR, { recursive: true }) as string[])
    .filter(file => file.endsWith('.vue'))
    .map(templateOfFile)

  it('lists the pages that exist', () => {
    expect(Object.keys(PAGE_VIEW_PAGES).sort()).toEqual([...templates].sort())
  })
})

describe('startsPageView', () => {
  it('counts the first path and each change of path, once', () => {
    expect(['/a', '/a', '/b', '/a'].map(startsPageView)).toEqual([true, false, true, true])
  })
})

describe('pageViewEvent', () => {
  it('leaves out the query and the fragment', () => {
    const { payload } = pageViewEvent({ url: '/slides/plan?ticket=secret#/2/1', title: 'Plan' }, visit)
    expect(payload.url).toBe('/slides/plan')
    expect(JSON.stringify(payload)).not.toContain('secret')
  })

  it('reduces the referrer of another site to its origin', () => {
    const { payload } = pageViewEvent({ url: '/', title: '/' }, { ...visit, referrer: 'https://other.example/a?b=c' })
    expect(payload.referrer).toBe('https://other.example')
  })

  it('sends no referrer for a page of the same origin', () => {
    const { payload } = pageViewEvent({ url: '/', title: '/' }, { ...visit, referrer: 'https://app.example.org/edit/secret' })
    expect(payload.referrer).toBe('')
  })

  it('sends no referrer for an address without an origin', () => {
    const { payload } = pageViewEvent({ url: '/', title: '/' }, { ...visit, referrer: 'android-app://com.google.android.gm/' })
    expect(payload.referrer).toBe('')
  })

  it('sends no origin field', () => {
    expect(pageViewEvent({ url: '/', title: '/' }, visit).payload).not.toHaveProperty('origin')
  })
})

describe('trackStudioPage', () => {
  const config = { host: 'https://stats.example.org', studioWebsiteId: 'studio', decksWebsiteId: 'decks' }

  function stubBrowser() {
    const send = vi.fn((_url: string, _init: { body: string }) => Promise.resolve())
    vi.stubGlobal('fetch', send)
    vi.stubGlobal('document', { referrer: '', title: 'The secret title of a deck' })
    vi.stubGlobal('location', { hostname: 'app.example.org', origin: 'https://app.example.org', pathname: '/edit/secret-slug' })
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    vi.stubGlobal('screen', { width: 1440, height: 900 })
    return send
  }

  afterEach(() => vi.unstubAllGlobals())

  it('sends the template of a page that counts, whatever the page holds', () => {
    const send = stubBrowser()
    trackStudioPage(config, '/edit/:slug()')
    expect(send).toHaveBeenCalledOnce()
    const [url, init] = send.mock.calls[0]!
    expect(url).toBe('https://stats.example.org/api/send')
    expect(JSON.parse(init.body).payload).toMatchObject({ website: 'studio', url: '/edit/:slug', title: '/edit/:slug' })
    expect(init.body).not.toContain('secret')
  })

  it.each(['/recette', '/unlock/:slug()', '/slides/:slug()', '/p/:alias()', '/not-a-page'])('sends nothing for %s', (path) => {
    const send = stubBrowser()
    trackStudioPage(config, path)
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing without a host or without a website', () => {
    const send = stubBrowser()
    trackStudioPage({ ...config, host: '' }, '/login')
    trackStudioPage({ ...config, studioWebsiteId: '' }, '/login')
    expect(send).not.toHaveBeenCalled()
  })
})

describe('deckViewCounts', () => {
  const read = { draft: false, speakerViewFrame: false, search: '' }

  it('leaves out the draft, the frames of the speaker view and the print page', () => {
    expect(deckViewCounts({ ...read, publicDeck: true })).toBe(true)
    expect(deckViewCounts({ ...read, publicDeck: true, draft: true })).toBe(false)
    expect(deckViewCounts({ ...read, publicDeck: true, speakerViewFrame: true })).toBe(false)
    expect(deckViewCounts({ ...read, publicDeck: true, search: '?print-pdf' })).toBe(false)
  })
})

describe('measuresAudience', () => {
  it('measures with an address and at least one website', () => {
    expect(measuresAudience({ host: 'https://stats.example.org', studioWebsiteId: '', decksWebsiteId: 'decks' })).toBe(true)
    expect(measuresAudience({ host: 'https://stats.example.org', studioWebsiteId: '', decksWebsiteId: '' })).toBe(false)
    expect(measuresAudience({ host: '', studioWebsiteId: 'studio', decksWebsiteId: 'decks' })).toBe(false)
  })
})

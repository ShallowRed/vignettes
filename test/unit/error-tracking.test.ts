import { createError } from 'h3'
import { describe, expect, it } from 'vitest'
import { ERROR_TRACKING_DEFAULTS, isRequestRefusal, scrubErrorEvent } from '../../layers/studio/shared/error-tracking'
import { ADAPTERS, NOW, useAdapter } from './helpers/adapters'

describe('scrubErrorEvent', () => {
  it('keeps nothing of a request but its path', () => {
    const event = scrubErrorEvent({
      user: { id: 1 },
      breadcrumbs: [{ message: 'typed text' }],
      extra: { deck: 'text' },
      request: {
        url: 'https://decks.example.org/deck-pass?ticket=secret#top',
        data: { password: 'secret' },
        cookies: { session: 'secret' },
        headers: { cookie: 'secret' },
        query_string: 'ticket=secret',
      },
    })
    expect(event).toEqual({ request: { url: 'https://decks.example.org/deck-pass' } })
  })

  it('cleans what the SDK writes for an error of a Nuxt route', () => {
    const event = scrubErrorEvent({
      transaction: 'GET /deck-pass?ticket=secret',
      contexts: {
        nuxt: { method: 'GET', path: '/deck-pass?ticket=secret' },
        vue: { propsData: { slide: 'text' } },
        runtime: { name: 'node' },
      },
    })
    expect(event).toEqual({ transaction: 'GET /deck-pass', contexts: { runtime: { name: 'node' } } })
  })

  it('removes the parameters of an address from a message', () => {
    const event = scrubErrorEvent({
      message: '[GET] "/x?ticket=a&next=b": 500',
      exception: { values: [{ value: '[GET] "/api/p?ticket=a": 500 Server Error' }] },
    })
    expect(event.message).toBe('[GET] "/x": 500')
    expect(event.exception!.values![0]!.value).toBe('[GET] "/api/p": 500 Server Error')
  })

  it('keeps the SQL of a failed query and removes its values', () => {
    const event = scrubErrorEvent({
      exception: { values: [{ value: 'Failed query: select * from t where a = ? and b = ?\nparams: secret,other' }] },
    })
    expect(event.exception!.values![0]!.value).toBe('Failed query: select * from t where a = ? and b = ?')
  })

  it('leaves a query written without spaces', () => {
    const event = scrubErrorEvent({ exception: { values: [{ value: 'Failed query: update t set a=?,b=? where c=?' }] } })
    expect(event.exception!.values![0]!.value).toBe('Failed query: update t set a=?,b=? where c=?')
  })

  it('removes the query of the file of a stack frame', () => {
    const event = scrubErrorEvent({ exception: { values: [{ stacktrace: { frames: [{ filename: 'https://decks.example.org/deck-pass?ticket=secret' }] } }] } })
    expect(event.exception!.values![0]!.stacktrace!.frames![0]!.filename).toBe('https://decks.example.org/deck-pass')
  })

  it('accepts an event without any of these fields', () => {
    expect(scrubErrorEvent({})).toEqual({})
  })
})

describe('isRequestRefusal', () => {
  it('names the 4xx errors a route throws, and leaves the server errors', () => {
    expect(isRequestRefusal(createError({ statusCode: 404, statusMessage: 'Not found' }))).toBe(true)
    expect(isRequestRefusal(createError({ statusCode: 500 }))).toBe(false)
    expect(isRequestRefusal(new Error('Cannot remove headers after they are sent to the client'))).toBe(false)
  })
})

describe('the error of a failed query', () => {
  const pglite = ADAPTERS.filter(adapter => adapter.name === 'pglite')

  describe.each(pglite)('$name', (adapter) => {
    const db = useAdapter(adapter)

    it('loses the values it carries', async () => {
      const project = { slug: 'secret-slug', title: 'Secret title', createdAt: NOW, updatedAt: NOW }
      await db.rows.insert('projects', project)
      const error = await db.rows.insert('projects', project).catch((failure: Error) => failure) as Error
      expect(error.message).toContain('Secret title')

      const event = scrubErrorEvent({ exception: { values: [{ value: error.message }] } })
      expect(event.exception!.values![0]!.value).toMatch(/^Failed query: insert into/)
      expect(event.exception!.values![0]!.value).not.toContain('Secret title')
    })
  })
})

describe('the options of the SDK', () => {
  it('sends errors alone, without personal data or the path of the visit', () => {
    expect(ERROR_TRACKING_DEFAULTS).toEqual({
      tracesSampleRate: 0,
      sendDefaultPii: false,
      maxBreadcrumbs: 0,
      attachProps: false,
      sendClientReports: false,
    })
  })
})

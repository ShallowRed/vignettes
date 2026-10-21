import { describe, expect, it, vi } from 'vitest'
import { stubH3Globals } from './helpers/server-db'

stubH3Globals()
vi.stubGlobal('defineNitroPlugin', (plugin: unknown) => plugin)

const { default: apiErrors } = await import('../../layers/studio/server/plugins/api-errors')

/** The handler the plugin hooks on `error`. */
function errorHook() {
  let hook: ((error: Error, context: { event?: unknown }) => Promise<void>) | undefined
  ;(apiErrors as (app: unknown) => void)({ hooks: { hook: (_: string, fn: typeof hook) => (hook = fn) } })
  return hook!
}

describe('the API error log', () => {
  it('logs the error a server error wraps, with the line the client got', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = new Error('bucket unreachable')
    const failure = Object.assign(new Error('The image storage did not accept the file'), {
      statusCode: 503,
      statusMessage: 'The image storage did not accept the file',
      cause,
    })
    await errorHook()(failure, { event: { method: 'POST', path: '/api/media?deck=notes' } })
    expect(error).toHaveBeenCalledWith('[api] POST /api/media 503 The image storage did not accept the file (anonymous)', cause)
    error.mockRestore()
  })
})

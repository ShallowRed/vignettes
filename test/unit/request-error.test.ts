import { describe, expect, it } from 'vitest'
import { requestErrorMessage } from '../../layers/studio/src/utils/request-error'

describe('requestErrorMessage', () => {
  it('reads the server message from the body when HTTP/2 left the status text empty', () => {
    const error = { statusCode: 404, statusMessage: '', data: { statusCode: 404, statusMessage: 'Unknown user', message: 'Unknown user' } }
    expect(requestErrorMessage(error, 'Save failed')).toBe('Unknown user')
  })

  it('falls back when the request got no answer', () => {
    expect(requestErrorMessage({ message: 'Failed to fetch' }, 'Save failed')).toBe('Save failed')
  })
})

import { requestErrorMessage } from '../utils/request-error'
/**
 * Rethrows a failed request as a `NuxtError`. The SSR payload serializes a
 * `NuxtError` and refuses a `FetchError`, which would replace the page with the
 * server error page.
 */
export function throughPayload<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error: { statusCode?: number, statusMessage?: string, message?: string }) => {
    throw createError({
      statusCode: error?.statusCode ?? 500,
      statusMessage: requestErrorMessage(error, error?.message || 'Request failed'),
    })
  })
}

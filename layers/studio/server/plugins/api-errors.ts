/**
 * One log line per API request that ends in an error: method, path, status, the
 * message the client received and the account that asked. A refusal the
 * interface shows as a toast can then be read on the instance. A server error
 * also logs its stack.
 */

import { getActor } from '../utils/actor'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event }) => {
    // The query string can carry a token: the path alone is logged.
    const path = event?.path.split('?')[0]
    if (!event || !path?.startsWith('/api/'))
      return
    const status = (error as { statusCode?: number }).statusCode ?? 500
    const message = (error as { statusMessage?: string }).statusMessage || error.message
    const actor = await getActor(event).catch(() => null)
    const line = `[api] ${event.method} ${path} ${status} ${message} (${actor?.login ?? 'anonymous'})`
    if (status >= 500)
      console.error(line, error.stack)
    else
      console.warn(line)
  })
})

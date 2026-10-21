/**
 * One log line per API request that ends in an error: method, path, status, the
 * message the client received, the account that asked and its address. A refusal the
 * interface shows as a toast can then be read on the instance. A server error
 * also logs its stack and the error it wraps, such as a storage failure.
 */

import { actorLabel, getActor } from '../utils/actor'
import { clientAddress } from '../utils/client-address'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', async (error, { event }) => {
    // The query string can carry a token: the path alone is logged.
    const path = event?.path.split('?')[0]
    if (!event || !path?.startsWith('/api/'))
      return
    const status = (error as { statusCode?: number }).statusCode ?? 500
    const message = (error as { statusMessage?: string }).statusMessage || error.message
    const actor = await getActor(event).catch(() => null)
    const line = `[api] ${event.method} ${path} ${status} ${message} (${actorLabel(actor)} from ${clientAddress(event)})`
    if (status >= 500)
      console.error(line, error.cause instanceof Error ? error.cause : error.stack)
    else
      console.warn(line)
  })
})

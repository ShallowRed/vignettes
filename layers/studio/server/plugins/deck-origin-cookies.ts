import { sessionSettings } from '../utils/config'
import { requestSide } from '../utils/deck-origin'

/**
 * The deck origin answers without a session of the studio: nuxt-auth-utils
 * creates an empty session for a visitor without one as each page reads the
 * session (`/api/_auth/session`), and its cookie would ride along every request
 * of the deck origin. The response leaves it out as it writes its headers, the
 * one step every answer goes through, redirects included.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    if (requestSide(event) !== 'decks')
      return
    const { name } = sessionSettings()
    const res = event.node.res
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => typeof res
    res.writeHead = ((...args: unknown[]) => {
      const cookies = res.getHeader('set-cookie')
      if (cookies !== undefined)
        res.setHeader('set-cookie', [cookies].flat().map(String).filter(cookie => !cookie.startsWith(`${name}=`)))
      return writeHead(...args)
    }) as typeof res.writeHead
  })
})

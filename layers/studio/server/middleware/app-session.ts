import { getAppSession } from '../utils/actor'

/**
 * Resolve the UI-facing session once per page request and stash it on the event
 * context. The universal `app-session` plugin reads it to seed `useState` during
 * SSR, so the header renders the same auth branch on server and client (no
 * hydration mismatch). Skipped for API/asset requests, which never render chrome.
 */
export default defineEventHandler(async (event) => {
  const path = event.path
  if (event.method !== 'GET'
    || path.startsWith('/api/')
    || path.startsWith('/_')
    || path.startsWith('/frozen')
    || path.startsWith('/media')
    || /\.[a-z0-9]+(?:\?|$)/i.test(path)) {
    return
  }
  event.context.appSession = await getAppSession(event)
})

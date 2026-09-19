import { getDefaultTheme } from '@vignettes/core/theme'
import { loadTenantThemes } from '../utils/themes'

/**
 * Hand the tenant themes and the fallback theme to page requests, so the
 * universal `theme-registry` plugin seeds the client with the same registry and
 * the same fallback the server rendered with.
 * Skipped for API and asset requests, like the session middleware.
 */
export default defineEventHandler(async (event) => {
  const path = event.path
  if (event.method !== 'GET'
    || path.startsWith('/api/')
    || path.startsWith('/_')
    || path.startsWith('/frozen')
    || path.startsWith('/media')
    || path.startsWith('/themes')
    || /\.[a-z0-9]+(?:\?|$)/i.test(path)) {
    return
  }
  event.context.themeRegistry = await loadTenantThemes()
  event.context.defaultTheme = getDefaultTheme()
})

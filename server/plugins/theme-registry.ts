import { loadTenantThemes } from '../utils/themes'

/** Register the tenant themes at boot, so API routes resolve theme names before any page request. */
export default defineNitroPlugin(async () => {
  try {
    await loadTenantThemes()
  }
  catch (err) {
    console.warn(`[themes] initial load failed: ${(err as Error).message}`)
  }
})

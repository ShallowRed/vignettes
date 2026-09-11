import { assertOwner } from '../../../utils/access'
import { invalidateTenantThemes, loadTenantThemes } from '../../../utils/themes'

/**
 * POST /api/admin/themes/reload: re-read the tenant themes now instead of
 * waiting for the cache to expire, after a `theme:push`. Owner only.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)
  invalidateTenantThemes()
  const registry = await loadTenantThemes()
  return {
    themes: Object.keys(registry.tokens ?? {}),
    aliases: registry.aliases ?? {},
  }
})

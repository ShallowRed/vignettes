import { assertOwner } from '../../../utils/access'
import { invalidateTenantThemes, loadTenantThemes, publishedThemeVersionGaps } from '../../../utils/themes'

/**
 * POST /api/admin/themes/reload: re-read the tenant themes at once, after a
 * `theme:push`. Owner only. `gaps` lists the published themes compiled with
 * other theme packages than this instance's.
 */
export default defineEventHandler(async (event) => {
  await assertOwner(event)
  invalidateTenantThemes()
  const registry = await loadTenantThemes()
  return {
    themes: Object.keys(registry.tokens ?? {}),
    aliases: registry.aliases ?? {},
    gaps: publishedThemeVersionGaps(),
  }
})

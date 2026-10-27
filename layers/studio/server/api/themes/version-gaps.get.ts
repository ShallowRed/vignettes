import { assertSignedIn } from '../../utils/access'
import { loadTenantThemes, publishedThemeVersionGaps } from '../../utils/themes'

/**
 * GET /api/themes/version-gaps: the names of the published themes compiled with
 * other theme packages than this instance's, for the editor to flag a deck in
 * one of them. Signed-in accounts.
 */
export default defineEventHandler(async (event): Promise<string[]> => {
  await assertSignedIn(event)
  await loadTenantThemes()
  return [...new Set(publishedThemeVersionGaps().map(gap => gap.theme))]
})

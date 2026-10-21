import type { TokenSummary } from '#shared/access'
import { assertSignedIn } from '../../utils/access'
import { tokenSummary, useTokenStore } from '../../utils/personal-token'

/** GET /api/tokens: the personal tokens of the signed-in account, newest first. */
export default defineEventHandler(async (event): Promise<TokenSummary[]> => {
  const actor = await assertSignedIn(event)
  const now = new Date()
  return (await useTokenStore().listForUser(actor.id)).map(token => tokenSummary(token, now))
})

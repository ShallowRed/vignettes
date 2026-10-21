import type { AccountSummary } from '#shared/access'
import { assertOwner } from '../../utils/access'
import { useTokenStore } from '../../utils/personal-token'
import { useUserStore } from '../../utils/users'

/** GET /api/admin/users: every known identity, its runtime role and its active tokens (owner only). */
export default defineEventHandler(async (event): Promise<AccountSummary[]> => {
  await assertOwner(event)
  const [accounts, activeTokens] = await Promise.all([useUserStore().list(), useTokenStore().activeCounts(new Date())])
  return accounts.map(account => ({ ...account, activeTokens: activeTokens.get(account.id) ?? 0 }))
})

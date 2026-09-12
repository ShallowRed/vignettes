import { assertOwner } from '../../utils/access'
import { useUserStore } from '../../utils/users'

/** GET /api/admin/users — every known identity and its runtime role (owner only). */
export default defineEventHandler(async (event) => {
  await assertOwner(event)
  return await useUserStore().list()
})

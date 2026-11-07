import { assertSignedIn } from '../utils/access'
import { listPictograms } from '../utils/pictograms'

/** GET /api/pictograms: the pictograms a deck can name, for the editor to complete `picto`. Signed-in accounts. */
export default defineEventHandler(async (event): Promise<string[]> => {
  await assertSignedIn(event)
  return await listPictograms()
})

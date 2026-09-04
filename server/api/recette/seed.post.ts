import { assertRecette, seedRecette } from '../../utils/recette'

/** POST /api/recette/seed: reset and recreate the `recette-*` data set. */
export default defineEventHandler(async (event) => {
  await assertRecette(event)
  return seedRecette()
})

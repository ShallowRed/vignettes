import { RECETTE_PERSONAS } from '#shared/recette/personas'
import { getActor } from '../../utils/actor'
import { assertRecette, isRecetteSeeded, recetteCounts, recetteImages } from '../../utils/recette'

/**
 * GET /api/recette/status: the kit's state for the page. Opening it as an owner
 * issues the pass; afterwards any persona may read it with that pass. The
 * recette of the branch is read by `GET /api/recette/branch`.
 */
export default defineEventHandler(async (event) => {
  const pass = await assertRecette(event)
  const actor = await getActor(event)
  return {
    owner: pass.user.login,
    current: { login: actor.login ?? null, role: actor.role },
    seeded: await isRecetteSeeded(),
    counts: recetteCounts(),
    personas: RECETTE_PERSONAS,
    images: await recetteImages(),
  }
})

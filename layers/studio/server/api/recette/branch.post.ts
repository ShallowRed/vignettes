import process from 'node:process'
import { assertRecette } from '../../utils/recette'
import { seedBranchDecks } from '../../utils/recette-branch'

/**
 * POST /api/recette/branch: replace the trial decks of the branch recette with
 * their file. Development only: staging opens the kit, never the working tree.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await assertRecette(event)
  return { decks: await seedBranchDecks(process.cwd(), { replace: true }) }
})

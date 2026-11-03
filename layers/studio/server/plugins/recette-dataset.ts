import process from 'node:process'
import { serverConfig } from '../utils/config'
import { databaseReady } from '../utils/db'
import { hasRecetteData, isRecetteEnabled, isRecetteSeeded, resetRecette, seedRecette } from '../utils/recette'
import { seedBranchDecks } from '../utils/recette-branch'

/**
 * An instance that sets `NUXT_RECETTE_ENABLED=1` gets the acceptance data set at
 * boot when it is absent or incomplete. An instance where the kit cannot be
 * opened at all loses the data set and the five accounts it created, one of
 * which holds the owner role: the database is replicated, so leaving them behind
 * would carry that account onto whatever the replica is restored to. Runs once
 * the migrations end. Development keeps what the `/recette` page created there,
 * since the page answers in development, and publishes the missing trial decks
 * of the branch recette (`test/recette/*.yaml`).
 */
export default defineNitroPlugin(async () => {
  try {
    await databaseReady()
    if (!isRecetteEnabled()) {
      if (await hasRecetteData()) {
        await resetRecette()
        console.log('[recette] the kit is unreachable here: its data set and its accounts were removed')
      }
      return
    }
    if (import.meta.dev) {
      const published = await seedBranchDecks(process.cwd(), { replace: false })
      if (published > 0)
        console.log(`[recette] trial decks of the branch created: ${published}`)
    }
    if (!serverConfig().recetteEnabled)
      return
    if (!await isRecetteSeeded()) {
      const summary = await seedRecette()
      console.log(`[recette] data set created: ${summary.decks} decks, ${summary.folders} folders, ${summary.accounts} accounts`)
    }
  }
  catch (error) {
    console.warn(`[recette] the data set could not be brought to its expected state: ${(error as Error).message}`)
  }
})

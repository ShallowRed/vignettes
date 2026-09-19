import process from 'node:process'
import { isRecetteSeeded, seedRecette } from '../utils/recette'

/**
 * An instance that sets `NUXT_RECETTE_ENABLED=1` gets the acceptance data set at
 * boot when it is absent or incomplete. Runs after the `migrations` plugin, which
 * precedes it by name. Development seeds from the `/recette` page only.
 */
export default defineNitroPlugin(async () => {
  if (process.env.NUXT_RECETTE_ENABLED !== '1')
    return
  try {
    if (!await isRecetteSeeded()) {
      const summary = await seedRecette()
      console.log(`[recette] data set created: ${summary.decks} decks, ${summary.folders} folders, ${summary.accounts} accounts`)
    }
  }
  catch (error) {
    console.warn(`[recette] the data set could not be created: ${(error as Error).message}`)
  }
})

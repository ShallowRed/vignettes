import { TRIAL_FEATURES } from '#shared/trials'
import { isRecetteEnabled } from '../utils/recette'

// The features on trial open where the acceptance kit opens: in development
// and on staging.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.trials = isRecetteEnabled() ? [...TRIAL_FEATURES] : []
  })
})

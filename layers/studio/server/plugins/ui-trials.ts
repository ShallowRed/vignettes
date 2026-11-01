import { isRecetteEnabled } from '../utils/recette'

// The menu that tries another interface theme opens where the acceptance kit
// opens: in development and on staging.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.uiTrials = isRecetteEnabled()
  })
})

import { isRecetteEnabled } from '../utils/recette'

// The menus that try another interface theme or typeface open where the
// acceptance kit opens: in development and on staging.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context.uiTrials = isRecetteEnabled()
  })
})

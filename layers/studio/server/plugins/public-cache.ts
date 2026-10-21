import { dropCookiesOfPublicResponse } from '../utils/public-cache'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', dropCookiesOfPublicResponse)
})

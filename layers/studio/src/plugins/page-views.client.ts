import { startsPageView, trackStudioPage } from '../utils/page-view'

/** Sends the view of each page of the studio, on an instance that sets `NUXT_PUBLIC_UMAMI_HOST`. */
export default defineNuxtPlugin(() => {
  const { umami } = useRuntimeConfig().public
  useRouter().afterEach((to, _from, failure) => {
    if (!failure && startsPageView(to.path))
      trackStudioPage(umami, to.matched.at(-1)?.path)
  })
})

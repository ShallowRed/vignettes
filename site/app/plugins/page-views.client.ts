import { currentVisit, pageViewEvent, sendPageView, startsPageView } from '../../../layers/studio/src/utils/page-view'

/** Sends the view of each page of the site, on a build that sets `NUXT_PUBLIC_UMAMI_HOST`. */
export default defineNuxtPlugin(() => {
  const { host, websiteId } = useRuntimeConfig().public.umami
  if (host && websiteId) {
    useRouter().afterEach((to, _from, failure) => {
      if (!failure && startsPageView(to.path))
        sendPageView(host, pageViewEvent({ url: to.path, title: to.path }, currentVisit(websiteId)))
    })
  }
})

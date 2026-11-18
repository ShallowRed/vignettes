import type { StudioEventData, StudioEventName } from '#shared/telemetry/events'
import { studioEventData } from '#shared/telemetry/events'
import { pageSite, routeTemplate, sendToUmami, studioEventPayload } from '../utils/page-view'

/**
 * `track` sends an event of the catalog from the current page, on an instance
 * whose page has an Umami website. Call it after the action succeeds.
 */
export function useStudioEvent() {
  const { umami } = useRuntimeConfig().public
  const router = useRouter()

  function track<Name extends StudioEventName>(name: Name, data: StudioEventData<Name>): void {
    const routePath = router.currentRoute.value.matched.at(-1)?.path
    if (!import.meta.client || !routePath)
      return
    const template = routeTemplate(routePath)
    const website = pageSite(umami, template)
    const sent = studioEventData(name, data)
    if (website && sent)
      sendToUmami(umami.host, studioEventPayload(name, sent, template, website))
  }

  return { track }
}

import type { AppSession } from '#shared/access'

/**
 * Seed the `app-session` state during SSR from the value the server middleware
 * resolved onto the request context. Without this, `useAppSession` only fills the
 * state via a non-awaited `useAsyncData` (payload-only), so the synchronous SSR
 * render sees `null` and the header renders "logged out" while the client
 * hydrates "logged in" — a hydration mismatch. Seeding here makes both agree.
 */
export default defineNuxtPlugin(() => {
  if (!import.meta.server)
    return
  const event = useRequestEvent()
  const seeded = event?.context.appSession as AppSession | undefined
  if (seeded)
    useState<AppSession | null>('app-session', () => seeded)
})

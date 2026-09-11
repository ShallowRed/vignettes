import type { ThemeRegistry } from '#shared/theme'
import { setThemeRegistry } from '#shared/theme'

/**
 * Seed the theme registry on both sides of the render. The server middleware
 * resolves the tenant themes (content space or object storage) onto the request
 * context; this plugin copies them into a `useState` during SSR and applies them
 * to the shared module on the server and on the client, so theme names, aliases
 * and backgrounds resolve identically before and after hydration.
 */
export default defineNuxtPlugin(() => {
  const state = useState<Partial<ThemeRegistry> | null>('theme-registry', () => null)
  if (import.meta.server) {
    const event = useRequestEvent()
    const seeded = event?.context.themeRegistry as Partial<ThemeRegistry> | undefined
    if (seeded)
      state.value = seeded
  }
  setThemeRegistry(state.value)
})

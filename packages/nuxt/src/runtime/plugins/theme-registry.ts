import type { ThemeRegistry } from '@vignettes/core/theme'
import { defineNuxtPlugin, useRequestEvent, useState } from '#imports'
import { setDefaultTheme, setThemeRegistry } from '@vignettes/core/theme'

/**
 * Seed the theme registry on both sides of the render. The server middleware
 * resolves the tenant themes (content space or object storage) onto the request
 * context; this plugin copies them into a `useState` during SSR and applies them
 * to the shared module on the server and on the client, so theme names, aliases
 * and backgrounds resolve identically before and after hydration. The fallback
 * theme, which the host names beside its themes, travels the same way.
 */
export default defineNuxtPlugin(() => {
  const state = useState<Partial<ThemeRegistry> | null>('theme-registry', () => null)
  const fallback = useState<string | null>('theme-default', () => null)
  if (import.meta.server) {
    const event = useRequestEvent()
    const seeded = event?.context.themeRegistry as Partial<ThemeRegistry> | undefined
    if (seeded)
      state.value = seeded
    const seededDefault = event?.context.defaultTheme as string | undefined
    if (seededDefault)
      fallback.value = seededDefault
  }
  setThemeRegistry(state.value)
  // A render the middleware skipped carries no value and must not reset the fallback of the process.
  if (fallback.value)
    setDefaultTheme(fallback.value)
})

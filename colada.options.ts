import type { PiniaColadaOptions } from '@pinia/colada'

/**
 * Global Pinia Colada config (consumed by @pinia/colada-nuxt). The catalog data
 * is session-dependent, so queries stay short-lived and revalidate readily; the
 * per-request cache clear + SSR-no-GC plugin the Nuxt module installs keep SSG
 * and tests leak-free. Mutations invalidate explicitly, so we don't rely on a
 * long staleTime to refresh after a write.
 */
export default {
  queryOptions: {
    // Treat cached data as fresh for a short window (dedupes bursts of the same
    // query across components) while still revalidating on navigation/mount.
    staleTime: 30_000,
  },
} satisfies PiniaColadaOptions

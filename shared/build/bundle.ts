import process from 'node:process'

// Single typed reader for the standalone-bundle env toggles. Pure and Nuxt-free:
// imported by nuxt.config.ts (relative), the server plugin (#shared), and tests.
export interface BundleConfig {
  enabled: boolean
  onlySlug?: string
  /** Reduced `public/` dir to build against (avoids aspirating the whole repo). */
  publicDir?: string
  theme: string
  baseUrl: string
}

export const DEFAULT_BUNDLE_THEME = 'brand'

export function readBundleConfig(env: NodeJS.ProcessEnv = process.env): BundleConfig {
  const onlySlug = env.BUNDLE_ONLY_SLUG || undefined
  const publicDir = env.BUNDLE_PUBLIC_DIR || undefined
  return {
    enabled: Boolean(onlySlug),
    onlySlug,
    publicDir,
    theme: env.BUNDLE_THEME || DEFAULT_BUNDLE_THEME,
    baseUrl: env.NUXT_APP_BASE_URL || '/',
  }
}

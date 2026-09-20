import process from 'node:process'

// Single typed reader for the frozen-bundle env toggles. Pure and Nuxt-free, so
// a host reads it from its Nuxt configuration, its server and its tests alike.
// The freeze run sets every value for the one deck being frozen.
export interface BundleConfig {
  enabled: boolean
  onlySlug?: string
  /** Reduced `public/` dir to build against (avoids shipping the whole app's assets). */
  publicDir?: string
  /** Theme whose stylesheet the Reveal-only page links; the frozen deck's own theme. */
  theme?: string
  /** Base the deck's `storybook:` frontmatter is rewritten to, so embeds resolve inside the bundle. */
  storybookUrl: string
  baseUrl: string
}

/** Where `scripts/freeze.ts` copies the built Storybook inside the bundle. */
export const BUNDLE_STORYBOOK_URL = '/_storybook'

export function readBundleConfig(env: NodeJS.ProcessEnv = process.env): BundleConfig {
  const onlySlug = env.BUNDLE_ONLY_SLUG || undefined
  const baseUrl = env.NUXT_APP_BASE_URL || '/'
  return {
    enabled: Boolean(onlySlug),
    onlySlug,
    publicDir: env.BUNDLE_PUBLIC_DIR || undefined,
    theme: env.BUNDLE_THEME || undefined,
    storybookUrl: env.BUNDLE_STORYBOOK_URL || bundleStorybookUrl(baseUrl),
    baseUrl,
  }
}

/**
 * The bundled Storybook's URL under a given base. A bundle served at
 * `/frozen/<name>/` carries its Storybook at `/frozen/<name>/_storybook`.
 */
export function bundleStorybookUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return `${base}${BUNDLE_STORYBOOK_URL}`
}

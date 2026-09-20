// Pure derivation of a freeze job from a deck entry, consumed by
// scripts/freeze.ts. A freeze turns one published deck into a self-contained
// static bundle: no server, no database, no Nuxt runtime, served for good under
// the deck's stable alias.

/** Minimal deck-entry shape a freeze needs (mirrors the server's directory entry). */
export interface FreezeRegistryEntry {
  alias: string
  /** Deck slug; defaults to the alias. */
  slug?: string
  /** Bundle directory name; defaults to the alias, so the served URL never moves. */
  frozenBundle?: string
}

export interface FreezeOptions {
  /** The deck's theme, read from the database row or its stub. */
  theme?: string
  /** Built Storybook to embed, when the deck holds story embeds. */
  storybookDir?: string
  frozenHostDir?: string
}

export interface FreezeStep {
  id: 'build-bundle' | 'embed-storybook' | 'host-bundle' | 'upload-bundle' | 'flip-lifecycle'
  description: string
  enabled: boolean
}

export interface FreezeDescriptor {
  alias: string
  slug: string
  bundle: string
  theme?: string
  /** Base URL the bundle is served under, and the base its assets resolve against. */
  baseUrl: string
  /** Local directory the built bundle is hosted in before upload. */
  hostDir: string
  /** Directory the deck page sits in inside the bundle, under `slides/`. */
  deckDir: string
  /** Public URL the alias resolves to once frozen. */
  servedUrl: string
  embedsStorybook: boolean
  steps: FreezeStep[]
}

/**
 * The deck page of a bundle keeps the historical `--standalone` directory name,
 * so a link to a bundle frozen years ago still answers. The suffix names the
 * Reveal-only copy of the deck, nothing else.
 */
export function bundleDeckDir(slug: string): string {
  return `${slug}--standalone`
}

export const DEFAULT_FROZEN_HOST_DIR = '.frozen'

export function buildFreezeDescriptor(
  entry: FreezeRegistryEntry,
  options: FreezeOptions = {},
): FreezeDescriptor {
  const slug = entry.slug || entry.alias
  const bundle = entry.frozenBundle || entry.alias
  const hostRoot = options.frozenHostDir || DEFAULT_FROZEN_HOST_DIR
  const baseUrl = `/frozen/${bundle}/`
  const embedsStorybook = Boolean(options.storybookDir)

  const steps: FreezeStep[] = [
    {
      id: 'build-bundle',
      description: `Generate the Reveal-only deck '${slug}'${options.theme ? ` with the theme '${options.theme}'` : ''}`,
      enabled: true,
    },
    {
      id: 'embed-storybook',
      description: 'Copy the built Storybook into the bundle and rebase its asset URLs',
      enabled: embedsStorybook,
    },
    {
      id: 'host-bundle',
      description: `Write the bundle to ${hostRoot}/${bundle}/ with its provenance`,
      enabled: true,
    },
    {
      id: 'upload-bundle',
      description: `Upload it to the bucket under frozen/${bundle}/`,
      enabled: true,
    },
    {
      id: 'flip-lifecycle',
      description: `Set lifecycle 'frozen' and frozenBundle '${bundle}' on the deck '${slug}'`,
      enabled: true,
    },
  ]

  const deckDir = bundleDeckDir(slug)
  return {
    alias: entry.alias,
    slug,
    bundle,
    theme: options.theme,
    baseUrl,
    hostDir: `${hostRoot}/${bundle}`,
    deckDir,
    servedUrl: `${baseUrl}slides/${deckDir}/`,
    embedsStorybook,
    steps,
  }
}

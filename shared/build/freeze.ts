// Pure, framework-free derivation of a freeze job from a registry entry,
// consumed by scripts/freeze.js.

/** Minimal registry-entry shape a freeze needs (mirrors server RegistryEntry). */
export interface FreezeRegistryEntry {
  alias: string
  /** Defaults to alias. */
  slug?: string
  source?: 'codimd' | 'hackmd'
  noteId?: string
  /** Defaults to alias. */
  frozenBundle?: string
}

export interface FreezeOptions {
  theme?: string
  frozenHostDir?: string
  bundleOut?: string
}

export interface FreezeStep {
  id: 'pull-note' | 'bundle-frozen' | 'host-frozen' | 'flip-lifecycle'
  description: string
  enabled: boolean
}

export interface FreezeDescriptor {
  alias: string
  slug: string
  theme: string
  standaloneSlug: string
  frozenBaseUrl: string
  hostDir: string
  bundleOut: string
  /** Public URL the alias resolves to once frozen. */
  servedUrl: string
  isCollaborative: boolean
  steps: FreezeStep[]
}

export const DEFAULT_FREEZE_THEME = 'brand'
export const DEFAULT_FROZEN_HOST_DIR = '.frozen'
export const DEFAULT_BUNDLE_OUT = 'dist-standalone'

export function buildFreezeDescriptor(
  entry: FreezeRegistryEntry,
  options: FreezeOptions = {},
): FreezeDescriptor {
  const slug = entry.slug || entry.alias
  const bundle = entry.frozenBundle || entry.alias
  const theme = options.theme || DEFAULT_FREEZE_THEME
  const hostRoot = options.frozenHostDir || DEFAULT_FROZEN_HOST_DIR
  const frozenBaseUrl = `/frozen/${bundle}/`
  const standaloneSlug = `${slug}--standalone`
  const isCollaborative
    = (entry.source === 'codimd' || entry.source === 'hackmd') && Boolean(entry.noteId)

  const steps: FreezeStep[] = [
    {
      id: 'pull-note',
      description: 'Rapatriate the live note body into the repo stub (keeps frontmatter)',
      enabled: isCollaborative,
    },
    {
      id: 'bundle-frozen',
      description: `Freeze the deck into a self-contained Reveal-only bundle (theme '${theme}')`,
      enabled: true,
    },
    {
      id: 'host-frozen',
      description: `Host the bundle under ${hostRoot}/${bundle}/`,
      enabled: true,
    },
    {
      id: 'flip-lifecycle',
      description: `Set lifecycle: frozen (+ frozenBundle: ${bundle}) for '${entry.alias}' in registry.yml`,
      enabled: true,
    },
  ]

  return {
    alias: entry.alias,
    slug,
    theme,
    standaloneSlug,
    frozenBaseUrl,
    hostDir: `${hostRoot}/${bundle}`,
    bundleOut: options.bundleOut || DEFAULT_BUNDLE_OUT,
    servedUrl: `/frozen/${bundle}/slides/${standaloneSlug}/`,
    isCollaborative,
    steps,
  }
}

// Single pure definition of Storybook's runtime files and asset-root detection,
// shared by the four freeze scripts (mirror/prune/rebase/link).

// Storybook's own build output (shell, manifests, runtime dirs): never a
// staticDir asset, so never mirrored/pruned/rebased.
export const STORYBOOK_RUNTIME: ReadonlySet<string> = new Set([
  'index.html',
  'iframe.html',
  'index.json',
  'project.json',
  'nunjucks-env.js',
  'vite-inject-mocker-entry.js',
  'assets',
  'sb-addons',
  'sb-common-assets',
  'sb-manager',
  'sb-preview',
  '.well-known',
])

// Runtime = the RUNTIME set plus any `.js`/`.json` file.
export function isStorybookRuntime(name: string): boolean {
  return STORYBOOK_RUNTIME.has(name) || name.endsWith('.js') || name.endsWith('.json')
}

// Re-baseable static-asset roots: entries that are neither runtime nor a dotfile.
// A root-absolute URL whose first segment is one of these points at a staticDir
// asset carried under `_storybook/<root>/`.
export function detectAssetRoots(entryNames: Iterable<string>): string[] {
  const roots: string[] = []
  for (const name of entryNames) {
    if (isStorybookRuntime(name) || name.startsWith('.'))
      continue
    roots.push(name)
  }
  return roots
}

export interface StorybookFreezeStep {
  id: 'prune' | 'rebase' | 'link'
  script: string
  description: string
}

// The passes that turn a built Storybook into a self-contained bundle embed,
// in the order `scripts/freeze.ts` runs them.
export const STORYBOOK_FREEZE_STEPS: readonly StorybookFreezeStep[] = [
  {
    id: 'prune',
    script: 'scripts/prune-storybook-assets.js',
    description: 'Prune the built Storybook\'s staticDir assets to the set its stories reference',
  },
  {
    id: 'rebase',
    script: 'scripts/rebase-storybook-assets.js',
    description: 'Rebase root-absolute asset URLs to bundle-relative so the iframe self-resolves',
  },
  {
    id: 'link',
    script: 'scripts/link-deck-css.js',
    description: 'Link the _nuxt CSS chunks into the deck HTML so MDC component styles apply',
  },
]

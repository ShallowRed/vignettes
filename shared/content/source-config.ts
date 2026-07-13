import process from 'node:process'
import { z } from 'zod'

// Single validated, declared config for the presentations content source. Pure
// and framework-free: usable from the build script and the server, unit-testable.

export const ContentSourceKindSchema = z.enum(['submodule', 'remote-git'])
export type ContentSourceKind = z.infer<typeof ContentSourceKindSchema>

export const ContentSourceConfigSchema = z.object({
  kind: ContentSourceKindSchema,
  repo: z.string(),
  branch: z.string(),
  /** Never store the token itself here. */
  hasToken: z.boolean(),
  folders: z.array(z.string()),
  /** When true, an unreachable source fails the build rather than shipping empty. */
  failClosed: z.boolean(),
})
export type ContentSourceConfig = z.infer<typeof ContentSourceConfigSchema>

export const DEFAULT_CONTENT_REPO = 'ShallowRed/nuxt-slides-content'
export const DEFAULT_CONTENT_BRANCH = 'main'
export const DEFAULT_CONTENT_FOLDERS = ['public', 'draft', 'private', 'semi-private']

// failClosed is true on CI: a missing token or unreachable clone fails the build
// rather than deploying a deck-less site.
export function readContentSourceConfig(env: NodeJS.ProcessEnv = process.env): ContentSourceConfig {
  const hasToken = Boolean(env.PRESENTATIONS_REPO_TOKEN)
  const isCI = Boolean(env.CI)
  const folders = env.PRESENTATIONS_FOLDERS
    ? env.PRESENTATIONS_FOLDERS.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_CONTENT_FOLDERS

  return ContentSourceConfigSchema.parse({
    kind: isCI ? 'remote-git' : 'submodule',
    repo: env.PRESENTATIONS_REPO || DEFAULT_CONTENT_REPO,
    branch: env.PRESENTATIONS_BRANCH || DEFAULT_CONTENT_BRANCH,
    hasToken,
    folders,
    failClosed: isCI,
  })
}

export type FetchAction
  = | { action: 'skip', reason: string }
    | { action: 'clone', repo: string, branch: string }
    | { action: 'fail', reason: string }

export function decideFetchAction(
  config: ContentSourceConfig,
  alreadyPopulated: boolean,
): FetchAction {
  if (alreadyPopulated)
    return { action: 'skip', reason: 'content already initialized' }

  if (!config.hasToken) {
    return config.failClosed
      ? { action: 'fail', reason: 'no PRESENTATIONS_REPO_TOKEN on CI — refusing to build an empty site' }
      : { action: 'skip', reason: 'no token — run: git submodule update --init' }
  }

  return { action: 'clone', repo: config.repo, branch: config.branch }
}

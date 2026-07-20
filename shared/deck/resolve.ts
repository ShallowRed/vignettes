import type { DeckMeta } from './schema'
import { KNOWN_THEMES } from '../theme/tokens'
import { splitFrontmatter, stringifyDocument } from './frontmatter'
import { parseDeckMeta } from './schema'

/**
 * The single deck resolver. Pure: takes already-fetched raw markdown (I/O lives
 * behind the `ContentSource` port in the handlers) and returns one validated
 * answer to "what is the config of this deck?". The markdown is the only truth —
 * frontmatter for the config, the rest for the body.
 */
export interface ResolveDeckInput {
  /** Raw stub markdown; frontmatter authoritative for theme/access/storybook. */
  stub?: string
  /** Throw on invalid frontmatter instead of warning (tests/tooling). */
  strict?: boolean
  label?: string
}

export interface DeckProvenance {
  bodyFrom: 'stub' | 'none'
  /** Contributing layers, e.g. `['stub']`. */
  layers: string[]
  /** Non-fatal diagnostics (e.g. an unknown theme name). */
  warnings: string[]
}

export interface ResolvedDeck {
  meta: DeckMeta
  /** Slide body, frontmatter stripped. */
  body: string
  /** Full document (frontmatter + body) for the API/wire contract. */
  content: string
  provenance: DeckProvenance
}

export function resolveDeck(input: ResolveDeckInput): ResolvedDeck {
  const { stub, strict, label } = input

  const stubDoc = stub != null
    ? splitFrontmatter(stub)
    : { data: {} as Record<string, unknown>, body: '', hasFrontmatter: false }

  const layers: string[] = []
  if (stubDoc.hasFrontmatter)
    layers.push('stub')

  // Validate once, derive types, coerce numerics.
  const { meta } = parseDeckMeta({ ...stubDoc.data }, { strict, label })

  // Unknown themes are recorded, not rejected, so a CSS-only theme or a typo
  // surfaces in provenance without taking a production deck dark.
  const warnings: string[] = []
  if (typeof meta.theme === 'string' && !KNOWN_THEMES.includes(meta.theme))
    warnings.push(`unknown theme "${meta.theme}" (no tokens entry)`)

  const body = stub != null ? stubDoc.body : ''
  const bodyFrom: DeckProvenance['bodyFrom'] = stub != null ? 'stub' : 'none'

  return {
    meta,
    body,
    content: stringifyDocument(meta as Record<string, unknown>, body),
    provenance: { bodyFrom, layers, warnings },
  }
}

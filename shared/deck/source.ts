import type { NoteSource } from './schema'

/**
 * Framework-agnostic port for obtaining a deck's raw markdown (local storage,
 * CodiMD, HackMD, …). Server provides concrete adapters; tests use in-memory fakes.
 */
export interface ContentSource {
  readonly id: NoteSource | 'file'
  /** Load raw markdown for a ref (slug/alias/noteId), or `null` if unreachable. Caching is internal. */
  load: (ref: string) => Promise<{ raw: string } | null>
}

/** Sources keyed by id, injected into server orchestration. */
export type ContentSources = Partial<Record<ContentSource['id'], ContentSource>>

/**
 * Content writer port.
 *
 * The symmetric counterpart of {@link ContentSource}: a single interface for
 * persisting a deck's raw markdown back to its source. The integrated editor
 * (and the "live local" replacement for CodiMD) writes through this port so the
 * markdown stays the source of truth and `resolveDeck` keeps reading exactly what
 * was authored — no second format, no second parser.
 *
 * Like the read port it lives in the framework-agnostic core; the server provides
 * the concrete adapter (e.g. `useStorage` over `presentations/`), and tests use
 * in-memory fakes.
 */
export interface ContentWriter {
  /** Stable identifier of the writable target. */
  readonly id: 'file' | 'db'
  /**
   * Whether the backing currently accepts writes. Callers gate editing features
   * on this instead of probing infrastructure themselves; adapters answer from
   * their own backing (e.g. baked build assets are read-only).
   */
  isWritable: () => boolean
  /**
   * Persist the full markdown document for a deck slug. Returns the result so a
   * caller can confirm where it landed. Throws on failure rather than silently
   * dropping (a lost edit is worse than a visible error).
   */
  save: (input: DeckWriteInput) => Promise<DeckWriteResult>
}

/** What to write — validated by `prepareDeckWrite`. */
export interface DeckWriteInput {
  /** Deck slug (filename without `.md`). */
  slug: string
  /** The full markdown document (frontmatter + body) to persist. */
  raw: string
}

export interface DeckWriteResult {
  /** Storage key / relative path the markdown was written to. */
  key: string
  /** Bytes written. */
  bytes: number
}

/** A slug is a single path segment: letters, digits, `-`, `_` (no `/`, no `..`). */
const SLUG_RE = /^[a-z0-9][\w-]*$/i

/** A valid deck slug — also the collab document-name convention. */
export function isDeckSlug(name: string): boolean {
  return typeof name === 'string' && SLUG_RE.test(name)
}

export interface PreparedDeckWrite {
  /** Validated slug. */
  slug: string
  /** Default storage key `"<slug>.md"` (flat layout; adapters may write to the deck's existing key). */
  key: string
  /** The markdown to persist (unchanged; kept for a single object to pass on). */
  raw: string
}

/**
 * Validate a write request and derive its default storage key — pure, so the
 * safety checks (no traversal, non-empty) are testable without touching storage.
 * Throws a descriptive error so the adapter never writes outside `presentations/`.
 * Status lives in the frontmatter of `raw`, not in the path.
 */
export function prepareDeckWrite(input: DeckWriteInput): PreparedDeckWrite {
  const { slug, raw } = input

  if (!isDeckSlug(slug))
    throw new Error(`Invalid slug "${slug}" — must match ${SLUG_RE} (single path segment, no slashes)`)

  if (typeof raw !== 'string' || raw.length === 0)
    throw new Error('Refusing to write empty markdown (a blank save would wipe the deck)')

  return { slug, key: `${slug}.md`, raw }
}

/**
 * Framework-agnostic port for obtaining a deck's raw markdown (published database
 * version, committed file, …). Server provides concrete adapters; tests use
 * in-memory fakes.
 */
export interface ContentSource {
  readonly id: 'file' | 'db'
  /** Load raw markdown for a ref (slug), or `null` if unreachable. Caching is internal. */
  load: (ref: string) => Promise<{ raw: string } | null>
}

/** Sources keyed by id, injected into server orchestration. */
export type ContentSources = Partial<Record<ContentSource['id'], ContentSource>>

/**
 * Persists a deck's raw markdown back to its source. The editor writes through
 * this port, so the markdown stays what `resolveDeck` reads back.
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

/**
 * Draft store port: the live collaborative state of a deck as an opaque Y.Doc
 * binary. Deliberately distinct from {@link ContentWriter} — a draft is CRDT
 * transport state, not published markdown; publishing derives markdown from it
 * as an explicit act. Adapters must treat the bytes as opaque.
 */
export interface DraftStore {
  /** Whether drafts can currently be persisted (gates collab sessions). */
  isWritable: () => boolean
  load: (slug: string) => Promise<Uint8Array | null>
  save: (slug: string, ydoc: Uint8Array) => Promise<void>
  /**
   * Last-save stamp (epoch ms), null when no draft exists. Solo saves send the
   * stamp they loaded so the server can refuse to overwrite a draft someone
   * else saved in between, instead of silently losing their work.
   */
  stamp: (slug: string) => Promise<number | null>
}

/** What to write — validated by `prepareDeckWrite`. */
export interface DeckWriteInput {
  /** Deck slug (filename without `.md`). */
  slug: string
  /** The full markdown document (frontmatter + body) to persist. */
  raw: string
  /** Who performs the write; writers that keep provenance record it. */
  actor?: string
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
 * Validate a write request and derive its storage key. Throws when the slug
 * could escape the content directory, or when the markdown is empty.
 */
export function prepareDeckWrite(input: DeckWriteInput): PreparedDeckWrite {
  const { slug, raw } = input

  if (!isDeckSlug(slug))
    throw new Error(`Invalid slug "${slug}" — must match ${SLUG_RE} (single path segment, no slashes)`)

  if (typeof raw !== 'string' || raw.length === 0)
    throw new Error('Refusing to write empty markdown (a blank save would wipe the deck)')

  return { slug, key: `${slug}.md`, raw }
}

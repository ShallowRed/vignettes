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
  /** Stable identifier of the writable target (only `file` for now). */
  readonly id: 'file'
  /**
   * Persist raw markdown for a deck `ref` (slug) under an access folder. Returns
   * the result so a caller can confirm where it landed. Throws on failure rather
   * than silently dropping (a lost edit is worse than a visible error).
   */
  save: (input: DeckWriteInput) => Promise<DeckWriteResult>
}

/** Where and what to write — validated/derived by `prepareDeckWrite`. */
export interface DeckWriteInput {
  /** Deck slug (filename without `.md`). */
  slug: string
  /** Access folder the deck lives under. */
  access: string
  /** The full markdown document (frontmatter + body) to persist. */
  raw: string
}

export interface DeckWriteResult {
  /** Storage key / relative path the markdown was written to. */
  key: string
  /** Bytes written. */
  bytes: number
}

/** The access folders a deck may be written to (mirrors the read side). */
export const WRITABLE_ACCESS_FOLDERS = ['public', 'draft', 'private', 'semi-private'] as const
export type WritableAccess = typeof WRITABLE_ACCESS_FOLDERS[number]

/** A slug is a single path segment: letters, digits, `-`, `_` (no `/`, no `..`). */
const SLUG_RE = /^[a-z0-9][\w-]*$/i

export interface PreparedDeckWrite {
  /** Validated access folder. */
  access: WritableAccess
  /** Validated slug. */
  slug: string
  /** The Nitro storage key `"<access>:<slug>.md"` (also the relative path). */
  key: string
  /** The markdown to persist (unchanged; kept for a single object to pass on). */
  raw: string
}

/**
 * Validate a write request and derive its storage key — pure, so the path
 * convention and the safety checks (no traversal, known folder, non-empty) are
 * testable without touching storage. Throws a descriptive error on invalid input
 * so the adapter never writes outside `presentations/<access>/`.
 */
export function prepareDeckWrite(input: DeckWriteInput): PreparedDeckWrite {
  const { slug, access, raw } = input

  if (!WRITABLE_ACCESS_FOLDERS.includes(access as WritableAccess))
    throw new Error(`Invalid access folder "${access}" (expected one of ${WRITABLE_ACCESS_FOLDERS.join(', ')})`)

  if (typeof slug !== 'string' || !SLUG_RE.test(slug))
    throw new Error(`Invalid slug "${slug}" — must match ${SLUG_RE} (single path segment, no slashes)`)

  if (typeof raw !== 'string' || raw.length === 0)
    throw new Error('Refusing to write empty markdown (a blank save would wipe the deck)')

  return {
    access: access as WritableAccess,
    slug,
    key: `${access}:${slug}.md`,
    raw,
  }
}

/**
 * Wire contract of a deck's history: the versions published so far, newest
 * first. Read by `GET /api/presentations/:slug/versions` and the history panel
 * of the editor.
 */
export interface DeckVersionSummary {
  id: number
  /** Publication time, in milliseconds. */
  publishedAt: number
  /** Login of the account that published. */
  publishedBy: string
  /** Size of the markdown, in bytes. */
  bytes: number
  /** True for the version the visitors see. */
  current: boolean
}

/** One version with its markdown, from `GET /api/presentations/:slug/versions/:id`. */
export interface DeckVersionDetail extends DeckVersionSummary {
  raw: string
}

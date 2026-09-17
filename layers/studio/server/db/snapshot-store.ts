import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { Buffer } from 'node:buffer'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { deckDraftSnapshots } from './schema'

type Db = BetterSQLite3Database<Record<string, unknown>>

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A draft snapshot without its text. */
export interface DraftSnapshotSummary {
  id: number
  /** When it was taken, in milliseconds. */
  createdAt: number
  authors: string[]
  label: string | null
  /** Size of the markdown, in bytes. */
  bytes: number
}

export interface DraftSnapshot extends DraftSnapshotSummary {
  raw: string
}

export interface SnapshotInput {
  raw: string
  authors: string[]
  label?: string | null
  at?: Date
}

/**
 * The snapshots to prune, oldest work first: a labelled snapshot is kept; the
 * last day is kept whole; then one snapshot per hour for a month; then one per
 * day. Within a bucket the most recent one stays.
 */
export function snapshotsToDrop(rows: { id: number, createdAt: number, label: string | null }[], now = Date.now()): number[] {
  const buckets = new Set<string>()
  const drop: number[] = []
  for (const row of [...rows].sort((a, b) => b.createdAt - a.createdAt)) {
    if (row.label)
      continue
    const age = now - row.createdAt
    if (age < DAY)
      continue
    const bucket = age < 30 * DAY ? `h${Math.floor(row.createdAt / HOUR)}` : `d${Math.floor(row.createdAt / DAY)}`
    if (buckets.has(bucket))
      drop.push(row.id)
    else
      buckets.add(bucket)
  }
  return drop
}

/** SQLite adapter for the draft snapshots of a deck. */
export function createSnapshotStore(db: Db) {
  function summary(row: typeof deckDraftSnapshots.$inferSelect): DraftSnapshotSummary {
    return { id: row.id, createdAt: row.createdAt.getTime(), authors: row.authors, label: row.label, bytes: Buffer.byteLength(row.raw) }
  }

  return {
    /** The most recent snapshot, with its text, to tell whether the draft moved. */
    async latest(slug: string): Promise<DraftSnapshot | null> {
      const row = db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id)).get()
      return row ? { ...summary(row), raw: row.raw } : null
    },

    /** Insert a snapshot, then prune the deck's older ones. Returns the new id. */
    async add(slug: string, input: SnapshotInput): Promise<number> {
      const now = input.at ?? new Date()
      return db.transaction((tx) => {
        const { id } = tx.insert(deckDraftSnapshots)
          .values({ deckSlug: slug, raw: input.raw, authors: input.authors, label: input.label ?? null, createdAt: now })
          .returning({ id: deckDraftSnapshots.id })
          .get()!
        const rows = tx.select({ id: deckDraftSnapshots.id, createdAt: deckDraftSnapshots.createdAt, label: deckDraftSnapshots.label })
          .from(deckDraftSnapshots)
          .where(eq(deckDraftSnapshots.deckSlug, slug))
          .all()
        const drop = snapshotsToDrop(rows.map(row => ({ ...row, createdAt: row.createdAt.getTime() })), now.getTime())
        if (drop.length)
          tx.delete(deckDraftSnapshots).where(inArray(deckDraftSnapshots.id, drop)).run()
        return id
      })
    },

    async list(slug: string): Promise<DraftSnapshotSummary[]> {
      return db.select().from(deckDraftSnapshots).where(eq(deckDraftSnapshots.deckSlug, slug)).orderBy(desc(deckDraftSnapshots.id)).all().map(summary)
    },

    /** Null when the snapshot does not exist or belongs to another deck. */
    async load(slug: string, id: number): Promise<DraftSnapshot | null> {
      const row = db.select().from(deckDraftSnapshots).where(and(eq(deckDraftSnapshots.deckSlug, slug), eq(deckDraftSnapshots.id, id))).get()
      return row ? { ...summary(row), raw: row.raw } : null
    },
  }
}

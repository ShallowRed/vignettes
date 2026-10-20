const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Labelled snapshots kept per deck; the oldest go beyond that. */
export const MAX_LABELLED_SNAPSHOTS = 100
/** Snapshots of the last day kept per deck, whatever their pace. */
export const MAX_RECENT_SNAPSHOTS = 200

/**
 * The snapshots to prune, oldest work first: a labelled snapshot is kept, up
 * to MAX_LABELLED_SNAPSHOTS; the last day is kept whole, up to
 * MAX_RECENT_SNAPSHOTS; then one snapshot per hour for a month; then one per
 * day. Within a bucket the most recent one stays.
 */
export function snapshotsToDrop(rows: { id: number, createdAt: number, label: string | null }[], now = Date.now()): number[] {
  const buckets = new Set<string>()
  const drop: number[] = []
  let labelled = 0
  let recent = 0
  for (const row of [...rows].sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)) {
    if (row.label) {
      if (++labelled > MAX_LABELLED_SNAPSHOTS)
        drop.push(row.id)
      continue
    }
    const age = now - row.createdAt
    if (age < DAY) {
      if (++recent > MAX_RECENT_SNAPSHOTS)
        drop.push(row.id)
      continue
    }
    const bucket = age < 30 * DAY ? `h${Math.floor(row.createdAt / HOUR)}` : `d${Math.floor(row.createdAt / DAY)}`
    if (buckets.has(bucket))
      drop.push(row.id)
    else
      buckets.add(bucket)
  }
  return drop
}

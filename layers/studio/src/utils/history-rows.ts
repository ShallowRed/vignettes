import type { DraftSnapshotEntry, HistoryEntry } from '#shared/presentations'

/**
 * A row of the history list: an entry, or a run of unnamed snapshots shown
 * folded between two landmarks (a published version, a named snapshot). A run
 * keeps the key of its oldest snapshot as newer ones join it.
 */
export type HistoryRow
  = | { kind: 'entry', entry: HistoryEntry }
    | { kind: 'unnamed', key: string, entries: DraftSnapshotEntry[] }

const unnamed = (entry: HistoryEntry): entry is DraftSnapshotEntry => entry.kind === 'snapshot' && !entry.label

/** The rows of `entries`, in their order; a lone unnamed snapshot stays an entry. */
export function historyRows(entries: HistoryEntry[]): HistoryRow[] {
  const rows: HistoryRow[] = []
  let run: DraftSnapshotEntry[] = []
  const flush = () => {
    if (run.length > 1)
      rows.push({ kind: 'unnamed', key: `unnamed-${run.at(-1)!.id}`, entries: run })
    else if (run.length === 1)
      rows.push({ kind: 'entry', entry: run[0]! })
    run = []
  }
  for (const entry of entries) {
    if (unnamed(entry)) {
      run.push(entry)
      continue
    }
    flush()
    rows.push({ kind: 'entry', entry })
  }
  flush()
  return rows
}

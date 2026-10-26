import { describe, expect, it } from 'vitest'
import { historyRows } from '../../layers/studio/src/utils/history-rows'
import { historySnapshot as snapshot, historyVersion as version } from './helpers/fixtures'

describe('historyRows', () => {
  it('folds the runs of unnamed snapshots between the versions and the named snapshots, a lone one staying an entry', () => {
    const rows = historyRows([snapshot(9), snapshot(8), snapshot(7, 7, 'Before the review'), snapshot(6), version(5), snapshot(4), snapshot(3), snapshot(2)])
    expect(rows.map(r => r.kind === 'entry' ? `${r.entry.kind}${r.entry.id}` : `${r.key}:${r.entries.length}`))
      .toEqual(['unnamed-8:2', 'snapshot7', 'snapshot6', 'version5', 'unnamed-2:3'])
  })
})

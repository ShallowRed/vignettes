import { describe, expect, it } from 'vitest'
import { compareHistoryEntries } from '../../layers/studio/shared/presentations/history'
import { historySnapshot as snapshot, historyVersion as version } from './helpers/fixtures'

describe('compareHistoryEntries', () => {
  it('orders newest first, the snapshot before the version of the same second, then by id', () => {
    const entries = [version(1, 1000), snapshot(1, 1000), version(2, 1000), snapshot(2, 2000), snapshot(3, 500)]
    expect([...entries].sort(compareHistoryEntries).map(e => `${e.kind}${e.id}@${e.at}`))
      .toEqual(['snapshot2@2000', 'snapshot1@1000', 'version2@1000', 'version1@1000', 'snapshot3@500'])
  })
})

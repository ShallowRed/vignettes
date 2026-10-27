import { describe, expect, it } from 'vitest'
import { awarenessPeers } from '../../layers/studio/src/utils/editor-peers'

const user = (name: string, login?: string) => ({ user: { name, color: '#4363d8', login } })

describe('awarenessPeers', () => {
  it('lists an account open in several tabs once, and marks the account of this tab', () => {
    const states = new Map([[1, user('Lucas', 'lucas')], [2, user('Lucas', 'lucas')], [3, user('Lucas', 'lucas')], [4, user('Alice', 'alice')]])
    expect(awarenessPeers(states, 1, 'lucas')).toEqual([
      { key: 'lucas', name: 'Lucas', color: '#4363d8', self: true },
      { key: 'alice', name: 'Alice', color: '#4363d8', self: false },
    ])
  })

  it('counts each tab without an account as a person', () => {
    const states = new Map([[1, user('Anonyme')], [2, user('Anonyme')], [3, user('Anonyme')]])
    expect(awarenessPeers(states, 1).map(peer => [peer.key, peer.self])).toEqual([['client-2', false], ['client-3', false]])
  })
})

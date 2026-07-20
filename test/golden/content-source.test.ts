import type { ContentSource } from '../../shared/deck'
import { describe, expect, it } from 'vitest'
import { resolveDeck } from '../../shared/deck'

function fakeSource(map: Record<string, string>): ContentSource {
  return {
    id: 'db',
    load: async ref => (ref in map ? { raw: map[ref]! } : null),
  }
}

describe('content source port + resolveDeck (injectable, I/O-free)', () => {
  const deck = '---\ntheme: dsfr\nstorybook: http://localhost:6007\naccess: public\n---\n\n# Body'
  const source = fakeSource({ 'my-deck': deck })

  it('returns null for an unknown ref (fail-closed friendly)', async () => {
    expect(await source.load('missing')).toBeNull()
  })

  it('feeds resolveDeck, which reads the loaded markdown as the only truth', async () => {
    const raw = (await source.load('my-deck'))!.raw
    const resolved = resolveDeck({ stub: raw })

    expect(resolved.body).toBe('\n# Body')
    expect(resolved.meta.theme).toBe('dsfr')
    expect(resolved.meta.storybook).toBe('http://localhost:6007')
    expect(resolved.meta.access).toBe('public')
  })
})

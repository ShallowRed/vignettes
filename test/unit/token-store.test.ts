import type { TokenInput } from '../../layers/studio/server/db/ports'
import { describe, expect, it } from 'vitest'
import { ADAPTERS, seedUser, useAdapter } from './helpers/adapters'

const DAY = 86_400_000
const at = new Date(Date.UTC(2026, 9, 21, 12))
const later = (days: number) => new Date(at.getTime() + days * DAY)

let next = 0
/** A token input with a distinct hash, as the server derives it from a fresh secret. */
function input(over: Partial<TokenInput> = {}): TokenInput {
  next += 1
  return { name: `token ${next}`, scope: 'write', tokenHash: `hash-${next}`, prefix: `vgt_${String(next).padStart(8, '0')}`, expiresAt: later(90), ...over }
}

describe.each(ADAPTERS)('token store ($name)', (adapter) => {
  const db = useAdapter(adapter)
  const store = () => db.stores.tokens
  const seed = async () => {
    await seedUser(db.rows, 1, 'alice')
    await seedUser(db.rows, 2, 'bob')
  }

  it('creates a token and finds it by its hash, with its account', async () => {
    await seed()
    await db.stores.users.setRole(1, 'editor')
    const created = await store().create(1, input({ name: 'CLI MacBook', tokenHash: 'abc' }), at)
    expect(created).toEqual({
      id: created.id,
      userId: 1,
      name: 'CLI MacBook',
      prefix: expect.stringMatching(/^vgt_/),
      scope: 'write',
      createdAt: at,
      expiresAt: later(90),
      lastUsedAt: null,
      revokedAt: null,
    })
    expect(created).not.toHaveProperty('tokenHash')
    await expect(store().findByHash('abc')).resolves.toEqual({ ...created, tokenHash: 'abc', holder: { login: 'alice', role: 'editor' } })
    await expect(store().findByHash('other')).resolves.toBeNull()
  })

  it('refuses two tokens with one hash', async () => {
    await seed()
    await store().create(1, input({ tokenHash: 'same' }), at)
    await expect(store().create(2, input({ tokenHash: 'same' }), at)).rejects.toThrow()
  })

  it('refuses a token for an unknown account', async () => {
    await expect(store().create(404, input(), at)).rejects.toThrow()
  })

  it('lists the tokens of one account, newest first', async () => {
    await seed()
    const first = await store().create(1, input(), at)
    const second = await store().create(1, input(), at)
    await store().create(2, input(), at)
    expect((await store().listForUser(1)).map(token => token.id)).toEqual([second.id, first.id])
  })

  it('reads an invalid stored scope as read', async () => {
    await seed()
    const token = await store().create(1, input(), at)
    await db.rows.update('personalTokens', { scope: 'admin' }, { id: token.id })
    expect((await store().listForUser(1))[0]!.scope).toBe('read')
  })

  it('revokes a token of its account once, and never a token of another account', async () => {
    await seed()
    const token = await store().create(1, input(), at)
    await expect(store().revoke(token.id, 2, at)).resolves.toBe(false)
    await expect(store().revoke(token.id, 1, later(1))).resolves.toBe(true)
    await expect(store().revoke(token.id, 1, later(2))).resolves.toBe(false)
    expect((await store().listForUser(1))[0]!.revokedAt).toEqual(later(1))
  })

  it('revokes every active token of an account', async () => {
    await seed()
    const revoked = await store().create(1, input(), at)
    await store().revoke(revoked.id, 1, at)
    await store().create(1, input(), at)
    await store().create(1, input(), at)
    const other = await store().create(2, input(), at)
    await expect(store().revokeAllForUser(1, later(1))).resolves.toBe(2)
    expect((await store().listForUser(1)).map(token => token.revokedAt)).toEqual([later(1), later(1), at])
    expect((await store().listForUser(2))[0]).toMatchObject({ id: other.id, revokedAt: null })
  })

  it('removes a revoked or expired token, and keeps an active one', async () => {
    await seed()
    const active = await store().create(1, input(), at)
    const revoked = await store().create(1, input(), at)
    const expired = await store().create(1, input({ expiresAt: later(30) }), at)
    await store().revoke(revoked.id, 1, at)
    await expect(store().remove(active.id, 1, later(31))).resolves.toBe(false)
    await expect(store().remove(revoked.id, 2, later(31))).resolves.toBe(false)
    await expect(store().remove(revoked.id, 1, later(31))).resolves.toBe(true)
    await expect(store().remove(expired.id, 1, later(31))).resolves.toBe(true)
    expect((await store().listForUser(1)).map(token => token.id)).toEqual([active.id])
  })

  it('records the last use', async () => {
    await seed()
    const token = await store().create(1, input(), at)
    await store().touch(token.id, later(1))
    expect((await store().listForUser(1))[0]!.lastUsedAt).toEqual(later(1))
  })

  it('counts the active tokens of each account', async () => {
    await seed()
    await store().create(1, input(), at)
    await store().create(1, input(), at)
    await store().create(1, input({ expiresAt: later(30) }), at)
    const revoked = await store().create(2, input(), at)
    await store().revoke(revoked.id, 2, at)
    expect(await store().activeCounts(later(31))).toEqual(new Map([[1, 2]]))
  })

  it('deletes the tokens of a removed account', async () => {
    await seed()
    await store().create(1, input(), at)
    await store().create(2, input(), at)
    await expect(db.stores.users.remove(1)).resolves.toBe(true)
    expect(await db.rows.select('personalTokens', { userId: 1 })).toEqual([])
    expect(await db.rows.select('personalTokens', { userId: 2 })).toHaveLength(1)
  })
})

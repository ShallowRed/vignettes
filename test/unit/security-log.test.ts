import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unlockDeck } from '../../layers/studio/server/utils/access'
import { hitRateLimit, resetRateLimits } from '../../layers/studio/server/utils/rate-limit'
import { useDeckMeta } from '../../layers/studio/server/utils/sources'
import { anon, asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'security-log-password-with-32-characters'

const { default: logout } = await import('../../layers/studio/server/routes/auth/logout')
const { default: changeRole } = await import('../../layers/studio/server/api/admin/users/[id].patch')
const { default: removeUser } = await import('../../layers/studio/server/api/admin/users/[id].delete')
const { default: setGrant } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions/[userId].put')
const { default: removeGrant } = await import('../../layers/studio/server/api/admin/decks/[slug]/permissions/[userId].delete')
const { default: setFolderGrant } = await import('../../layers/studio/server/api/admin/projects/[slug]/permissions/[userId].put')
const { default: patchDeck } = await import('../../layers/studio/server/api/admin/decks/[slug].patch')

let lines: string[]
beforeEach(async () => {
  resetRateLimits()
  lines = []
  vi.spyOn(console, 'info').mockImplementation((line: string) => {
    lines.push(line)
  })
  await seedAccount(1, 'boss', 'owner')
  await seedAccount(2, 'alice', 'editor')
  await useDeckMeta().update('deck', { title: 'Deck' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const boss = (over: Record<string, unknown> = {}) => asUser(1, 'boss', { ip: '203.0.113.7', ...over })

describe('the security log', () => {
  it('writes a line for a logout, a role change and the removal of an account', async () => {
    await changeRole(boss({ params: { id: '2' }, body: { role: 'viewer' } }))
    await removeUser(boss({ params: { id: '2' } }))
    await logout(boss({ method: 'POST' }))
    expect(lines).toEqual([
      '[security] role-change account=2 role=viewer by boss from 203.0.113.7',
      '[security] account-removal account=2 by boss from 203.0.113.7',
      '[security] logout account=1 by boss from 203.0.113.7',
    ])
  })

  it('writes a line for a grant given and taken back, on a deck and on a folder', async () => {
    await setGrant(boss({ params: { slug: 'deck', userId: '2' }, body: { role: 'editor', expiresAt: '2027-01-01T00:00:00.000Z' } }))
    await removeGrant(boss({ params: { slug: 'deck', userId: '2' } }))
    await setFolderGrant(boss({ params: { slug: 'atelier', userId: '2' }, body: { role: 'viewer' } }))
    expect(lines).toEqual([
      '[security] grant-change deck=deck account=2 role=editor until=2027-01-01T00:00:00.000Z by boss from 203.0.113.7',
      '[security] grant-change deck=deck account=2 role=none by boss from 203.0.113.7',
      '[security] grant-change folder=atelier account=2 role=viewer by boss from 203.0.113.7',
    ])
  })

  it('writes the change of a deck password and the lockout of a client, never the password', async () => {
    await patchDeck(boss({ params: { slug: 'deck' }, body: { status: 'semi-private', accessPassword: 'open-sesame' } }))
    const gate = { slug: 'deck', status: 'semi-private' as const, storedHash: `${'0'.repeat(32)}:${'0'.repeat(128)}` }
    for (let i = 0; i < 10; i++)
      hitRateLimit('unlock:198.51.100.4:deck', 10, 60_000)
    await expect(unlockDeck(anon({ ip: '198.51.100.4', body: { password: 'guess-1234' } }), gate)).rejects.toMatchObject({ statusCode: 429 })
    expect(lines).toEqual([
      '[security] deck-password-change deck=deck password=set by boss from 203.0.113.7',
      '[security] deck-password-lockout deck=deck by anonymous from 198.51.100.4',
    ])
    expect(lines.join('\n')).not.toMatch(/open-sesame|guess-1234/)
  })
})

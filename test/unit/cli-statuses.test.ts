import type { DeckOutcome, DeckRoute, FailedAnswer } from '../../packages/cli/src/push-plan.ts'
import { describe, expect, it } from 'vitest'
import { EXIT_CODES } from '../../packages/cli/src/output.ts'
import { ACTION_EXIT_CODES, deckOutcome, digestOutcome, outcomeExit, TOO_MANY_INVALID_TOKENS, TOO_MANY_TOKEN_REQUESTS } from '../../packages/cli/src/push-plan.ts'

const ROUTES: DeckRoute[] = ['read', 'projects', 'create', 'reread', 'image', 'save', 'publish']

const status = (code: number, over: Partial<Extract<FailedAnswer, { kind: 'status' }>> = {}): FailedAnswer => ({ kind: 'status', status: code, statusMessage: 'Refused', ...over })

const stopped = (code: Extract<DeckOutcome, { action: 'stopped' }>['code']): DeckOutcome => ({ action: 'stopped', code })

/** The outcome of each answer on each route of a deck. */
function expected(route: DeckRoute, name: string): DeckOutcome {
  switch (name) {
    case '301':
    case '302':
      return stopped('instance-redirect')
    case '400':
      return { action: 'refused', problem: 'instance-refused' }
    case '401':
      return stopped('token-refused')
    case '401 asking for a password':
      return { action: 'forbidden', reason: 'password' }
    case '403':
      return { action: 'forbidden', reason: 'refused' }
    case '404':
      return route === 'read' ? { action: 'absent' } : { action: 'forbidden', reason: 'refused' }
    case '409 with data.conflict':
      return route === 'create' ? { action: 'exists' } : { action: 'conflict' }
    case '409':
      return route === 'create' ? { action: 'exists' } : route === 'save' ? { action: 'live-session' } : { action: 'conflict' }
    case '413':
      return { action: 'refused', problem: route === 'image' ? 'image-refused' : 'deck-body-too-large' }
    case '415':
      return route === 'image' ? { action: 'refused', problem: 'image-refused' } : stopped('instance-error')
    case '429 of the requests of a token':
      return stopped('too-many-token-requests')
    case '429 of the refused tokens':
      return stopped('too-many-invalid-tokens')
    case 'a network error':
      return stopped('instance-unreachable')
    case 'a body outside its schema':
      return stopped('instance-answer')
    default:
      return stopped('instance-error')
  }
}

const ANSWERS: [string, FailedAnswer][] = [
  ['301', status(301)],
  ['302', status(302)],
  ['400', status(400)],
  ['401', status(401)],
  ['401 asking for a password', status(401, { data: { requiresPassword: true } })],
  ['403', status(403)],
  ['404', status(404)],
  ['409 with data.conflict', status(409, { data: { conflict: true } })],
  ['409', status(409)],
  ['411', status(411)],
  ['413', status(413)],
  ['415', status(415)],
  ['418, outside the table', status(418)],
  ['429 of the requests of a token', status(429, { statusMessage: TOO_MANY_TOKEN_REQUESTS })],
  ['429 of the refused tokens', status(429, { statusMessage: TOO_MANY_INVALID_TOKENS })],
  ['429 of another message', status(429)],
  ['500', status(500)],
  ['502', status(502)],
  ['503', status(503)],
  ['a network error', { kind: 'unreachable' }],
  ['a body outside its schema', { kind: 'unreadable' }],
]

describe('the answers of the routes of a deck (packages/cli/src/push-plan.ts)', () => {
  it.each(ROUTES.flatMap(route => ANSWERS.map(([name, answer]) => [route, name, answer] as const)))('gives the %s route its outcome for %s', (route, name, answer) => {
    expect(deckOutcome(route, answer)).toEqual(expected(route, name))
  })

  it('lets the next decks go after the codes 1, 4 and 5, and stops the command after the codes 3 and 6', () => {
    const exits = ANSWERS.flatMap(([, answer]) => ROUTES.map(route => deckOutcome(route, answer)))
      .flatMap(outcome => outcome.action === 'absent' ? [] : [outcomeExit(outcome)])
    for (const { exit, stops } of exits)
      expect(stops).toBe(exit === EXIT_CODES.authentication || exit === EXIT_CODES.instance)
    expect(new Set(exits.map(({ exit }) => exit))).toEqual(new Set([1, 3, 4, 5, 6]))
    expect(outcomeExit({ action: 'refused', problem: 'instance-refused' })).toEqual({ exit: EXIT_CODES.deckError, stops: false })
    expect(outcomeExit({ action: 'exists' })).toEqual({ exit: EXIT_CODES.conflict, stops: false })
    expect(outcomeExit(stopped('too-many-invalid-tokens'))).toEqual({ exit: EXIT_CODES.authentication, stops: true })
  })

  it('refuses a draft push did not send and an unfinished creation with the code 5, and gives each action its code', () => {
    expect(ACTION_EXIT_CODES).toEqual({
      'create': 0,
      'publish': 0,
      'created': 0,
      'published': 0,
      'identical': 0,
      'unpublished-draft': 5,
      'creation-unfinished': 5,
      'live-session': 5,
      'conflict': 5,
      'exists': 5,
      'digest-unchecked': 6,
      'forbidden': 4,
      'refused': 1,
      'stopped': 6,
      'skipped': 0,
    })
  })

  it('reads a 404 of the first read as an absent deck, then a 409 of the creation as a taken slug', () => {
    expect(deckOutcome('read', status(404))).toEqual({ action: 'absent' })
    expect(deckOutcome('create', status(409))).toEqual({ action: 'exists' })
    expect(deckOutcome('reread', status(404))).toEqual({ action: 'forbidden', reason: 'refused' })
  })

  it('stops on a save or a publication whose answer does not repeat the digest sent', () => {
    const digest = 'a'.repeat(64)
    expect(digestOutcome(digest, digest)).toBeNull()
    expect(digestOutcome(null, null)).toBeNull()
    for (const answered of [undefined, 'b'.repeat(64), null])
      expect(digestOutcome(digest, answered)).toEqual(stopped('digest-unchecked'))
    expect(digestOutcome(null, undefined)).toEqual(stopped('digest-unchecked'))
    expect(outcomeExit(stopped('digest-unchecked'))).toEqual({ exit: EXIT_CODES.instance, stops: true })
  })
})

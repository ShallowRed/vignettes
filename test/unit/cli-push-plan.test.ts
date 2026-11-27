import type { PlannedAction, RemoteCase, RemoteDraft } from '../../packages/cli/src/push-plan.ts'
import { creationDraft, stringifyDocument } from '@vignettes/core/deck'
import { describe, expect, it } from 'vitest'
import { ACTIONS, classifyRemote, planDeck, plannedWrites, planWarnings, requestBudget, unknownUploads } from '../../packages/cli/src/push-plan.ts'
import { planRemoteRepublish } from '../../scripts/lib/remote-republish.ts'

const SENT = '---\ntitle: Talk\nstatus: public\n---\n\n# One\n\n![a](/media/0123456789abcdef0123456789abcdef.png)\n'
const FOREIGN = '---\ntitle: Talk\n---\n\n# Someone else\n'
const PUBLISHED = '---\ntitle: Talk\n---\n\n# Published\n'

const draft = (over: Partial<RemoteDraft>): RemoteDraft => ({ content: PUBLISHED, from: 'draft', stamp: 1, publishedRaw: PUBLISHED, publishedVersion: 3, ...over })

// Each remote state, with the case `classifyRemote` gives it.
const STATES: [string, RemoteDraft | null, RemoteCase][] = [
  ['no deck (404)', null, 'absent'],
  ['a published version equal to the text', draft({ publishedRaw: SENT, content: SENT }), 'published-equal'],
  ['a published version equal to the text, under another draft', draft({ publishedRaw: SENT, content: FOREIGN }), 'published-equal'],
  ['a draft equal to the text', draft({ content: SENT, publishedRaw: null, publishedVersion: null }), 'draft-is-sent'],
  ['the draft of the creation of the text', draft({ content: creationDraft(SENT, { project: 'cli' }), publishedRaw: null, publishedVersion: null }), 'draft-is-creation'],
  ['the draft of the creation of the text, under a published version', draft({ content: creationDraft(SENT, { project: 'cli' }) }), 'foreign-draft'],
  ['a published version alone', draft({ from: 'published', stamp: null }), 'published-only'],
  ['a draft equal to the published version', draft({}), 'draft-is-published'],
  ['a draft of someone else', draft({ content: FOREIGN }), 'foreign-draft'],
]

function plan(state: RemoteDraft | null, over: { force?: boolean, privileged?: boolean, sent?: string } = {}) {
  const sent = over.sent ?? SENT
  return planDeck(classifyRemote(sent, state), { force: false, privileged: false, sent, ...over })
}

describe('the remote cases of push (packages/cli/src/push-plan.ts)', () => {
  it.each(STATES)('classes %s', (_, state, remote) => {
    expect(classifyRemote(SENT, state)).toBe(remote)
  })

  it('gives each case its action, and --force publishes over a draft of someone else alone', () => {
    expect(ACTIONS).toEqual({
      'absent': 'create',
      'published-equal': 'identical',
      'draft-is-sent': 'publish',
      'draft-is-creation': 'publish',
      'published-only': 'publish',
      'draft-is-published': 'publish',
      'foreign-draft': 'unpublished-draft',
    })
    for (const [, state, remote] of STATES)
      expect(plan(state, { force: true })).toBe(remote === 'foreign-draft' ? 'publish' : ACTIONS[remote])
  })

  it('stops a token of a global role on the draft of an unfinished creation when the text holds an access key, and lets a collaborator publish it', () => {
    const creation = (sent: string) => draft({ content: creationDraft(sent, {}), publishedRaw: null, publishedVersion: null })
    // Without the empty line under the front matter, which the creation draft adds.
    const keys = ['access: public', 'unlisted: true', 'accessPassword: x'].map(key => `---\ntitle: Talk\n${key}\n---\n# One\n`)
    for (const sent of [SENT, ...keys])
      expect(plan(creation(sent), { sent, privileged: true })).toBe('creation-unfinished')
    expect(plan(creation(SENT), { privileged: false })).toBe('publish')
    const plain = '---\ntitle: Talk\n---\n\n# One\n'
    expect(plan(creation(`${plain}\n`), { sent: `${plain}\n`, privileged: true })).toBe('publish')
  })

  it('tries the cases in order: a text that its creation draft leaves unchanged is a draft equal to the text', () => {
    const pulled = stringifyDocument({ title: 'Talk', project: 'cli' }, '# One\n')
    expect(creationDraft(pulled, { project: 'cli' })).toBe(pulled)
    expect(classifyRemote(pulled, draft({ content: pulled, publishedRaw: null, publishedVersion: null }))).toBe('draft-is-sent')
  })
})

describe('the writes of push (packages/cli/src/push-plan.ts)', () => {
  const images = ['a.png', 'b.svg']
  const writes = (remote: RemoteCase, action: PlannedAction) => plannedWrites('talk', remote, action, images).map(({ method, path }) => `${method} ${path}`)
  const uploads = ['POST /api/media?deck=talk', 'POST /api/media?deck=talk']

  it('creates, uploads each local image, saves and publishes a new deck', () => {
    expect(writes('absent', 'create')).toEqual(['POST /api/presentations', ...uploads, 'PUT /api/presentations/talk', 'POST /api/presentations/talk/publish'])
  })

  it('uploads each local image whatever the remote case, and saves unless the draft holds the text', () => {
    expect(writes('draft-is-sent', 'publish')).toEqual([...uploads, 'POST /api/presentations/talk/publish'])
    for (const remote of ['draft-is-creation', 'published-only', 'draft-is-published', 'foreign-draft'] as const)
      expect(writes(remote, 'publish')).toEqual([...uploads, 'PUT /api/presentations/talk', 'POST /api/presentations/talk/publish'])
    expect(writes('published-equal', 'identical')).toEqual(uploads)
  })

  it('writes nothing for a refusal', () => {
    expect(writes('foreign-draft', 'unpublished-draft')).toEqual([])
    expect(writes('draft-is-creation', 'creation-unfinished')).toEqual([])
  })

  it('counts two requests for the command, then five and the images of each deck', () => {
    expect(requestBudget([])).toBe(2)
    expect(requestBudget([0, 2])).toBe(2 + 5 + 7)
  })
})

describe('the warnings of the reads (packages/cli/src/push-plan.ts)', () => {
  it('names an uploaded image that no remote text cites', () => {
    expect(unknownUploads(SENT, null)).toEqual(['/media/0123456789abcdef0123456789abcdef.png'])
    expect(unknownUploads(SENT, draft({ content: SENT }))).toEqual([])
    expect(unknownUploads(SENT, draft({ publishedRaw: SENT }))).toEqual([])
  })

  it('names the published version a publication replaces, a draft left online and an ignored folder', () => {
    const codes = (state: RemoteDraft | null, action: PlannedAction, folder = false, raw = FOREIGN) =>
      planWarnings({ raw, sent: SENT, state, remote: classifyRemote(SENT, state), action, folder }).map(({ code, value }) => value ? `${code} ${value}` : code)
    expect(codes(draft({}), 'publish', true)).toEqual(['folder-ignored', 'published-replaced 3'])
    expect(codes(draft({ from: 'published' }), 'publish')).toEqual(['published-replaced 3'])
    expect(codes(draft({ publishedRaw: SENT, content: FOREIGN }), 'identical')).toEqual(['draft-online'])
    expect(codes(null, 'create', true, SENT)).toEqual(['uploaded-image-unknown /media/0123456789abcdef0123456789abcdef.png'])
  })

  it('names the published version that any publication replaces, and none where no published version differs from the text', () => {
    const replaced = (state: RemoteDraft | null, force = false) => {
      const remote = classifyRemote(SENT, state)
      const action = planDeck(remote, { force, privileged: false, sent: SENT })
      return planWarnings({ raw: SENT, sent: SENT, state, remote, action, folder: false }).filter(({ code }) => code === 'published-replaced').map(({ value }) => value)
    }
    expect(replaced(draft({ from: 'published', stamp: null }))).toEqual(['3'])
    expect(replaced(draft({}))).toEqual(['3'])
    expect(replaced(draft({ content: SENT }))).toEqual(['3'])
    expect(replaced(draft({ content: FOREIGN }), true)).toEqual(['3'])
    expect(replaced(null)).toEqual([])
    expect(replaced(draft({ content: FOREIGN }))).toEqual([])
    expect(replaced(draft({ content: SENT, publishedRaw: null, publishedVersion: null }))).toEqual([])
    expect(replaced(draft({ content: creationDraft(SENT, { project: 'cli' }), publishedRaw: null, publishedVersion: null }))).toEqual([])
    expect(replaced(draft({ content: FOREIGN, publishedRaw: null, publishedVersion: null }), true)).toEqual([])
    expect(replaced(draft({ publishedRaw: SENT, content: FOREIGN }))).toEqual([])
  })
})

// The classification of `content:republish:prod`, through a fetch that answers
// `GET …?draft` with each state: the same actions, but for the two rows where
// push publishes what the script refuses.
const SCRIPT_ACTION = { 'create': 'create', 'identical': 'identical', 'publish': 'republish', 'unpublished-draft': 'unpublished-draft' } as const

describe('the classification of scripts/lib/remote-republish.ts', () => {
  const ROWS: [string, RemoteDraft | null, boolean, string][] = [
    ...STATES.filter(([, , remote]) => remote !== 'draft-is-sent' && remote !== 'draft-is-creation').map(([name, state]) => [name, state, false, 'same'] as [string, RemoteDraft | null, boolean, string]),
    ...STATES.filter(([, , remote]) => remote === 'foreign-draft').map(([name, state]) => [`${name}, with --force`, state, true, 'same'] as [string, RemoteDraft | null, boolean, string]),
    [STATES[3]![0], STATES[3]![1], false, 'unpublished-draft'],
    [STATES[4]![0], STATES[4]![1], false, 'unpublished-draft'],
  ]

  it.each(ROWS)('classes %s as push does', async (_, state, force, script) => {
    const fetch: typeof globalThis.fetch = async () => state ? Response.json(state) : new Response(null, { status: 404 })
    const [item] = await planRemoteRepublish({ remote: 'https://studio.example.test', token: 'token', fetch }, [{ slug: 'talk', raw: SENT }], { force })
    const action = plan(state, { force })
    expect(action).not.toBe('creation-unfinished')
    expect(item!.action).toBe(script === 'same' ? SCRIPT_ACTION[action as keyof typeof SCRIPT_ACTION] : script)
    if (script !== 'same')
      expect(action).toBe('publish')
  })
})

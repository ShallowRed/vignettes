import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { allRecetteFiles, branchRecetteFiles, readRecetteFiles, seedBranchDecks } from '../../layers/studio/server/utils/recette-branch'
import { useDbContent, useDeckMeta } from '../../layers/studio/server/utils/sources'
import { RECETTE_ACCOUNTS, RecetteFileSchema } from '../../layers/studio/shared/recette/branch'
import { RECETTE_PERSONAS } from '../../layers/studio/shared/recette/personas'
import { asUser, seedAccount, setupServerDb, stubH3Globals } from './helpers/server-db'

// A git hook (pre-push runs these tests) exports GIT_DIR and its siblings:
// with them, the git calls below reach the repository that runs the tests,
// and `git init` turns it into a bare repository.
for (const key of Object.keys(process.env).filter(key => key.startsWith('GIT_')))
  delete process.env[key]

stubH3Globals()
setupServerDb()
process.env.NUXT_SESSION_PASSWORD = 'recette-test-password-with-32-chars'

const { default: status } = await import('../../layers/studio/server/api/recette/status.get')
const { default: recreate } = await import('../../layers/studio/server/api/recette/branch.post')

const deck = (title: string) => `---\ntitle: ${title}\nstatus: private\ntheme: minimal\n---\n\n# ${title}\n`

function recette(decks: Array<{ slug: string, file: string }> = []) {
  return [
    'title: Essai',
    ...(decks.length ? ['decks:', ...decks.flatMap(d => [`  - slug: ${d.slug}`, `    file: ${d.file}`])] : []),
    'checks:',
    '  - account: editor',
    '    page: /edit/recette-essai',
    '    expect: L\'éditeur s\'ouvre.',
  ].join('\n')
}

let root: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' }).toString()
function write(path: string, content: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'recette-branch-'))
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  write('.gitignore', '.env\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('recette files of a branch', () => {
  it('lists the recette files added or changed since main, committed or not', async () => {
    write('test/recette/on-main.yaml', recette())
    write('test/recette/deleted.yaml', recette())
    write('test/recette/unchanged.yaml', recette())
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    git('switch', '-q', '-c', 'feat/x')
    write('test/recette/committed.yaml', recette())
    write('test/recette/decks/recette-essai.yaml', recette())
    git('add', '.')
    git('commit', '-q', '-m', 'branch')
    write('test/recette/untracked.yaml', recette())
    write('test/recette/on-main.yaml', `${recette()}\n`)
    write('test/recette/notes.md', 'notes')
    unlinkSync(join(root, 'test/recette/deleted.yaml'))

    expect(await branchRecetteFiles(root)).toEqual([
      'test/recette/committed.yaml',
      'test/recette/on-main.yaml',
      'test/recette/untracked.yaml',
    ])
  })

  it('lists nothing outside a git repository', async () => {
    rmSync(join(root, '.git'), { recursive: true })
    write('test/recette/a.yaml', recette())
    expect(await branchRecetteFiles(root)).toEqual([])
  })

  it('lists nothing without main or origin/main to compare with', async () => {
    write('test/recette/a.yaml', recette())
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    git('branch', '-q', '-m', 'trunk')
    expect(await branchRecetteFiles(root)).toEqual([])
  })
})

describe('recette file schema', () => {
  const check = (account: string, page = '/edit/recette-essai') => RecetteFileSchema.safeParse({ title: 'Essai', checks: [{ account, page, expect: 'Elle s\'ouvre.' }] })

  it('accepts every account of the kit, each a persona or the visitor', () => {
    for (const account of RECETTE_ACCOUNTS) {
      expect(check(account).success).toBe(true)
      expect(account === 'anonymous' || RECETTE_PERSONAS.some(persona => persona.key === account)).toBe(true)
    }
  })

  it('refuses the accounts whose grants come from the data set, and any other', () => {
    const others = [...RECETTE_PERSONAS.map(persona => persona.key), 'me', 'root'].filter(key => !(RECETTE_ACCOUNTS as readonly string[]).includes(key))
    expect(others).toEqual(expect.arrayContaining(['collab', 'expired', 'me']))
    for (const account of others)
      expect(check(account).success).toBe(false)
  })

  it('refuses a page outside the studio', () => {
    for (const page of ['https://example.org/', '//example.org/x', 'edit/recette-essai'])
      expect(check('owner', page).success).toBe(false)
    expect(check('owner', '/slides/recette-essai#/2').success).toBe(true)
  })

  it('refuses a trial deck without the recette- prefix or with an invalid slug', () => {
    const withDeck = (slug: string) => RecetteFileSchema.safeParse({ title: 'Essai', decks: [{ slug, file: 'a.md' }], checks: [{ account: 'owner', page: '/', expect: 'Ok.' }] })
    expect(withDeck('recette-essai').success).toBe(true)
    expect(withDeck('essai').success).toBe(false)
    expect(withDeck('recette-Essai !').success).toBe(false)
  })

  it('refuses a trial deck named twice', () => {
    const decks = [{ slug: 'recette-essai', file: 'a.md' }, { slug: 'recette-essai', file: 'b.md' }]
    expect(RecetteFileSchema.safeParse({ title: 'Essai', decks, checks: [{ account: 'owner', page: '/', expect: 'Ok.' }] }).success).toBe(false)
  })
})

describe('reading recette files', () => {
  const read = (path: string) => readRecetteFiles(root, [path]).then(([file]) => file!)

  it('reads a file, with whether each trial deck exists', async () => {
    write('test/recette/decks/essai.md', deck('Essai'))
    write('test/recette/a.yaml', recette([{ slug: 'recette-essai', file: 'test/recette/decks/essai.md' }]))
    expect(await read('test/recette/a.yaml')).toMatchObject({
      title: 'Essai',
      decks: [{ slug: 'recette-essai', exists: false }],
      checks: [{ account: 'editor', page: '/edit/recette-essai' }],
    })
  })

  it('refuses a slug of the data set, and a slug another recette file names', async () => {
    write('test/recette/decks/essai.md', deck('Essai'))
    write('test/recette/seed.yaml', recette([{ slug: 'recette-public', file: 'test/recette/decks/essai.md' }]))
    expect(await read('test/recette/seed.yaml')).toMatchObject({ error: expect.stringContaining('data set') })

    write('test/recette/a.yaml', recette([{ slug: 'recette-essai', file: 'test/recette/decks/essai.md' }]))
    write('test/recette/b.yaml', recette([{ slug: 'recette-essai', file: 'test/recette/decks/essai.md' }]))
    expect(await read('test/recette/a.yaml')).toMatchObject({ error: expect.stringContaining('test/recette/b.yaml') })
  })

  it('refuses a deck file that is not a .md of the repository, or that git ignores', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'recette-outside-'))
    writeFileSync(join(outside, 'deck.md'), deck('Dehors'))
    symlinkSync(join(outside, 'deck.md'), join(root, 'link.md'))
    write('.env', 'SECRET=1')
    write('ignored.md', deck('Ignorée'))
    write('.gitignore', '.env\nignored.md\n')
    write('notes.txt', 'notes')
    try {
      const refusals: Record<string, string> = {
        [`../${basename(outside)}/deck.md`]: 'outside the repository',
        [join(outside, 'deck.md')]: '.md path',
        'link.md': 'outside the repository',
        '.env': '.md path',
        'notes.txt': '.md path',
        'ignored.md': 'git ignores',
        'missing.md': 'no such file',
      }
      for (const [file, reason] of Object.entries(refusals)) {
        write('test/recette/a.yaml', recette([{ slug: 'recette-essai', file }]))
        expect(await read('test/recette/a.yaml'), file).toMatchObject({ error: expect.stringContaining(reason) })
      }
    }
    finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('reports a file that is not valid YAML', async () => {
    write('test/recette/a.yaml', 'title: [')
    expect(await read('test/recette/a.yaml')).toHaveProperty('error')
  })
})

describe('trial decks', () => {
  beforeEach(() => {
    write('.gitignore', '')
    git('add', '.')
    git('commit', '-q', '-m', 'base')
    write('test/recette/decks/essai.md', deck('Essai'))
    write('test/recette/a.yaml', recette([{ slug: 'recette-essai', file: 'test/recette/decks/essai.md' }]))
  })

  it('creates the missing decks and leaves the existing ones, trashed included', async () => {
    write('test/recette/decks/autre.md', deck('Autre'))
    write('test/recette/b.yaml', recette([{ slug: 'recette-autre', file: 'test/recette/decks/autre.md' }]))
    await useDbContent().writer.save({ slug: 'recette-autre', raw: deck('Modifiée'), actor: 'test' })
    await useDeckMeta().softDelete('recette-autre')

    expect(await seedBranchDecks(root, { replace: false })).toBe(1)
    expect((await useDbContent().source.load('recette-essai'))?.raw).toContain('# Essai')
    expect(await useDeckMeta().existsIncludingTrashed('recette-autre')).toBe(true)
    expect(await useDeckMeta().isTrashed('recette-autre')).toBe(true)
    expect(await seedBranchDecks(root, { replace: false })).toBe(0)
  })

  it('replaces every deck with its file', async () => {
    await useDbContent().writer.save({ slug: 'recette-essai', raw: deck('Modifiée'), actor: 'test' })
    expect(await seedBranchDecks(root, { replace: true })).toBe(1)
    expect((await useDbContent().source.load('recette-essai'))?.raw).toContain('# Essai')
  })

  it('skips a file in error', async () => {
    write('test/recette/a.yaml', recette([{ slug: 'recette-public', file: 'test/recette/decks/essai.md' }]))
    expect(await seedBranchDecks(root, { replace: true })).toBe(0)
    expect(await useDeckMeta().existsIncludingTrashed('recette-public')).toBe(false)
  })
})

describe('outside development', () => {
  // vitest runs without `import.meta.dev`: the kit opens, as on staging, and
  // the owner session passes `assertRecette`, so only the dev check answers.
  it('reads no recette file and publishes no trial deck, even for an owner of an enabled kit', async () => {
    process.env.NUXT_RECETTE_ENABLED = '1'
    try {
      await seedAccount(1, 'boss', 'owner')
      await expect(status(asUser(1, 'boss'))).resolves.toMatchObject({ branch: null })
      await expect(recreate(asUser(1, 'boss', { method: 'POST' }))).rejects.toMatchObject({ statusCode: 404 })
    }
    finally {
      delete process.env.NUXT_RECETTE_ENABLED
    }
  })
})

describe('recette files of the repository', () => {
  it('are all valid, with unique slugs and existing deck files', async () => {
    const files = await readRecetteFiles(process.cwd(), await allRecetteFiles(process.cwd()))
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter(file => 'error' in file)).toEqual([])
  })
})

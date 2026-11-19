import type { BranchRecetteFile, CapturedRecetteFile, RecetteCapture, RecetteDeck } from '#shared/recette/branch'
import type { RecetteWidth } from '#shared/recette/captures'
import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readdir, readFile, realpath, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { RecetteFileSchema } from '#shared/recette/branch'
import { CAPTURE_KEY_RE, captureKey, captureStateKey, RECETTE_DIR, RECETTE_WIDTHS, recetteSubject } from '#shared/recette/captures'
import { load as parseYaml } from 'js-yaml'
import { SEED_SLUGS } from './recette'
import { useDbContent, useDeckMeta } from './sources'

/**
 * The recette of a branch on the local studio: the recette files the branch
 * adds or changes, read from the working tree, and the trial decks they name.
 * Development only: the callers check `import.meta.dev`.
 */

const isRecetteFile = (path: string) => recetteSubject(path) !== undefined

const run = promisify(execFile)

async function git(root: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['--literal-pathspecs', ...args], { cwd: root })
  return stdout
}

const lines = (output: string) => output.split('\n').filter(Boolean)

/** The commit the branch leaves `origin/main` at, or `main` without a remote. */
async function comparisonBase(root: string): Promise<string | null> {
  for (const ref of ['origin/main', 'main']) {
    try {
      return (await git(root, ['merge-base', 'HEAD', ref])).trim()
    }
    catch {}
  }
  return null
}

/**
 * The recette files that differ from the comparison base: added or modified,
 * committed or not, and the untracked ones git does not ignore. For a stack,
 * every branch of the stack since `origin/main`.
 */
export async function branchRecetteFiles(root: string): Promise<string[]> {
  try {
    const base = await comparisonBase(root)
    if (!base)
      return []
    const changed = await git(root, ['diff', '--name-only', '--no-renames', '--diff-filter=AM', base, '--', RECETTE_DIR])
    const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '--', RECETTE_DIR])
    return [...new Set([...lines(changed), ...lines(untracked)])].filter(isRecetteFile).sort()
  }
  catch {
    return []
  }
}

/** Every recette file of the working tree. */
export async function allRecetteFiles(root: string): Promise<string[]> {
  const names = await readdir(join(root, RECETTE_DIR)).catch(() => [] as string[])
  return names.map(name => `${RECETTE_DIR}/${name}`).filter(isRecetteFile).sort()
}

async function parseRecetteFile(root: string, path: string) {
  return RecetteFileSchema.safeParse(parseYaml(await readFile(join(root, path), 'utf8')))
}

/**
 * Why a deck file cannot be published, or null: it is a `.md` file whose real
 * path stays under the root, and git tracks it or would (ignored files such as
 * `.env` or `.data/` are refused).
 */
async function deckFileError(root: string, file: string): Promise<string | null> {
  if (!file.endsWith('.md') || isAbsolute(file))
    return `${file}: a deck file is a .md path from the root of the repository`
  let real: string
  let realRoot: string
  try {
    real = await realpath(join(root, file))
    realRoot = await realpath(root)
  }
  catch {
    return `${file}: no such file`
  }
  if (!real.startsWith(realRoot + sep))
    return `${file}: the file is outside the repository`
  const known = await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '--', relative(realRoot, real)]).catch(() => '')
  return known.trim() ? null : `${file}: git ignores this file`
}

/**
 * Reads and checks the recette files at `paths`. A file is in error when its
 * schema fails, when it names a deck of the `recette-*` data set or a slug
 * another recette file of the directory names too, or when a deck file is
 * refused (see `deckFileError`).
 */
export async function readRecetteFiles(root: string, paths: string[]): Promise<BranchRecetteFile[]> {
  const owners = new Map<string, Set<string>>()
  for (const path of new Set([...await allRecetteFiles(root), ...paths])) {
    const parsed = await parseRecetteFile(root, path).catch(() => null)
    for (const deck of parsed?.success ? parsed.data.decks : [])
      owners.set(deck.slug, (owners.get(deck.slug) ?? new Set()).add(path))
  }

  const meta = useDeckMeta()
  const read = async (path: string): Promise<BranchRecetteFile> => {
    let parsed: Awaited<ReturnType<typeof parseRecetteFile>>
    try {
      parsed = await parseRecetteFile(root, path)
    }
    catch (error) {
      return { path, error: (error as Error).message }
    }
    if (!parsed.success)
      return { path, error: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ') }
    for (const deck of parsed.data.decks) {
      if (SEED_SLUGS.includes(deck.slug))
        return { path, error: `${deck.slug}: this slug belongs to the recette data set` }
      const others = [...owners.get(deck.slug) ?? []].filter(owner => owner !== path)
      if (others.length > 0)
        return { path, error: `${deck.slug}: ${others.join(', ')} names this slug too` }
      const fileError = await deckFileError(root, deck.file)
      if (fileError)
        return { path, error: fileError }
    }
    const decks = await Promise.all(parsed.data.decks.map(async deck => ({ ...deck, exists: await meta.existsIncludingTrashed(deck.slug) })))
    return { path, title: parsed.data.title, decks, questions: parsed.data.questions }
  }
  return Promise.all(paths.map(read))
}

/** The recette files of the branch, read and checked. */
export async function readBranchRecette(root: string): Promise<BranchRecetteFile[]> {
  return readRecetteFiles(root, await branchRecetteFiles(root))
}

/**
 * Publishes the trial decks of the branch from their file: the missing ones,
 * or, with `replace`, every one after purging it. Files in error are skipped.
 * Returns the number of decks published.
 */
export async function seedBranchDecks(root: string, { replace }: { replace: boolean }): Promise<number> {
  const decks: Array<RecetteDeck & { exists: boolean }> = (await readBranchRecette(root)).flatMap(file => 'decks' in file ? file.decks : [])
  const meta = useDeckMeta()
  let published = 0
  for (const deck of decks) {
    if (deck.exists && !replace)
      continue
    if (deck.exists)
      await meta.purge(deck.slug)
    await useDbContent().writer.save({ slug: deck.slug, raw: await readFile(join(root, deck.file), 'utf8'), actor: 'recette' })
    published++
  }
  return published
}

/** The branch the worktree is on, or null on a detached head or outside a git repository. */
export async function currentBranch(root: string): Promise<string | null> {
  return (await git(root, ['branch', '--show-current']).catch(() => '')).trim() || null
}

// ── Captures ─────────────────────────────────────────────────────────────────

/**
 * The state of the worktree: the hash of the tree a commit of the whole worktree
 * would have, tracked files and the untracked ones git does not ignore, written
 * in a copy of the index so the real one stays as it is. A commit of the same
 * content keeps it. Null outside a git repository.
 */
export async function worktreeState(root: string): Promise<string | null> {
  const scratch = await mkdtemp(join(tmpdir(), 'recette-state-'))
  try {
    const index = resolve(root, (await git(root, ['rev-parse', '--git-path', 'index'])).trim())
    const copy = join(scratch, 'index')
    // The copy keeps the date of the index, which git compares to the dates of
    // the files to rehash a file written in the second the index was.
    await copyFile(index, copy).then(async () => {
      const { atime, mtime } = await stat(index)
      await utimes(copy, atime, mtime)
    }).catch(() => {})
    // The shell sets the index of these two commands only: the server reads
    // no `process.env`, which a copy of the environment for `execFile` would.
    const { stdout } = await run('sh', ['-c', 'GIT_INDEX_FILE="$1" git add -A && GIT_INDEX_FILE="$1" git write-tree', 'sh', copy], { cwd: root })
    return stdout.trim() || null
  }
  catch {
    return null
  }
  finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** The part of the Nitro storage of the captures that the kit reads. */
export interface CaptureStorage {
  hasItem: (key: string) => Promise<boolean>
  getItem: (key: string) => Promise<unknown>
  getItemRaw: (key: string) => Promise<unknown>
}

/**
 * The captures of each question of the valid files: null for a capture not
 * taken, stale when the worktree changed since the subject was captured, or
 * when the last run of the subject did not take it.
 */
export async function branchRecetteCaptures(storage: CaptureStorage, files: BranchRecetteFile[], state: string | null): Promise<CapturedRecetteFile[]> {
  return Promise.all(files.map(async (file): Promise<CapturedRecetteFile> => {
    if ('error' in file)
      return file
    const subject = recetteSubject(file.path)
    if (subject === undefined)
      return { path: file.path, error: `${file.path}: not a recette file` }
    const captured = await storage.getItem(captureStateKey(subject)) as { state?: unknown, keys?: unknown } | null
    const taken = new Set(Array.isArray(captured?.keys) ? captured.keys : [])
    const current = state !== null && captured?.state === state
    const questions = await Promise.all(file.questions.map(async (question) => {
      const captures = {} as Record<RecetteWidth, RecetteCapture | null>
      for (const width of RECETTE_WIDTHS) {
        const key = captureKey(subject, question.id, width)
        captures[width] = await storage.hasItem(key) ? { key, stale: !current || !taken.has(key) } : null
      }
      return { ...question, captures }
    }))
    return { ...file, questions }
  }))
}

/** The bytes of the capture at `key`, or null for a key outside the captures or a capture not taken. */
export async function readCapture(storage: CaptureStorage, key: string): Promise<Uint8Array | null> {
  if (!CAPTURE_KEY_RE.test(key))
    return null
  const raw = await storage.getItemRaw(key)
  return raw instanceof Uint8Array ? raw : null
}

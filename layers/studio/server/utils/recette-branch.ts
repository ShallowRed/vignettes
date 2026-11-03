import type { BranchRecetteFile, RecetteDeck } from '#shared/recette/branch'
import { execFile } from 'node:child_process'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { RecetteFileSchema } from '#shared/recette/branch'
import { load as parseYaml } from 'js-yaml'
import { SEED_SLUGS } from './recette'
import { useDbContent, useDeckMeta } from './sources'

/**
 * The recette of a branch on the local studio: the recette files the branch
 * adds or changes, read from the working tree, and the trial decks they name.
 * Development only: the callers check `import.meta.dev`.
 */

const RECETTE_DIR = 'test/recette'
const RECETTE_FILE = /^test\/recette\/[^/]+\.yaml$/

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
    return [...new Set([...lines(changed), ...lines(untracked)])].filter(path => RECETTE_FILE.test(path)).sort()
  }
  catch {
    return []
  }
}

/** Every recette file of the working tree. */
export async function allRecetteFiles(root: string): Promise<string[]> {
  const names = await readdir(join(root, RECETTE_DIR)).catch(() => [] as string[])
  return names.map(name => `${RECETTE_DIR}/${name}`).filter(path => RECETTE_FILE.test(path)).sort()
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
    return { path, title: parsed.data.title, decks, checks: parsed.data.checks }
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

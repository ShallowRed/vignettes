import type { ImageType } from '@vignettes/core/media'
import { Buffer } from 'node:buffer'
import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { MAX_MEDIA_BYTES, sniffImageType } from '@vignettes/core/media'
import { CliError } from './messages.ts'

const errorCode = (error: unknown) => (error as { code?: string }).code ?? ''

/**
 * The text of a deck file, decoded as UTF-8 with its byte order mark kept; a
 * file that does not exist, cannot be read or is not UTF-8 stops the command.
 */
export async function readDeck(file: string): Promise<string> {
  let bytes: Uint8Array
  try {
    bytes = await readFile(file)
  }
  catch (error) {
    throw new CliError(errorCode(error) === 'ENOENT' ? 'missing-file' : 'unreadable-file', file)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  }
  catch {
    throw new CliError('not-utf8', file)
  }
}

/** The folder of a deck file, its symbolic links resolved. */
export function deckFolder(file: string): Promise<string> {
  return realpath(dirname(resolve(file)))
}

/** Whether `path` is `folder` or a file of it or of its subfolders. */
function isInside(folder: string, path: string): boolean {
  const rel = relative(folder, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * What the command line read of a local image: absent, outside the folder of
 * the deck, unreadable (not a file, or a file it has no right to read), or
 * read, with its weight, the accepted type its bytes show, and its bytes when
 * it weighs no more than `MAX_MEDIA_BYTES`.
 */
export type ReadImage
  = | { state: 'missing' }
    | { state: 'outside' }
    | { state: 'unreadable' }
    | { state: 'read', bytes: number, type?: ImageType, data?: Uint8Array }

const MISSING = new Set(['ENOENT', 'ENOTDIR'])

const readFailure = (error: unknown): ReadImage => MISSING.has(errorCode(error)) ? { state: 'missing' } : { state: 'unreadable' }

/**
 * Reads the image at `path`, relative to `folder`, the folder of the deck
 * after `realpath`. The path is resolved by `realpath` and checked before the
 * file opens, with `O_NOFOLLOW`, and `O_NONBLOCK` so that a named pipe does
 * not hold the command, where the platform defines them; the bytes are
 * read only when a second `realpath` gives a path inside the folder whose
 * file is the one the descriptor holds, by its device and its inode, and when
 * that file is a regular file.
 */
export async function readImage(folder: string, path: string): Promise<ReadImage> {
  let resolved: string
  try {
    resolved = await realpath(resolve(folder, path))
  }
  catch (error) {
    return readFailure(error)
  }
  if (!isInside(folder, resolved))
    return { state: 'outside' }
  let handle
  try {
    handle = await open(resolved, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0))
  }
  catch (error) {
    return errorCode(error) === 'ELOOP' ? { state: 'outside' } : readFailure(error)
  }
  let data: Uint8Array
  try {
    const opened = await handle.stat()
    const again = await realpath(resolved).catch(() => undefined)
    const found = again && isInside(folder, again) ? await stat(again).catch(() => undefined) : undefined
    if (!found || found.dev !== opened.dev || found.ino !== opened.ino)
      return { state: 'outside' }
    if (!opened.isFile())
      return { state: 'unreadable' }
    if (opened.size > MAX_MEDIA_BYTES)
      return { state: 'read', bytes: opened.size }
    data = new Uint8Array(await handle.readFile())
  }
  catch (error) {
    return readFailure(error)
  }
  finally {
    await handle.close()
  }
  const type = sniffImageType(data)
  return { state: 'read', bytes: data.length, ...(type && { type }), data }
}

/**
 * Writes the draft that `push --force` replaces beside the deck file, as
 * `<slug>.md.replaced-<stamp>`, a name a list of `*.md` leaves out, with
 * `O_EXCL`. A file of that name that holds the same bytes is the copy of an
 * earlier run under the same stamp; one that holds other bytes stops the deck.
 */
export async function writeReplacedCopy(folder: string, slug: string, stamp: number | null, draft: string): Promise<string> {
  const path = join(folder, `${slug}.md.replaced-${stamp ?? 'none'}`)
  const bytes = new TextEncoder().encode(draft)
  try {
    await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
    return path
  }
  catch (error) {
    if (errorCode(error) !== 'EEXIST')
      throw new CliError('unwritable-file', path)
  }
  const kept = await readFile(path).catch(() => undefined)
  if (!kept || !Buffer.from(kept).equals(Buffer.from(bytes)))
    throw new CliError('replaced-copy-differs', path)
  return path
}

/** What `pull` did with the file of a deck. */
export interface PulledFile {
  state: 'written' | 'identical' | 'local-differs'
  path: string
  /** The copy of the local file that `--force` replaced. */
  replaced?: string
}

/**
 * Writes the bytes `pull` received to `<folder>/<slug>.md` as they came, by a
 * temporary file created with `O_EXCL` in the same folder and a rename. A
 * symbolic link at that name stops the deck; a file with the same bytes is
 * left as it is; a file with other bytes is refused, or with `force` copied
 * first to `<slug>.md.replaced-local-<time>`, with `O_EXCL`.
 */
export async function writePulled(folder: string, slug: string, bytes: Uint8Array, force: boolean): Promise<PulledFile> {
  const path = join(folder, `${slug}.md`)
  const found = await lstat(path).catch((error) => {
    if (errorCode(error) === 'ENOENT')
      return undefined
    throw new CliError('unwritable-file', path)
  })
  if (found?.isSymbolicLink())
    throw new CliError('pulled-link', path)
  let replaced: string | undefined
  if (found) {
    const local = await readFile(path).catch(() => {
      throw new CliError('unreadable-file', path)
    })
    if (Buffer.from(local).equals(Buffer.from(bytes)))
      return { state: 'identical', path }
    if (!force)
      return { state: 'local-differs', path }
    replaced = `${path}.replaced-local-${new Date().toISOString().replaceAll(':', '-')}`
    await writeFile(replaced, local, { flag: 'wx' }).catch(() => {
      throw new CliError('unwritable-file', replaced!)
    })
  }
  const temporary = join(folder, `.${slug}.md.${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(temporary, bytes, { flag: 'wx' })
    await rename(temporary, path)
  }
  catch {
    await rm(temporary, { force: true })
    throw new CliError('unwritable-file', path)
  }
  return { state: 'written', path, ...(replaced && { replaced }) }
}

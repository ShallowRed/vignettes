import type { ImageType } from '@vignettes/core/media'
import { constants } from 'node:fs'
import { open, readFile, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { acceptedImageType, MAX_MEDIA_BYTES, sniffImageType } from '@vignettes/core/media'
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
    const data = new Uint8Array(await handle.readFile())
    const type = acceptedImageType(sniffImageType(data) ?? '', data)
    return { state: 'read', bytes: data.length, ...(type && { type }), data }
  }
  catch (error) {
    return readFailure(error)
  }
  finally {
    await handle.close()
  }
}

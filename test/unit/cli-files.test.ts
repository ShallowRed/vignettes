import type { FileHandle } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { mediaName } from '@vignettes/core/media'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readDeck, readImage, writePulled, writeReplacedCopy } from '../../packages/cli/src/files.ts'
import { readLocalDeck } from '../../packages/cli/src/local-deck.ts'

// The opened files with the inode of their descriptor, and the handles whose
// bytes were read, to check that a refused image is never read.
const opened: string[] = []
const openedInodes: number[] = []
const readHandles: string[] = []
let afterFirstRealpath: (() => void) | undefined
let afterOpen: (() => void) | undefined

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: vi.fn(async (path: string, flags: number) => {
      opened.push(path)
      const handle: FileHandle = await actual.open(path, flags)
      openedInodes.push((await handle.stat()).ino)
      afterOpen?.()
      afterOpen = undefined
      const readFile = handle.readFile.bind(handle)
      return Object.assign(handle, { readFile: (...args: Parameters<FileHandle['readFile']>) => {
        readHandles.push(path)
        return readFile(...args)
      } })
    }),
    realpath: vi.fn(async (path: string) => {
      const resolved = await actual.realpath(path)
      afterFirstRealpath?.()
      afterFirstRealpath = undefined
      return resolved
    }),
  }
})

const PNG = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3])

let root: string
let folder: string

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'vignettes-files-')))
  folder = join(root, 'deck')
  mkdirSync(join(folder, 'sub'), { recursive: true })
  writeFileSync(join(root, 'outside.png'), PNG)
  opened.length = 0
  openedInodes.length = 0
  readHandles.length = 0
})

afterEach(() => rmSync(root, { recursive: true }))

describe('the images of a deck (readImage of packages/cli/src/files.ts)', () => {
  it('reads an image of the folder of the deck or of a subfolder, and one named ..x.png', async () => {
    writeFileSync(join(folder, 'sub', 'a.png'), PNG)
    writeFileSync(join(folder, '..x.png'), PNG)
    expect(await readImage(folder, './sub/a.png')).toEqual({ state: 'read', bytes: PNG.length, type: 'image/png', data: PNG })
    expect(await readImage(folder, '..x.png')).toMatchObject({ state: 'read', type: 'image/png' })
  })

  it('gives an absent image as missing', async () => {
    expect(await readImage(folder, './absent.png')).toEqual({ state: 'missing' })
    expect(opened).toEqual([])
  })

  it.each([
    ['by ../', '../outside.png'],
    ['by a symbolic link', './link.png'],
    ['by a symbolic link to a folder', './linked/outside.png'],
  ])('refuses an image outside the folder %s, without opening it', async (_, path) => {
    symlinkSync(join(root, 'outside.png'), join(folder, 'link.png'))
    symlinkSync(root, join(folder, 'linked'))
    expect(await readImage(folder, path)).toEqual({ state: 'outside' })
    expect(opened).toEqual([])
  })

  it('refuses an image whose folder becomes a link to the outside between the check and the opening, without reading its bytes', async () => {
    mkdirSync(join(folder, 'inside'))
    writeFileSync(join(folder, 'inside', 'outside.png'), PNG)
    afterFirstRealpath = () => {
      renameSync(join(folder, 'inside'), join(folder, 'moved'))
      symlinkSync(root, join(folder, 'inside'))
    }
    expect(await readImage(folder, './inside/outside.png')).toEqual({ state: 'outside' })
    expect(opened).toEqual([join(folder, 'inside', 'outside.png')])
    expect(readHandles).toEqual([])
  })

  it('refuses a link put at the place of the image between the check and the opening, without opening the file outside', async () => {
    writeFileSync(join(folder, 'a.png'), PNG)
    afterFirstRealpath = () => {
      unlinkSync(join(folder, 'a.png'))
      symlinkSync(join(root, 'outside.png'), join(folder, 'a.png'))
    }
    expect(await readImage(folder, './a.png')).toEqual({ state: 'outside' })
    expect(openedInodes).not.toContain(statSync(join(root, 'outside.png')).ino)
    expect(readHandles).toEqual([])
  })

  it('refuses a descriptor that is no longer the file of the path, without reading its bytes', async () => {
    writeFileSync(join(folder, 'a.png'), PNG)
    writeFileSync(join(folder, 'b.png'), PNG)
    afterOpen = () => renameSync(join(folder, 'b.png'), join(folder, 'a.png'))
    expect(await readImage(folder, './a.png')).toEqual({ state: 'outside' })
    expect(opened).toEqual([join(folder, 'a.png')])
    expect(readHandles).toEqual([])
  })

  it('gives a folder, a named pipe and a path the system refuses as unreadable, without waiting on the pipe', async () => {
    expect(spawnSync('mkfifo', [join(folder, 'pipe.png')]).status).toBe(0)
    expect(await readImage(folder, './sub')).toEqual({ state: 'unreadable' })
    expect(await readImage(folder, './pipe.png')).toEqual({ state: 'unreadable' })
    expect(await readImage(folder, './a\0.png')).toEqual({ state: 'unreadable' })
    expect(readHandles).toEqual([])
  }, 2000)

  it.skipIf(process.getuid?.() === 0)('gives a file it has no right to read as unreadable', async () => {
    writeFileSync(join(folder, 'locked.png'), PNG)
    chmodSync(join(folder, 'locked.png'), 0)
    expect(await readImage(folder, './locked.png')).toEqual({ state: 'unreadable' })
  })

  it('reads no bytes of a file larger than an instance accepts, and gives the type of the bytes', async () => {
    writeFileSync(join(folder, 'large.png'), new Uint8Array(10 * 1024 * 1024 + 1))
    writeFileSync(join(folder, 'text.png'), 'text')
    expect(await readImage(folder, 'large.png')).toEqual({ state: 'read', bytes: 10 * 1024 * 1024 + 1 })
    expect(readHandles).toEqual([])
    expect(await readImage(folder, 'text.png')).toEqual({ state: 'read', bytes: 4, data: new TextEncoder().encode('text') })
  })
})

describe('the text of a deck file (readDeck of packages/cli/src/files.ts)', () => {
  it('keeps the byte order mark and the carriage returns, and refuses a file that is not UTF-8', async () => {
    writeFileSync(join(folder, 'bom.md'), Uint8Array.from([0xEF, 0xBB, 0xBF, 0x61, 0x0D, 0x0A]))
    writeFileSync(join(folder, 'latin.md'), Uint8Array.from([0x23, 0x20, 0xE9]))
    expect(await readDeck(join(folder, 'bom.md'))).toBe('﻿a\r\n')
    await expect(readDeck(join(folder, 'latin.md'))).rejects.toMatchObject({ code: 'not-utf8' })
    await expect(readDeck(join(folder, 'absent.md'))).rejects.toMatchObject({ code: 'missing-file' })
  })
})

describe('a deck and its images (readLocalDeck of packages/cli/src/local-deck.ts)', () => {
  it('sends the uploaded name of each image it reads, and reports the others', async () => {
    writeFileSync(join(folder, 'sub', 'a.png'), PNG)
    const raw = '---\ntitle: T\nbrand:\n  operator: ./sub/a.png\n---\n\n# A\n\n![a](./sub/a.png) ![b](./absent.png) ![c](../outside.png)\n'
    writeFileSync(join(folder, 'talk.md'), raw)
    const name = await mediaName(PNG, 'image/png')
    const deck = await readLocalDeck(join(folder, 'talk.md'))
    expect(deck.images).toEqual([{ path: './sub/a.png', data: PNG, type: 'image/png', name }])
    expect(deck.sent).toBe(`---\ntitle: T\nbrand:\n  operator: /media/${name}\n---\n\n# A\n\n![a](/media/${name}) ![b](./absent.png) ![c](../outside.png)\n`)
    expect(deck.problems.map(problem => [problem.check, problem.line])).toEqual([['image-missing', 9], ['image-outside-deck', 9]])
    expect(opened).toEqual([join(folder, 'sub', 'a.png')])
  })

  it('reports a missing image whose path holds a space once, without a warning on a part of its path', async () => {
    writeFileSync(join(folder, 'sub', 'a.png'), PNG)
    writeFileSync(join(folder, 'talk.md'), '---\ntitle: T\n---\n\n# A\n\n![s](./sub/a.png) ![a](<./a b.png>)\n')
    const deck = await readLocalDeck(join(folder, 'talk.md'))
    expect(deck.problems.map(problem => [problem.check, 'value' in problem && problem.value])).toEqual([['image-missing', './a b.png']])
  })

  it('refuses an encoded path that leads out of the folder once decoded, without opening it', async () => {
    writeFileSync(join(folder, 'talk.md'), '---\ntitle: T\n---\n\n# A\n\n![a](%2E%2E/outside.png) ![b](%2Fetc%2Fhosts)\n')
    const deck = await readLocalDeck(join(folder, 'talk.md'))
    expect(deck.problems.map(problem => [problem.check, 'value' in problem && problem.value])).toEqual([
      ['image-outside-deck', '%2E%2E/outside.png'],
      ['image-outside-deck', '%2Fetc%2Fhosts'],
    ])
    expect(opened).toEqual([])
  })

  it('reports an image it cannot read as a problem of the deck', async () => {
    writeFileSync(join(folder, 'talk.md'), '---\ntitle: T\n---\n\n# A\n\n![a](./sub) ![b](./a%00.png)\n')
    const deck = await readLocalDeck(join(folder, 'talk.md'))
    expect(deck.problems.map(problem => problem.check)).toEqual(['image-unreadable', 'image-unreadable'])
  })
})

describe('the files that pull writes (writePulled of packages/cli/src/files.ts)', () => {
  // A text in CRLF with a byte order mark and an ESC, which the file keeps.
  const RAW = Uint8Array.from([0xEF, 0xBB, 0xBF, 0x23, 0x20, 0x41, 0x0D, 0x0A, 0x1B, 0x62, 0x0A])

  it('writes the bytes received through a temporary file and a rename, then finds them identical', async () => {
    expect(await writePulled(folder, 'talk', RAW, false)).toEqual({ state: 'written', path: join(folder, 'talk.md') })
    expect(new Uint8Array(readFileSync(join(folder, 'talk.md')))).toEqual(RAW)
    expect(readdirSync(folder).filter(file => file.endsWith('.tmp'))).toEqual([])
    const written = statSync(join(folder, 'talk.md')).mtimeMs
    expect(await writePulled(folder, 'talk', RAW, false)).toEqual({ state: 'identical', path: join(folder, 'talk.md') })
    expect(statSync(join(folder, 'talk.md')).mtimeMs).toBe(written)
  })

  it('keeps a local file with another text, and with force copies it beside itself first', async () => {
    writeFileSync(join(folder, 'talk.md'), '# Mine\n')
    expect(await writePulled(folder, 'talk', RAW, false)).toMatchObject({ state: 'local-differs' })
    expect(readFileSync(join(folder, 'talk.md'), 'utf8')).toBe('# Mine\n')
    const forced = await writePulled(folder, 'talk', RAW, true)
    expect(forced).toMatchObject({ state: 'written', replaced: expect.stringMatching(/talk\.md\.replaced-local-\d{4}-/) })
    expect(readFileSync(forced.replaced!, 'utf8')).toBe('# Mine\n')
    expect(new Uint8Array(readFileSync(join(folder, 'talk.md')))).toEqual(RAW)
  })

  it.each([false, true])('refuses a symbolic link at the name of the file, with force %s', async (force) => {
    writeFileSync(join(root, 'elsewhere.md'), '# Elsewhere\n')
    symlinkSync(join(root, 'elsewhere.md'), join(folder, 'talk.md'))
    await expect(writePulled(folder, 'talk', RAW, force)).rejects.toMatchObject({ code: 'pulled-link' })
    expect(readFileSync(join(root, 'elsewhere.md'), 'utf8')).toBe('# Elsewhere\n')
  })
})

describe('the copy of a replaced draft (writeReplacedCopy of packages/cli/src/files.ts)', () => {
  it('writes the draft under a name a list of *.md leaves out, takes a copy of the same bytes, and refuses one of other bytes', async () => {
    const path = await writeReplacedCopy(folder, 'talk', 1764245000, '# Theirs\n')
    expect(path).toBe(join(folder, 'talk.md.replaced-1764245000'))
    expect(readFileSync(path, 'utf8')).toBe('# Theirs\n')
    expect(readdirSync(folder).filter(file => file.endsWith('.md'))).toEqual([])
    expect(await writeReplacedCopy(folder, 'talk', 1764245000, '# Theirs\n')).toBe(path)
    await expect(writeReplacedCopy(folder, 'talk', 1764245000, '# Other\n')).rejects.toMatchObject({ code: 'replaced-copy-differs' })
    expect(readFileSync(path, 'utf8')).toBe('# Theirs\n')
  })
})

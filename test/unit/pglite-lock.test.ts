import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { lockPgliteDir } from '../../layers/studio/server/db/postgres/pglite-lock'

describe('the lock of a PGlite directory', () => {
  let dir: string

  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'pglite-lock-')), 'pglite')
  })

  afterEach(() => {
    rmSync(join(dir, '..'), { recursive: true, force: true })
  })

  it('refuses a directory another live process holds', async () => {
    writeFileSync(`${dir}.lock`, JSON.stringify({ pid: process.ppid, thread: 0 }))
    await expect(lockPgliteDir(dir)).rejects.toThrow(`open in process ${process.ppid}`)
  })

  it('takes over the lock of a process that ended', async () => {
    writeFileSync(`${dir}.lock`, JSON.stringify({ pid: 2 ** 22 + 1, thread: 0 }))
    const release = await lockPgliteDir(dir)
    release()
    expect(existsSync(`${dir}.lock`)).toBe(false)
  })

  it('names a lock file it cannot read once the wait is over', async () => {
    writeFileSync(`${dir}.lock`, '')
    await expect(lockPgliteDir(dir, { wait: 200 })).rejects.toThrow(`The lock file ${dir}.lock names no process`)
  })

  it('waits for another thread of this process to release it', async () => {
    writeFileSync(`${dir}.lock`, JSON.stringify({ pid: process.pid, thread: 99 }))
    setTimeout(() => rmSync(`${dir}.lock`), 200)
    const release = await lockPgliteDir(dir)
    release()
  })
})

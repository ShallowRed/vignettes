import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { threadId } from 'node:worker_threads'

/**
 * PGlite is single user/connection (its README): two processes that open one
 * directory lose writes without an error. A lock file next to the directory
 * names the process that holds it. The development server replaces its worker
 * thread on every server change and the new worker opens the database while
 * the old one closes it, so a holder in this process is waited for.
 */

interface Holder {
  pid: number
  thread: number
}

/**
 * How long a worker of this process waits for the previous worker to close the
 * directory, and how long a lock file nobody can read is waited for.
 */
const WAIT_MS = 10_000

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function readHolder(path: string): Holder | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Holder
  }
  catch {
    return null
  }
}

/** Takes the lock of a PGlite directory, or throws when another process holds it. Returns the release. */
export async function lockPgliteDir(dir: string, { wait = WAIT_MS }: { wait?: number } = {}): Promise<() => void> {
  const path = `${dir}.lock`
  const self: Holder = { pid: process.pid, thread: threadId }
  const started = Date.now()
  for (;;) {
    try {
      writeFileSync(path, JSON.stringify(self), { flag: 'wx' })
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw error
    }
    const holder = readHolder(path)
    const waited = Date.now() - started > wait
    if (holder === null && waited)
      throw new Error(`The lock file ${path} names no process: delete it if no development server or script uses ${dir}, and run the command again.`)
    const stale = holder !== null && (!alive(holder.pid) || (holder.pid === process.pid && waited))
    if (stale) {
      unlinkSync(path)
      continue
    }
    if (holder && holder.pid !== process.pid) {
      throw new Error(`The PGlite database ${dir} is open in process ${holder.pid}, the development server or a script: PGlite accepts one process per directory. Stop that process and run the command again.`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  const release = () => {
    const holder = readHolder(path)
    if (holder?.pid === self.pid && holder.thread === self.thread)
      unlinkSync(path)
    process.off('exit', release)
  }
  // A script that calls process.exit() still releases the directory.
  process.on('exit', release)
  return release
}

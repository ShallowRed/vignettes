import { readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { CAPTURE_KEY_RE, captureKey, RECETTE_SUBJECT_RE, RECETTE_WIDTHS } from '../../layers/studio/shared/recette/captures'

/**
 * Removes the captures of a subject whose question is missing from its file,
 * before the subject is captured again. The captures of the other questions
 * stay until the run writes over them, so a page that shows the captures, the
 * recette page itself, shows them during the run. Another file stays.
 */
export async function pruneSubject(dir: string, subject: string, ids: string[]): Promise<void> {
  if (!RECETTE_SUBJECT_RE.test(subject))
    throw new Error(`${subject}: not a recette subject`)
  const kept = new Set(ids.flatMap(id => RECETTE_WIDTHS.map(width => captureKey(subject, id, width))))
  const names = await readdir(join(dir, subject)).catch(() => [] as string[])
  const stale = names.filter(name => CAPTURE_KEY_RE.test(`${subject}/${name}`) && !kept.has(`${subject}/${name}`))
  await Promise.all(stale.map(name => rm(join(dir, subject, name))))
}

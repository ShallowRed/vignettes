import type { HistoryEntry } from '../../../layers/studio/shared/presentations/history'
import type { PresentationListItem } from '../../../layers/studio/shared/presentations/list-item'
import type { Project } from '../../../layers/studio/shared/projects/schema'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

/** A catalog entry with the required fields filled from the slug. */
export function listItem(partial: Partial<PresentationListItem> & { slug: string }): PresentationListItem {
  return {
    title: partial.slug,
    theme: 'dsfr',
    status: 'public',
    filename: `${partial.slug}.md`,
    ...partial,
  }
}

export function project(slug: string, extra: Partial<Project> = {}): Project {
  return { slug, title: extra.title ?? slug, ...extra }
}

/** Paths that leave the directory a file route serves, as the route parameter may carry them. */
export const ESCAPING_PATHS = [
  '../package.json',
  '..%2Fpackage.json',
  '%2e%2e/package.json',
  '%2E%2E%2Fpackage.json',
  'bundle/..%2F..%2Fpackage.json',
  '..%5Cpackage.json',
  'bundle%5C..%5C..%5Cpackage.json',
  'bundle/index.html%00.png',
  'bundle/.',
  '%E0%A4%A',
]

/** A published version of a deck's history, published at `at`. */
export function historyVersion(id: number, at = id): HistoryEntry {
  return { kind: 'version', id, at, bytes: 1, publishedBy: 'ed', current: false }
}

/** A snapshot of a deck's draft, taken at `at`. */
export function historySnapshot(id: number, at = id, label: string | null = null): HistoryEntry {
  return { kind: 'snapshot', id, at, bytes: 1, authors: [], label }
}

/** The speaker view page of the installed reveal.js, held as a string literal in the module `useReveal.ts` imports. */
export function installedSpeakerView(): string {
  const module = readFileSync(createRequire(import.meta.url).resolve('reveal.js/plugin/notes/notes.esm.js'), 'utf8')
  return runInNewContext(/"(?:[^"\\]|\\.)*<\/html>"/.exec(module)![0]) as string
}

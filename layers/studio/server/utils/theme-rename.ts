import type { ContentChanges, StoredContent, StoredText } from '../db/ports'
import { editDraftUpdate } from '#shared/collab/ydoc'

/**
 * Where a deck's frontmatter declares its theme. The range lets a caller edit
 * the value in place: a plain string slice, or the Yjs text of a draft, where
 * an index-based edit keeps the history the editors merge with.
 */
export function themeValueRange(raw: string, expected: string): { index: number, length: number } | null {
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!block)
    return null

  let offset = raw.indexOf('\n') + 1
  for (const line of block[1]!.split('\n')) {
    const declared = line.match(/^theme\s*:[ \t]*/)
    if (declared) {
      const value = line.slice(declared[0].length).replace(/\s+$/, '')
      const quoted = value.match(/^(['"])([\s\S]*)\1$/)
      const index = offset + declared[0].length + (quoted ? 1 : 0)
      const text = quoted ? quoted[2]! : value
      return text === expected ? { index, length: text.length } : null
    }
    offset += line.length + 1
  }
  return null
}

/** The same markdown with its theme renamed, or null when it declares another one. */
export function renameTheme(raw: string, from: string, to: string): string | null {
  const range = themeValueRange(raw, from)
  return range ? raw.slice(0, range.index) + to + raw.slice(range.index + range.length) : null
}

/** What renaming a theme changes, each text and draft with its deck. */
export interface ThemeRename extends ContentChanges {
  themes: { slug: string, theme: string }[]
  versions: StoredText[]
  snapshots: StoredText[]
  drafts: { slug: string, ydoc: Uint8Array }[]
}

/**
 * What renaming a theme changes in the stored content: the `theme` column of
 * the decks naming it, and the frontmatter of their published versions,
 * snapshots and drafts. `only` limits it to these decks, for a deck that leaves
 * a brand behind while the others keep it. A draft is edited in its own Yjs
 * document, so the editors merge with it and keep their history.
 */
export function themeRenameChanges(content: StoredContent, from: string, to: string, only?: string[]): ThemeRename {
  const kept = (slug: string) => !only || only.includes(slug)
  const texts = (rows: StoredText[]) => rows.flatMap(({ id, slug, raw }) => {
    const renamed = kept(slug) ? renameTheme(raw, from, to) : null
    return renamed === null ? [] : [{ id, slug, raw: renamed }]
  })
  return {
    themes: content.decks.filter(deck => deck.theme === from && kept(deck.slug)).map(({ slug }) => ({ slug, theme: to })),
    versions: texts(content.versions),
    snapshots: texts(content.snapshots),
    drafts: content.drafts.filter(draft => kept(draft.slug)).flatMap(({ slug, ydoc }) => {
      const renamed = editDraftUpdate(ydoc, (text) => {
        const range = themeValueRange(text.toString(), from)
        if (!range)
          return false
        text.delete(range.index, range.length)
        text.insert(range.index, to)
        return true
      })
      return renamed ? [{ slug, ydoc: renamed }] : []
    }),
  }
}

/** A rename deck by deck, in slug order: what the script prints. */
export function themeRenameSummary(rename: ThemeRename): { slug: string, column: boolean, versions: number, snapshots: number, draft: boolean }[] {
  const slugs = [...new Set([...rename.themes, ...rename.versions, ...rename.snapshots, ...rename.drafts].map(row => row.slug))].sort()
  return slugs.map(slug => ({
    slug,
    column: rename.themes.some(row => row.slug === slug),
    versions: rename.versions.filter(row => row.slug === slug).length,
    snapshots: rename.snapshots.filter(row => row.slug === slug).length,
    draft: rename.drafts.some(row => row.slug === slug),
  }))
}

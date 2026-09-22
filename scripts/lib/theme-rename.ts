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

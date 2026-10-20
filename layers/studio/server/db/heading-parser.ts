/** Where to insert `parser: heading` in a deck that has no `parser` key, or null. */
export function headingParserInsertion(raw: string): { index: number, text: string } | null {
  if (!raw.trim())
    return null
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---')
    return { index: 0, text: '---\nparser: heading\n---\n\n' }
  let offset = lines[0]!.length + 1
  for (let n = 1; n < lines.length; n++) {
    const line = lines[n]!
    if (line.trim() === '---')
      return { index: offset, text: 'parser: heading\n' }
    if (/^parser\s*:/.test(line))
      return null
    offset += line.length + 1
  }
  // An unclosed frontmatter block: leave the deck as it is.
  return null
}

/** The deck with `parser: heading` written in, or null when it needs none. */
export function insertHeadingParser(raw: string): string | null {
  const insertion = headingParserInsertion(raw)
  return insertion ? raw.slice(0, insertion.index) + insertion.text + raw.slice(insertion.index) : null
}

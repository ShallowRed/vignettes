import { dump, load } from 'js-yaml'

/**
 * Read/write YAML frontmatter via a real library: parse → operate on objects →
 * serialize once, never by hand. Nested blocks (e.g. `reveal.margin`) are preserved.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export interface SplitDocument {
  /** Parsed frontmatter, full depth. Empty object when none. */
  data: Record<string, unknown>
  body: string
  hasFrontmatter: boolean
  /** The YAML parser's message when the block does not parse; `data` is then empty. */
  yamlError?: string
  /** The 1-based line of the document where the YAML parser stops, inside the block. */
  yamlErrorLine?: number
}

/** The leading frontmatter block as written, its `---` lines included; an empty string without one. */
export function frontmatterSource(markdown: string): string {
  return FRONTMATTER_RE.exec(markdown)?.[0] ?? ''
}

/** The number of lines of the leading frontmatter block, its `---` lines included; 0 without one. */
export function frontmatterLineCount(markdown: string): number {
  const block = frontmatterSource(markdown)
  if (!block)
    return 0
  const lines = block.split('\n').length
  return block.endsWith('\n') ? lines - 1 : lines
}

/**
 * Whether the text opens a frontmatter block that no line closes yet, as while
 * it is typed: a first line `---` and no later line that starts with `---`,
 * which `FRONTMATTER_RE` would read as a closing line.
 */
export function isFrontmatterUnclosed(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/)
  return lines[0] === '---' && !lines.slice(1).some(line => line.startsWith('---'))
}

const KEY_LINE_RE = /^\s*([\w.-]+)\s*:/
const HEADING_RE = /^#{1,6}\s/

/**
 * The 1-based line of a heading inside the frontmatter block: the block then
 * lacks its closing line and runs to the first slide break. `#` lines with a
 * key right under them read as a YAML comment.
 */
export function unclosedFrontmatterLine(markdown: string): number | undefined {
  const lines = frontmatterSource(markdown).replace(/\r?\n$/, '').split(/\r?\n/).slice(1, -1)
  for (let index = 0; index < lines.length; index++) {
    if (!HEADING_RE.test(lines[index]!))
      continue
    let next = index + 1
    while (next < lines.length && HEADING_RE.test(lines[next]!))
      next++
    if (!(next < lines.length && KEY_LINE_RE.test(lines[next]!)))
      return index + 2
    index = next
  }
  return undefined
}

/** A key written at the start of a line of the frontmatter block. */
export interface FrontmatterKeyLine {
  /** The key, after the keys of the lines it is nested under: `['reveal', 'width']`. */
  path: string[]
  /** 1-based line in the whole document. */
  line: number
  /** 0-based column of the key, its indentation, and length of the key. */
  column: number
  length: number
}

/**
 * The keys written in the closed frontmatter block of `markdown`. An indented
 * key is nested under the nearest line above with less indentation; when that
 * line writes no key, as a list item or a comment, the key is left out.
 */
export function frontmatterKeyLines(markdown: string): FrontmatterKeyLine[] {
  const lines = markdown.split(/\r?\n/).slice(1, Math.max(frontmatterLineCount(markdown) - 1, 0))
  const keys: FrontmatterKeyLine[] = []
  // The nearest non-blank line above, by indentation: its key line, undefined for a line without a key.
  const above: Array<{ indent: number, key?: FrontmatterKeyLine }> = []
  for (const [index, text] of lines.entries()) {
    if (!text.trim())
      continue
    const indent = text.length - text.trimStart().length
    while (above.length && above.at(-1)!.indent >= indent)
      above.pop()
    const match = KEY_LINE_RE.exec(text)
    const parent = above.at(-1)
    const key = match && (!indent || parent?.key)
      ? { path: [...(indent ? parent!.key!.path : []), match[1]!], line: index + 2, column: indent, length: match[1]!.length }
      : undefined
    if (key)
      keys.push(key)
    above.push({ indent, key })
  }
  return keys
}

export function splitFrontmatter(markdown: string): SplitDocument {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match)
    return { data: {}, body: markdown, hasFrontmatter: false }

  const yaml = match[1] ?? ''
  let data: Record<string, unknown> = {}
  const body = markdown.slice(match[0].length)
  try {
    const parsed = load(yaml)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      data = parsed as Record<string, unknown>
  }
  catch (error: any) {
    // The block starts on line 2; its last line is the one above the closing `---`.
    const yamlErrorLine = Math.min(frontmatterLineCount(markdown) - 1, Math.max(2, (error?.mark?.line ?? 0) + 2))
    return { data, body, hasFrontmatter: true, yamlError: String(error?.message || error), yamlErrorLine }
  }
  return { data, body, hasFrontmatter: true }
}

/** Return the body with any leading frontmatter block removed. */
export function stripFrontmatter(markdown: string): string {
  return splitFrontmatter(markdown).body
}

/** Serialize a frontmatter object to YAML (no fences). */
export function serializeFrontmatter(data: Record<string, unknown>): string {
  return dump(data, { lineWidth: -1, noRefs: true, skipInvalid: true })
}

/** Re-assemble to the on-the-wire shape `---\n<yaml>---\n\n<body>`. */
export function stringifyDocument(data: Record<string, unknown>, body: string): string {
  const hasKeys = Object.keys(data).length > 0
  if (!hasKeys)
    return body
  return `---\n${serializeFrontmatter(data)}---\n\n${body}`
}

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

const KEY_LINE_RE = /^\s*[\w.-]+\s*:/
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

export function splitFrontmatter(markdown: string): SplitDocument {
  const match = markdown.match(FRONTMATTER_RE)
  if (!match)
    return { data: {}, body: markdown, hasFrontmatter: false }

  const yaml = match[1] ?? ''
  let data: Record<string, unknown> = {}
  let yamlError: string | undefined
  try {
    const parsed = load(yaml)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      data = parsed as Record<string, unknown>
  }
  catch (error: any) {
    yamlError = String(error?.message || error)
    console.warn('[frontmatter] failed to parse YAML block:', yamlError)
  }
  return { data, body: markdown.slice(match[0].length), hasFrontmatter: true, ...(yamlError ? { yamlError } : {}) }
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

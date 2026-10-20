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

import { splitFrontmatter, stringifyDocument } from '@vignettes/core/deck'

/**
 * Gives the text the preview renders. While the header does not parse, the
 * preview keeps the last header that did, on the body as typed, except its
 * parser: the editor reads the header of the text as empty, and both split
 * the slides with the default parser.
 */
export function previewSourceReader(): (text: string) => string {
  let kept: Record<string, unknown> = {}
  return (text) => {
    const { data, body, yamlError } = splitFrontmatter(text)
    if (!yamlError) {
      const { parser, ...rest } = data
      kept = rest
      return text
    }
    return stringifyDocument(kept, body)
  }
}

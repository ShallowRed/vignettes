import { isDeckSlug } from '@vignettes/core/deck'
import { CliError } from './messages.ts'

/**
 * Checks the slugs of a command: each one a deck slug, without two that differ
 * by case alone, which a file system of macOS takes for one file. `sources`
 * gives where each slug comes from, for the message of an invalid slug.
 */
export function checkSlugs(slugs: readonly string[], sources: readonly string[] = slugs): void {
  const seen = new Set<string>()
  for (const [index, slug] of slugs.entries()) {
    if (!isDeckSlug(slug))
      throw new CliError('invalid-slug', sources[index]!, slug)
    if (seen.has(slug.toLowerCase()))
      throw new CliError('duplicate-slug', slug)
    seen.add(slug.toLowerCase())
  }
}

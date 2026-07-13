import type { PublicationStatus } from '../access/status'
import { PublicationStatusSchema } from '../access/status'
import { splitFrontmatter } from './frontmatter'

/** Closed default: a missing/invalid status MUST fail closed. Never default more open. */
export const DEFAULT_STATUS: PublicationStatus = 'private'

/**
 * Derive publication status from markdown. Precedence: frontmatter `status:`,
 * legacy `access:` alias, `folderHint`, then the closed {@link DEFAULT_STATUS}.
 */
export function resolveDeckStatus(content: string, folderHint?: string): PublicationStatus {
  const data = splitFrontmatter(content).data as Record<string, unknown>
  const declared = data.status ?? data.access
  const parsed = PublicationStatusSchema.safeParse(declared)
  if (parsed.success)
    return parsed.data
  const hinted = PublicationStatusSchema.safeParse(folderHint)
  return hinted.success ? hinted.data : DEFAULT_STATUS
}

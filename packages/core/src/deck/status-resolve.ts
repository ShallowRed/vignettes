import type { PublicationStatus } from '../status.ts'
import { PublicationStatusSchema } from '../status.ts'
import { splitFrontmatter } from './frontmatter.ts'

/** Closed default: a missing/invalid status MUST fail closed. Never default more open. */
export const DEFAULT_STATUS: PublicationStatus = 'private'

/**
 * The keys of the front matter that set the access of a deck whose row is not
 * managed: its status, the earlier name of the status, whether the public
 * catalog leaves it out, and its password.
 */
export const ACCESS_KEYS = { status: 'status', earlierStatus: 'access', unlisted: 'unlisted', password: 'accessPassword' } as const

/**
 * Derive publication status from markdown. Precedence: frontmatter `status:`,
 * legacy `access:` alias, `folderHint`, then the closed {@link DEFAULT_STATUS}.
 */
export function resolveDeckStatus(content: string, folderHint?: string): PublicationStatus {
  const data = splitFrontmatter(content).data as Record<string, unknown>
  const declared = data[ACCESS_KEYS.status] ?? data[ACCESS_KEYS.earlierStatus]
  const parsed = PublicationStatusSchema.safeParse(declared)
  if (parsed.success)
    return parsed.data
  const hinted = PublicationStatusSchema.safeParse(folderHint)
  return hinted.success ? hinted.data : DEFAULT_STATUS
}

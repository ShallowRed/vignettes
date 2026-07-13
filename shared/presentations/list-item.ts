import type { Lifecycle, PublicationStatus } from '../access/status'

// Canonical wire contract between GET /api/presentations and the home/admin pages.
export interface PresentationListItem {
  slug: string
  title: string
  theme: string
  status: PublicationStatus
  filename: string
  /** Frontmatter `project:` slug — the catalog's grouping axis. */
  project?: string
  /** Hidden from the catalog for non-privileged actors. */
  unlisted?: boolean
  /** Link to `/p/<alias>` when present. */
  alias?: string
  /** frozen/archived serve a static bundle. */
  lifecycle?: Lifecycle
}

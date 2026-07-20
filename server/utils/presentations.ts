/**
 * Access to the `presentations/` git content, read through Nitro server assets
 * (`useStorage('assets:presentations')`) so it resolves regardless of the process
 * working directory. This is the exported archive: the only runtime reader is the
 * `content-import` admin tool, which seeds the database from it on demand. Serving
 * never touches these files — the database is the runtime source of truth.
 */

import type { PublicationStatus } from '#shared/access'
import { PUBLICATION_STATUSES } from '#shared/access'

// Local re-export (not a bare `export … from`) so it survives Nitro's bundling.
export type { PublicationStatus }
export { PUBLICATION_STATUSES }

export function presentationsStorage() {
  return useStorage('assets:presentations')
}

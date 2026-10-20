import type { ArchivedDeckAxes, ArchiveWrite, ContentArchive } from '../db/ports'
import { isAccessPasswordHash } from '#shared/access/password-shape'
import { resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'

/** A stub of the content space, sent by `content:push`. */
export interface PushedStub {
  slug: string
  raw: string
  /** The `registry.yml` entry naming the deck. */
  registry: { alias: string, lifecycle: string, frozenBundle: string | null } | null
  /** Create the deck outside the catalog, whatever its frontmatter says. */
  unlisted: boolean
}

export type PushAction = 'create' | 'republish' | 'identical' | 'trashed'

export interface PushResult {
  slug: string
  action: PushAction
  /** The folder the frontmatter names when the instance has none of that slug. */
  folderMissing: string | null
}

/**
 * Pushes stubs into the archive, or with `apply` false says what it would do.
 * A deck the instance does not know is created managed, its access axes read
 * from the frontmatter (status defaults to private, fail closed). A deck it
 * knows gets a new published version, and its title and theme follow the file,
 * access axes untouched, as a publish from the editor does. A registry entry
 * sets the alias, the lifecycle and the frozen bundle. A trashed deck is
 * refused, and an identical text changes nothing.
 */
export async function pushStubs(archive: ContentArchive, stubs: PushedStub[], { apply }: { apply: boolean }): Promise<PushResult[]> {
  const decks = new Map((await archive.decks()).map(deck => [deck.slug, deck]))
  const projects = new Set((await archive.projects()).map(project => project.slug))
  const results: PushResult[] = []
  const writes: ArchiveWrite[] = []

  for (const { slug, raw, registry, unlisted } of stubs) {
    const meta = splitFrontmatter(raw).data as Record<string, unknown>
    const accessPassword = (meta.accessPassword as string | undefined) ?? null
    // The column holds the scrypt output of `hashAccessPassword`, so a plaintext
    // password here would lock the deck for everyone.
    if (accessPassword !== null && !isAccessPasswordHash(accessPassword))
      throw new Error(`${slug}: accessPassword is not a \`salt:hash\` produced by the application`)
    const title = (meta.title as string | undefined) ?? null
    const theme = (meta.theme as string | undefined) ?? null
    const project = (meta.project as string | undefined) ?? null

    const row = decks.get(slug)
    const action: PushAction = row ? (row.trashed ? 'trashed' : row.raw === raw ? 'identical' : 'republish') : 'create'
    results.push({ slug, action, folderMissing: project && !projects.has(project) ? project : null })
    if (action === 'trashed' || action === 'identical')
      continue

    const axes: ArchivedDeckAxes = action === 'create'
      ? { title: title ?? slug, status: resolveDeckStatus(raw), lifecycle: 'live', project, theme, accessPasswordHash: accessPassword, unlisted: Boolean(meta.unlisted) || unlisted }
      : { ...(title !== null && { title }), ...(theme !== null && { theme }) }
    if (registry)
      Object.assign(axes, registry)
    writes.push({ kind: 'deck', slug, axes }, { kind: 'version', slug, raw })
  }

  if (apply && writes.length)
    await archive.apply(writes, { by: 'content-push', at: new Date() })
  return results
}

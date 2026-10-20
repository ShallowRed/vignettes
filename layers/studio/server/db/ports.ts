import type { DeckGrant, Lifecycle, PublicationStatus, UserStore } from '#shared/access'
import type { PublishedEntry, PublishedEntryDetail } from '#shared/presentations'
import type { Project, ProjectDirectory } from '#shared/projects'
import type { ContentSource, ContentWriter, DeckDirectory, DraftStore } from '@vignettes/core/deck'

/**
 * The storage ports: one interface per store, and `Stores`, the set an adapter
 * provides. Every method returns a promise, and an operation that must be atomic
 * is one method, which the adapter runs in one transaction. An adapter lives in
 * `server/db/<driver>/`, and `server/db/open.ts` opens it.
 */

/** The published versions of the decks: the content ports, plus the date of the served version. */
export interface DeckContent {
  source: ContentSource
  /** `save` publishes: one new version, and the deck row derived from its frontmatter. */
  writer: ContentWriter
  /** When the served version was published; null when the deck has none. */
  publishedAt: (slug: string) => Promise<Date | null>
}

/**
 * Deck catalog/access metadata read from the database, the truth for `managed`
 * rows (published or admin-edited). Draft-only anchor rows are reported
 * unmanaged so file frontmatter keeps authority over them.
 */
export interface DeckMetaRecord {
  slug: string
  title: string
  status: PublicationStatus
  lifecycle: Lifecycle
  theme?: string
  project?: string
  alias?: string
  frozenBundle?: string
  accessPasswordHash?: string
  unlisted: boolean
  family?: string
  variantLabel?: string
  supersededBy?: string
  managed: boolean
  published: boolean
}

/**
 * What {@link DeckMetaStore.update} accepts. The fields a deck may drop take
 * `null` to clear the column, where the record reports them absent.
 */
export type DeckMetaPatch = Partial<
  Pick<DeckMetaRecord, 'title' | 'status' | 'lifecycle' | 'unlisted'>
  & Record<'project' | 'theme' | 'alias' | 'frozenBundle' | 'accessPasswordHash' | 'family' | 'variantLabel' | 'supersededBy', string | null>
>

export interface DeckMetaStore {
  /** The live deck; null when it has no row or is in the trash. */
  get: (slug: string) => Promise<DeckMetaRecord | null>
  /** True if the slug is taken by any row, trashed included: the create guard. */
  existsIncludingTrashed: (slug: string) => Promise<boolean>
  /**
   * True when a row exists for this slug and it is in the trash. The write
   * guard: `get()` returns null both for a brand-new deck (editable) and a
   * trashed one (not), so edit paths need this to tell them apart.
   */
  isTrashed: (slug: string) => Promise<boolean>
  listManaged: () => Promise<DeckMetaRecord[]>
  /** Trashed decks (soft-deleted), for the corbeille listing. */
  listTrashed: () => Promise<DeckMetaRecord[]>
  /**
   * Admin metadata edit, the second way a deck becomes `managed` (its row
   * turns into the metadata truth, shadowing file frontmatter).
   */
  update: (slug: string, patch: DeckMetaPatch) => Promise<DeckMetaRecord>
  /** Move a deck to the trash (reversible). Returns false when nothing existed. */
  softDelete: (slug: string) => Promise<boolean>
  /** Bring a trashed deck back. Returns false when nothing was trashed. */
  restore: (slug: string) => Promise<boolean>
  /**
   * Erase every database trace of a deck: grants, redirect aliases, draft,
   * media keys, snapshots, versions, then the row itself, in one transaction.
   * Returns false when nothing existed. This is permanent: the "empty the
   * trash" primitive.
   */
  purge: (slug: string) => Promise<boolean>
  /** The project a deck row is filed in, trashed rows included; null without one. */
  projectOf: (slug: string) => Promise<string | null>
  /** The project of every deck row, trashed rows included, by slug. */
  projectsBySlug: () => Promise<Map<string, string | null>>
}

/** A trashed project plus how many of its decks were trashed with it. */
export interface TrashedProject extends Project {
  deletedAt: Date
  deckCount: number
}

export interface ProjectInput {
  title: string
  color?: string | null
  icon?: string | null
  /** Validated by the caller (shape and uniqueness); derived from the title when absent. */
  slug?: string
}

export interface ProjectPatch {
  title?: string
  color?: string | null
  icon?: string | null
  order?: number
}

/**
 * Project lifecycle writes (create / rename / trash / restore / purge). The read
 * side is the {@link ProjectDirectory}, which leaves trashed rows out. A project
 * owns its decks: trash, restore and purge cascade to them in the same
 * transaction, so a folder and its decks are never split across states.
 */
export interface ProjectStore {
  /** Creates the project last in the order, its slug derived from the title when none is given. */
  create: (input: ProjectInput) => Promise<Project>
  /** True if any project row (trashed included) already owns this slug. */
  slugExists: (slug: string) => Promise<boolean>
  /** True if a live (not trashed) project owns this slug: a deck may be filed there. */
  isLive: (slug: string) => Promise<boolean>
  /**
   * Change a project's slug, cascading to its decks and grants, in one
   * transaction. Assumes `newSlug` is validated and free. Old
   * `/projects/<oldSlug>` links stop resolving. Null when the project is unknown.
   */
  rename: (oldSlug: string, newSlug: string) => Promise<Project | null>
  update: (slug: string, patch: ProjectPatch) => Promise<Project | null>
  /** Live deck slugs in this project, for guards (e.g. open collab sessions). */
  liveDeckSlugs: (slug: string) => Promise<string[]>
  /** Every deck slug filed in this project, trashed ones included. */
  deckSlugs: (slug: string) => Promise<string[]>
  /** Trash the project and every live deck it holds. */
  softDelete: (slug: string) => Promise<boolean>
  /** Restore the project and every deck currently trashed under it. */
  restore: (slug: string) => Promise<boolean>
  listTrashed: () => Promise<TrashedProject[]>
  /** Permanent: hard-delete the project, its grants, and all its decks. */
  purge: (slug: string) => Promise<boolean>
}

/** A grant as the sharing panels list it. */
export interface GrantRecord {
  userId: number
  login: string
  role: DeckGrant
  grantedBy: string
  createdAt: Date
  /** The account was pre-provisioned by invitation and never logged in. */
  invited: boolean
  /** Null = permanent. In the past = expired (listed for the owner, never resolved). */
  expiresAt: Date | null
}

/**
 * Grants on one scope (a deck, a project), one per (scope, user). An expired
 * grant resolves to nothing and stays listed so the owner can extend or drop it.
 * An invalid stored grant degrades to view-only.
 */
export interface GrantStore {
  get: (scope: string, userId: number) => Promise<DeckGrant | null>
  /** scope → grant, for catalog visibility in one lookup. */
  listForUser: (userId: number) => Promise<Map<string, DeckGrant>>
  /** Upserts the grant; a scope with no row yet gets one first, in the same transaction. */
  set: (scope: string, userId: number, role: DeckGrant, grantedBy: string, expiresAt?: Date | null) => Promise<void>
  remove: (scope: string, userId: number) => Promise<void>
}

/** Per-deck grants, escalating a user beyond their global role. */
export interface DeckGrantStore extends GrantStore {
  listForDeck: (slug: string) => Promise<GrantRecord[]>
}

/** Project grants: a master key over every deck in the project. */
export interface ProjectGrantStore extends GrantStore {
  listForProject: (projectSlug: string) => Promise<GrantRecord[]>
}

/** The publications of a deck, newest first, and the markdown of one of them. */
export interface VersionHistory {
  list: (slug: string) => Promise<PublishedEntry[]>
  /** Null when the version does not exist or belongs to another deck. */
  load: (slug: string, id: number) => Promise<PublishedEntryDetail | null>
}

/** A draft snapshot without its text. */
export interface DraftSnapshotSummary {
  id: number
  /** When it was taken, in milliseconds. */
  createdAt: number
  authors: string[]
  label: string | null
  /** Size of the markdown, in bytes. */
  bytes: number
}

export interface DraftSnapshot extends DraftSnapshotSummary {
  raw: string
}

export interface SnapshotInput {
  raw: string
  authors: string[]
  label?: string | null
  at?: Date
}

/** The draft snapshots of a deck. */
export interface SnapshotStore {
  /** The most recent snapshot, with its text, to tell whether the draft moved. */
  latest: (slug: string) => Promise<DraftSnapshot | null>
  /** Inserts a snapshot, then prunes the deck's older ones (`snapshotsToDrop`). Returns the new id. */
  add: (slug: string, input: SnapshotInput) => Promise<number>
  /** Newest first. */
  list: (slug: string) => Promise<DraftSnapshotSummary[]>
  /** Null when the snapshot does not exist or belongs to another deck. */
  load: (slug: string, id: number) => Promise<DraftSnapshot | null>
}

/**
 * Which decks reference an uploaded image. Rows are only added: a deck that once
 * referenced an image keeps its row. The deck the image was uploaded to governs
 * it, so citing an image in a second deck records the reuse without widening who
 * may open it.
 */
export interface MediaIndex {
  /** Records the upload of these images to this deck, which then governs them. */
  record: (deckSlug: string, names: string[]) => Promise<void>
  recordFromMarkdown: (deckSlug: string, raw: string) => Promise<void>
  /** The decks whose access rules govern this image. */
  decksFor: (mediaName: string) => Promise<string[]>
}

/** A deck with a published version, and the dates the catalog shows. */
export interface PublishedDeckDates {
  slug: string
  versionId: number
  updatedAt: Date
  publishedAt: Date
  /** Last draft save; null without a draft. */
  draftSavedAt: Date | null
}

/** The reads of the catalog that span several stores. */
export interface CatalogStore {
  /** slug → number of grants on the deck, expired ones included. */
  deckGrantCounts: () => Promise<Map<string, number>>
  /** project slug → number of grants on the project, expired ones included. */
  projectGrantCounts: () => Promise<Map<string, number>>
  /** Decks whose draft was saved at or after the publication of their served version. */
  draftsSincePublish: () => Promise<string[]>
  /** Every deck with a published version, trashed ones included. */
  publishedDecks: () => Promise<PublishedDeckDates[]>
  /** The markdown of these versions; an unknown id is left out. */
  versionTexts: (ids: number[]) => Promise<{ id: number, raw: string }[]>
}

/** A deck row as the content scripts exchange it with git and other instances. */
export interface ArchivedDeck {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  frozenBundle: string | null
  accessPasswordHash: string | null
  unlisted: boolean
  family: string | null
  variantLabel: string | null
  supersededBy: string | null
  managed: boolean
  trashed: boolean
  /** The markdown of the served version; null when the deck has none. */
  raw: string | null
}

export interface ArchivedProject {
  slug: string
  title: string
  order: number
  color: string | null
}

/** The deck columns a script may write; a column left out keeps its value. */
export type ArchivedDeckAxes = Partial<Pick<ArchivedDeck, 'title' | 'status' | 'lifecycle' | 'project' | 'theme' | 'alias' | 'frozenBundle' | 'accessPasswordHash' | 'unlisted'>>

/**
 * One write of {@link ContentArchive.apply}. `project` creates the project or
 * updates its title, order and color. `deck` creates the deck (titled by its slug
 * when `axes` has no title) or updates these columns, and marks the row managed.
 * `version` adds a published version that the deck then serves. `alias` records
 * a historical path, and leaves an alias already recorded as it is.
 */
export type ArchiveWrite
  = | { kind: 'project', project: ArchivedProject }
    | { kind: 'deck', slug: string, axes: ArchivedDeckAxes }
    | { kind: 'version', slug: string, raw: string }
    | { kind: 'alias', alias: string, slug: string }

/**
 * The rows the content scripts read and write: `content-import` and
 * `content-export` between the database and git, `content-pull` from another
 * instance, `freeze` for the deck it bundles.
 */
export interface ContentArchive {
  /** Every deck row, trashed ones included, by slug. */
  decks: () => Promise<ArchivedDeck[]>
  /** Every project row, trashed ones included, by order then slug. */
  projects: () => Promise<ArchivedProject[]>
  /** Every historical alias, by alias. */
  aliases: () => Promise<{ alias: string, slug: string }[]>
  /** Applies the writes in their order, in one transaction; `by` signs the versions, `at` dates every write. */
  apply: (writes: ArchiveWrite[], stamp: { by: string, at: Date }) => Promise<void>
}

/** What an adapter provides: every store, over one database. */
export interface Stores {
  content: DeckContent
  versionHistory: VersionHistory
  deckMeta: DeckMetaStore
  deckDirectory: DeckDirectory
  projectDirectory: ProjectDirectory
  projects: ProjectStore
  deckGrants: DeckGrantStore
  projectGrants: ProjectGrantStore
  users: UserStore
  drafts: DraftStore
  snapshots: SnapshotStore
  mediaIndex: MediaIndex
  catalog: CatalogStore
  archive: ContentArchive
}

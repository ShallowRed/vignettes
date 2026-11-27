import { ACCESS_KEYS, resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'

/** The access axes of a deck row, as its columns hold them: who opens the deck, whether the public catalog lists it, and its folder. */
export interface AccessAxes {
  status: string
  unlisted: boolean
  accessPasswordHash: string | null
  project: string | null
}

/** The deck row a publication reads before it writes. */
export interface PublicationRow extends AccessAxes {
  managed: boolean
  publishedVersionId: number | null
}

export interface PublicationAccessOptions {
  /** The publisher may set the access of a row that is not managed from its text: a global role or the content token. */
  accessFromText: boolean
  /** The text of the published version of the row, when {@link readsPublishedText} asks for it. */
  publishedRaw?: string | null
}

/**
 * Whether {@link publicationAccess} needs the text of the published version:
 * for a row that is not managed, has a published version, and whose publisher
 * may not set its access from the text.
 */
export function readsPublishedText(current: PublicationRow | undefined, { accessFromText }: Pick<PublicationAccessOptions, 'accessFromText'>): current is PublicationRow & { publishedVersionId: number } {
  return !accessFromText && current !== undefined && !current.managed && current.publishedVersionId !== null
}

/**
 * The access axes a publication of `raw` gives a deck row. A managed row is the
 * truth for its access, so a stale `status` or `project` in the text neither
 * reopens a closed deck nor undoes a move of its folder. A row that is not
 * managed takes the axes of the text when its publisher may set them. For any
 * other publisher the text sets none: the deck keeps the status and the password
 * that `gateOptionsOf` serves before the publication, those of its published
 * text, and the folder and `unlisted` of its row; a deck without a published
 * version, or without a row, turns private.
 */
export function publicationAccess(current: PublicationRow | undefined, raw: string, { accessFromText, publishedRaw }: PublicationAccessOptions): AccessAxes {
  if (current?.managed)
    return { status: current.status, unlisted: current.unlisted, accessPasswordHash: current.accessPasswordHash, project: current.project }
  if (accessFromText) {
    const meta = splitFrontmatter(raw).data as Record<string, unknown>
    return {
      status: resolveDeckStatus(raw),
      unlisted: Boolean(meta[ACCESS_KEYS.unlisted]),
      accessPasswordHash: (meta[ACCESS_KEYS.password] as string) ?? null,
      project: (meta.project as string) ?? null,
    }
  }
  if (readsPublishedText(current, { accessFromText })) {
    const published = publishedRaw ?? ''
    return {
      status: resolveDeckStatus(published),
      unlisted: current.unlisted,
      accessPasswordHash: (splitFrontmatter(published).data[ACCESS_KEYS.password] as string) ?? null,
      project: current.project,
    }
  }
  return { status: 'private', unlisted: false, accessPasswordHash: null, project: current?.project ?? null }
}

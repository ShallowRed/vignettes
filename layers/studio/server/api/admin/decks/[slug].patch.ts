import { DeckMetaPatchSchema, familyFolder, replacementLoops } from '#shared/presentations'
import { isDeckSlug } from '@vignettes/core/deck'
import { assertPrivileged } from '../../../utils/access'
import { hashAccessPassword } from '../../../utils/password'
import { securityLog } from '../../../utils/security-log'
import { useDeckMeta, useProjectStore } from '../../../utils/sources'

/**
 * PATCH /api/admin/decks/:slug — edit a deck's catalog/access metadata. Makes
 * the database row the metadata truth (`managed`), shadowing file frontmatter
 * and the yaml registry entry for this deck.
 */
export default defineEventHandler(async (event) => {
  const { login } = await assertPrivileged(event)

  const slug = getRouterParam(event, 'slug')
  if (!slug || !isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug' })
  }

  // update() upserts (a file-backed deck gains its managed row here), but a
  // trashed deck must stay absent until restored rather than be edited back.
  if (await useDeckMeta().isTrashed(slug)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const parsed = DeckMetaPatchSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: `Invalid patch: ${parsed.error.issues.map(i => i.path.join('.') || i.message).join(', ')}` })
  }

  // A deck filed under a slug with no folder would show as a folder nobody can
  // manage. A deck already there, published before its folder was created,
  // keeps it: the refusal is for a move.
  if (parsed.data.project && !await useProjectStore().isLive(parsed.data.project)
    && (await useDeckMeta().get(slug))?.project !== parsed.data.project) {
    throw createError({ statusCode: 400, statusMessage: `No folder "${parsed.data.project}"` })
  }

  // A replacement names a live deck, and never a deck this one already
  // replaces; a family stays inside one folder, whether the patch names the
  // family or moves the deck to another folder.
  const { supersededBy, family, project } = parsed.data
  if (supersededBy || family || project !== undefined) {
    const decks = await useDeckMeta().listManaged()
    const current = decks.find(d => d.slug === slug)
    if (supersededBy) {
      if (!decks.some(d => d.slug === supersededBy))
        throw createError({ statusCode: 400, statusMessage: `No deck "${supersededBy}"` })
      if (replacementLoops(slug, supersededBy, decks))
        throw createError({ statusCode: 400, statusMessage: 'A deck cannot be replaced by itself or by a deck it replaces' })
    }
    const familyAfter = family !== undefined ? family : current?.family ?? null
    if (familyAfter) {
      const projectAfter = project !== undefined ? project : current?.project ?? null
      const folder = familyFolder(familyAfter, slug, decks)
      if (folder !== undefined && folder !== projectAfter)
        throw createError({ statusCode: 400, statusMessage: `The family "${familyAfter}" belongs to another folder` })
    }
  }

  // null clears an optional column; undefined leaves it untouched.
  const { accessPassword, ...rest } = parsed.data
  const patch: Record<string, unknown> = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  )
  if (accessPassword !== undefined)
    patch.accessPasswordHash = accessPassword === null ? null : await hashAccessPassword(accessPassword)

  const updated = await useDeckMeta().update(slug, patch)
  if (accessPassword !== undefined)
    securityLog(event, 'deck-password-change', { deck: slug, password: accessPassword === null ? 'removed' : 'set' }, login)
  return updated
})

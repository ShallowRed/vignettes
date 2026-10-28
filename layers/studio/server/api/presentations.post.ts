import type { z } from 'zod'
import { markdownToYDocUpdate } from '#shared/collab/ydoc'
import { CreateDeckSchema } from '#shared/presentations'
import { isDeckSlug, onlyTitleMissing, readDeckFile } from '@vignettes/core/deck'
import { assertCanCreateInProject } from '../utils/access'
import { useDraftStore } from '../utils/collab'
import { useDeckMeta, useProjectStore } from '../utils/sources'
import { creationDraft, deckFromTemplate, DEFAULT_TEMPLATE, loadTemplate } from '../utils/templates'

type CreateInput = z.infer<typeof CreateDeckSchema>

/** The deck's first draft and the title and theme its row takes. */
async function startingDeck(input: CreateInput): Promise<{ raw: string, title: string, theme?: string }> {
  if ('raw' in input) {
    // A title typed in the form completes a file that lacks a valid title alone, as the form reads it.
    if (input.title) {
      const reading = readDeckFile(input.raw)
      if (reading.valid || !onlyTitleMissing(reading.issues))
        throw createError({ statusCode: 400, statusMessage: 'The title of an imported file comes from its frontmatter' })
    }
    const raw = input.title ? creationDraft(input.raw, { title: input.title }) : input.raw
    const reading = readDeckFile(raw)
    if (!reading.valid) {
      const keys = reading.issues.map(issue => issue.key || 'frontmatter').join(', ')
      throw createError({ statusCode: 400, statusMessage: `Invalid frontmatter: ${keys}`, data: { issues: reading.issues } })
    }
    return { raw: creationDraft(raw, { project: input.project }), title: reading.meta.title, theme: reading.meta.theme }
  }
  const template = await loadTemplate(input.template ?? DEFAULT_TEMPLATE)
  if (template === null)
    throw createError({ statusCode: 400, statusMessage: `No template "${input.template}"` })
  return { raw: deckFromTemplate(template, input), title: input.title, theme: input.theme }
}

/**
 * POST /api/presentations: create a deck entirely in the database, a first
 * draft plus a managed private row. Privileged roles create anywhere; a
 * collaborator holding an `editor` grant on a folder may create inside that
 * folder (`assertCanCreateInProject`).
 */
export default defineEventHandler(async (event) => {
  const parsed = CreateDeckSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { slug, title, project?, theme?, template? } or { slug, raw, title?, project? }' })
  }
  const { slug, project } = parsed.data

  await assertCanCreateInProject(event, project)
  if (project && !await useProjectStore().isLive(project))
    throw createError({ statusCode: 400, statusMessage: `No folder "${project}"` })
  if (!isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug (letters, digits, dashes, underscores)' })
  }

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }

  const deck = await startingDeck(parsed.data)

  if (await useDeckMeta().existsIncludingTrashed(slug)) {
    throw createError({ statusCode: 409, statusMessage: `A deck "${slug}" already exists (it may be in the trash)` })
  }

  await drafts.save(slug, markdownToYDocUpdate(deck.raw))
  const meta = await useDeckMeta().update(slug, {
    title: deck.title,
    status: 'private',
    ...(project ? { project } : {}),
    ...(deck.theme ? { theme: deck.theme } : {}),
  })

  setResponseStatus(event, 201)
  return meta
})

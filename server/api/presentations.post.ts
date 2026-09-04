import { isDeckSlug } from '#shared/deck'
import { markdownToYDocUpdate } from '#shared/deck/ydoc'
import { z } from 'zod'
import { assertCanCreateInProject } from '../utils/access'
import { useDraftStore } from '../utils/collab'
import { useDeckMeta } from '../utils/sources'

const CreateSchema = z.object({
  slug: z.string().min(1),
  title: z.string().trim().min(1),
  project: z.string().min(1).optional(),
  theme: z.string().min(1).optional(),
}).strict()

/** Starter markdown for a new deck; the frontmatter mirrors the row for rendering. */
function starterMarkdown(input: { title: string, theme?: string, project?: string }): string {
  const frontmatter = [
    `title: ${JSON.stringify(input.title)}`,
    ...(input.theme ? [`theme: ${input.theme}`] : []),
    ...(input.project ? [`project: ${input.project}`] : []),
  ]
  return `---\n${frontmatter.join('\n')}\n---\n\n# ${input.title}\n\n---\n\n## Première section\n\nContenu de la diapositive.\n`
}

/**
 * POST /api/presentations: create a deck entirely in the database, a starter
 * draft plus a managed private row. Privileged roles create anywhere; a
 * collaborator holding an `editor` grant on a folder may create inside that
 * folder (`assertCanCreateInProject`).
 */
export default defineEventHandler(async (event) => {
  const parsed = CreateSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Body must be { slug, title, project?, theme? }' })
  }
  const { slug, title, project, theme } = parsed.data

  await assertCanCreateInProject(event, project)
  if (!isDeckSlug(slug)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid slug (letters, digits, dashes, underscores)' })
  }

  const drafts = useDraftStore()
  if (!drafts.isWritable()) {
    throw createError({ statusCode: 503, statusMessage: 'Draft storage is unavailable on this deployment' })
  }

  if (await useDeckMeta().existsIncludingTrashed(slug)) {
    throw createError({ statusCode: 409, statusMessage: `A deck "${slug}" already exists (it may be in the trash)` })
  }

  await drafts.save(slug, markdownToYDocUpdate(starterMarkdown({ title, theme, project })))
  const meta = await useDeckMeta().update(slug, {
    title,
    status: 'private',
    ...(project ? { project } : {}),
    ...(theme ? { theme } : {}),
  })

  setResponseStatus(event, 201)
  return meta
})

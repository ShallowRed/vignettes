import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')

  if (!slug) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Slug parameter is required',
    })
  }

  try {
    const filePath = join(process.cwd(), 'presentations', `${slug}.md`)
    const content = await readFile(filePath, 'utf-8')

    return {
      content,
    }
  }
  catch (error) {
    throw createError({
      statusCode: 404,
      statusMessage: `Presentation "${slug}" not found: ${error}`,
    })
  }
})

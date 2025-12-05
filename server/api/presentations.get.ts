import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'

export default defineEventHandler(async () => {
  try {
    const presentationsDir = join(process.cwd(), 'presentations')
    const files = await readdir(presentationsDir)

    const presentations = await Promise.all(
      files
        .filter(file => file.endsWith('.md'))
        .map(async (file) => {
          const slug = file.replace('.md', '')
          const filePath = join(presentationsDir, file)
          const content = await readFile(filePath, 'utf-8')

          // Parse frontmatter to get title and theme
          const ast = await parseMarkdown(content)
          const title = ast.data?.title || slug
          const theme = ast.data?.theme || 'dsfr'

          return {
            slug,
            title,
            theme,
            filename: file,
          }
        }),
    )

    return presentations
  }
  catch (error) {
    console.error('Error loading presentations:', error)
    return []
  }
})

import type { Project } from '#shared/projects'
import { projectDirectory } from '../utils/sources'

/** Project grouping metadata (db over projects.yml). Public (labels aren't sensitive). */
export default defineEventHandler(async (): Promise<Project[]> => {
  try {
    return await projectDirectory.list()
  }
  catch (error) {
    console.error('Error loading projects:', error)
    return []
  }
})

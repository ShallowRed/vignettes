import type { Project } from '#shared/projects'
import { listProjects } from '../utils/projects'

/** Project grouping metadata from presentations/projects.yml. Public (labels aren't sensitive). */
export default defineEventHandler(async (): Promise<Project[]> => {
  try {
    return await listProjects()
  }
  catch (error) {
    console.error('Error loading projects:', error)
    return []
  }
})

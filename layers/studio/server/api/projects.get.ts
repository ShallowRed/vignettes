import type { Project } from '#shared/projects'
import { listVisibleProjects } from '../utils/catalog'

/**
 * Project folders the actor may see — the catalog's grouping axis, access-filtered
 * like the deck listing (an unprivileged actor only sees folders that hold at
 * least one deck they can list; privileged actors see every folder). Session-
 * dependent: callers must forward the session cookie (useRequestFetch in SSR).
 */
export default defineEventHandler(async (event): Promise<Project[]> => {
  try {
    return await listVisibleProjects(event)
  }
  catch (error) {
    console.error('Error loading projects:', error)
    return []
  }
})

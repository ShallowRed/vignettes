import { listTemplates } from '../utils/templates'

/** GET /api/templates: the ids of the templates a new deck can start from. */
export default defineEventHandler(async (): Promise<string[]> => {
  return await listTemplates()
})

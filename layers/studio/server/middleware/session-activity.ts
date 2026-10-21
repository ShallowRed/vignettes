import { keepSessionActive } from '../utils/actor'

/**
 * Reseals the session on each `GET` request (see `keepSessionActive`). The
 * `public-cache` plugin removes the cookie from a response a shared cache may keep.
 */
export default defineEventHandler(async (event) => {
  if (event.method === 'GET')
    await keepSessionActive(event)
})

import { assertRecette } from '../../../utils/recette'
import { readCapture } from '../../../utils/recette-branch'

/**
 * GET /api/recette/captures/<subject>/<id>-<width>.png: a capture of the branch
 * recette, read from the development storage of the captures. Development only.
 */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await assertRecette(event)
  const capture = await readCapture(useStorage('recette-captures'), getRouterParam(event, 'key', { decode: true }) ?? '')
  if (!capture)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setResponseHeaders(event, { 'content-type': 'image/png', 'cache-control': 'no-store' })
  return capture
})

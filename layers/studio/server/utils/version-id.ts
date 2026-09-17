import type { H3Event } from 'h3'

/** The `:id` of a version or snapshot route as a number; 400 when it is not a positive integer. */
export function readVersionId(event: H3Event): number {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid version id' })
  }
  return id
}

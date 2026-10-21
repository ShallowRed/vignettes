import type { Role, TokenScope } from '#shared/access'
import { assertSignedIn } from '../../utils/access'

/**
 * GET /api/tokens/current: the account and the token of a request made with a
 * personal token. The command line checks a token with it.
 */
export default defineEventHandler(async (event): Promise<{ login: string, role: Role, name: string, prefix: string, scope: TokenScope, expiresAt: string }> => {
  const actor = await assertSignedIn(event)
  if (!actor.token)
    throw createError({ statusCode: 400, statusMessage: 'This route expects a personal token' })
  const { name, prefix, scope, expiresAt } = actor.token
  return { login: actor.login, role: actor.role, name, prefix, scope, expiresAt: expiresAt.toISOString() }
})

import type { TokenSummary } from '#shared/access'
import { TokenRequestSchema } from '#shared/access'
import { assertSignedIn } from '../../utils/access'
import { mintToken, tokenSummary, useTokenStore } from '../../utils/personal-token'
import { hitRateLimit } from '../../utils/rate-limit'
import { securityLog } from '../../utils/security-log'

const CREATIONS_PER_ACCOUNT = 10
const CREATION_WINDOW_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * POST /api/tokens `{ name, scope, days }`: creates a personal token for the
 * signed-in account. The response carries the secret, which the server never
 * shows again.
 */
export default defineEventHandler(async (event): Promise<{ token: TokenSummary, secret: string }> => {
  const actor = await assertSignedIn(event)
  const parsed = TokenRequestSchema.safeParse(await readBody(event))
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: `Invalid token request: ${parsed.error.issues.map(issue => issue.path.join('.') || issue.message).join(', ')}` })
  if (!hitRateLimit(`token-creation:${actor.id}`, CREATIONS_PER_ACCOUNT, CREATION_WINDOW_MS))
    throw createError({ statusCode: 429, statusMessage: 'Too many tokens created, try again later' })

  const { name, scope, days } = parsed.data
  const now = new Date()
  const { secret, tokenHash, prefix } = mintToken()
  const token = await useTokenStore().create(actor.id, { name, scope, tokenHash, prefix, expiresAt: new Date(now.getTime() + days * DAY_MS) }, now)
  securityLog(event, 'token-creation', { token: prefix, name, scope, until: token.expiresAt.toISOString().slice(0, 10) }, actor.login)

  setResponseStatus(event, 201)
  setResponseHeader(event, 'cache-control', 'no-store')
  return { token: tokenSummary(token, now), secret }
})

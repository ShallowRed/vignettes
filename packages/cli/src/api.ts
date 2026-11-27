import { z } from 'zod'

// The answers of the studio routes the command line reads, a copy of their
// handlers in layers/studio/server/api; test/unit/cli-routes.test.ts compares
// them. Each schema accepts fields it does not name, since the routes have no
// version.

export interface Route<Answer> {
  method: 'GET' | 'DELETE'
  path: string
  answer: z.ZodType<Answer>
}

const CurrentTokenSchema = z.object({
  login: z.string(),
  role: z.string(),
  name: z.string(),
  prefix: z.string(),
  scope: z.string(),
  expiresAt: z.string(),
})

/** The account and the token of the request, from `api/tokens/current.get.ts`. */
export type CurrentToken = z.infer<typeof CurrentTokenSchema>

export const CURRENT_TOKEN: Route<CurrentToken> = { method: 'GET', path: '/api/tokens/current', answer: CurrentTokenSchema }

/** The revocation of the token of the request, from `api/tokens/current.delete.ts`. */
export const REVOKE_TOKEN: Route<{ action: 'revoked' }> = { method: 'DELETE', path: '/api/tokens/current', answer: z.object({ action: z.literal('revoked') }) }

/** Every route the command line calls. */
export const ROUTES = [CURRENT_TOKEN, REVOKE_TOKEN]

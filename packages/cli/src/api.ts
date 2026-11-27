import { z } from 'zod'

// The answers of the studio routes the command line reads, a copy of their
// handlers in layers/studio/server/api; test/unit/cli-routes.test.ts compares
// them. Each schema accepts fields it does not name, since the routes have no
// version.

export interface Route<Answer> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** The route as `TOKEN_ROUTES` names it, `:slug` for the slug of a deck. */
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

/** The folders the account sees, with its own grant on each, from `api/projects.get.ts`. */
export const PROJECTS: Route<{ slug: string, myGrant?: string }[]> = {
  method: 'GET',
  path: '/api/projects',
  answer: z.array(z.object({ slug: z.string(), myGrant: z.string().optional() })),
}

const DeckDraftSchema = z.object({
  content: z.string(),
  from: z.enum(['draft', 'published']),
  stamp: z.number().nullable(),
  publishedRaw: z.string().nullable(),
  publishedVersion: z.number().nullable(),
})

/** The draft of a deck, else its published text, with its stamp, from `api/presentations/[slug].get.ts` with `?draft`. */
export const DECK_DRAFT: Route<z.infer<typeof DeckDraftSchema>> = { method: 'GET', path: '/api/presentations/:slug', answer: DeckDraftSchema }

/** The row of a created deck, from `api/presentations.post.ts`. */
export const CREATE_DECK: Route<{ slug: string }> = { method: 'POST', path: '/api/presentations', answer: z.object({ slug: z.string() }) }

/** A saved draft, from `api/presentations/[slug].put.ts`: `draftDigest` repeats the digest of the draft read, on an instance that checks it. */
export const SAVE_DRAFT: Route<{ stamp: number | null, draftDigest?: string | null }> = {
  method: 'PUT',
  path: '/api/presentations/:slug',
  answer: z.object({ stamp: z.number().nullable(), draftDigest: z.string().nullable().optional() }),
}

/** A publication, from `api/presentations/[slug]/publish.post.ts`: `digest` repeats the digest of the text sent, on an instance that checks it. */
export const PUBLISH_DECK: Route<{ ok: boolean, bytes: number, digest?: string }> = {
  method: 'POST',
  path: '/api/presentations/:slug/publish',
  answer: z.object({ ok: z.boolean(), bytes: z.number(), digest: z.string().optional() }),
}

/** An uploaded image, from `api/media.post.ts`. */
export const UPLOAD_MEDIA: Route<{ src: string }> = { method: 'POST', path: '/api/media', answer: z.object({ src: z.string() }) }

/** The JSON error of a route, as Nitro writes it. */
export const ErrorBodySchema = z.object({
  statusCode: z.number().optional(),
  statusMessage: z.string().optional(),
  data: z.unknown().optional(),
})

/** Every route the command line calls. */
export const ROUTES: Route<unknown>[] = [CURRENT_TOKEN, REVOKE_TOKEN, PROJECTS, DECK_DRAFT, CREATE_DECK, SAVE_DRAFT, PUBLISH_DECK, UPLOAD_MEDIA]

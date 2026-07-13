import type { Lifecycle, PublicationStatus } from '#shared/access'
import type { H3Event } from 'h3'
import process from 'node:process'
import { decideAccess } from '#shared/access'
import { getActorRole } from './actor'
import { verifyAccessPassword } from './password'

/**
 * Server-side access gate: the I/O adapter around the pure `decideAccess`. Resolves
 * the actor's role and the semi-private password grant, then maps the decision to
 * HTTP. All deck routes call this so per-status gating is defined once.
 */
export interface GateOptions {
  slug: string
  status: PublicationStatus
  lifecycle?: Lifecycle
  /** The deck's `accessPassword` hash from its frontmatter, if any. */
  storedHash?: string
}

/** Throws `createError` on deny/needs-password; returns normally on allow. */
export async function gateDeckAccess(event: H3Event, opts: GateOptions): Promise<void> {
  const { slug, status, lifecycle, storedHash } = opts
  const role = await getActorRole(event)
  const hasPassword = Boolean(storedHash)
  const passwordGranted = hasPassword
    ? await resolvePasswordGrant(event, slug, storedHash!)
    : false

  const decision = decideAccess({ status, lifecycle, role, hasPassword, passwordGranted })

  switch (decision.outcome) {
    case 'allow':
      return
    case 'needs-password':
      throw createError({
        statusCode: 401,
        statusMessage: 'Password required',
        data: { requiresPassword: true },
      })
    case 'deny':
      throw createError({
        statusCode: decision.reason === 'forbidden' ? 403 : 401,
        statusMessage: decision.reason === 'forbidden' ? 'Forbidden' : 'Authentication required',
      })
  }
}

/** Password satisfied by a prior `access_<slug>` cookie, or a valid `?password=` param (sets a 24h cookie). */
async function resolvePasswordGrant(event: H3Event, slug: string, storedHash: string): Promise<boolean> {
  if (getCookie(event, `access_${slug}`) === 'granted')
    return true

  const password = getQuery(event).password as string | undefined
  if (!password)
    return false

  const valid = await verifyAccessPassword(password, storedHash)
  if (!valid)
    return false

  setCookie(event, `access_${slug}`, 'granted', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })
  return true
}

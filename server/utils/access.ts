import type { DeckGrant, Lifecycle, PublicationStatus } from '#shared/access'
import type { H3Event } from 'h3'
import type { Actor } from './actor'
import process from 'node:process'
import { decideAccess } from '#shared/access'
import { getActor } from './actor'
import { verifyAccessPassword } from './password'
import { usePermissionStore } from './sources'

/**
 * Server-side access gate: the I/O adapter around the pure `decideAccess`. Resolves
 * the actor's role, their per-deck grant and the semi-private password grant, then
 * maps the decision to HTTP. All deck routes call this so per-status gating is
 * defined once.
 */
export interface GateOptions {
  slug: string
  status: PublicationStatus
  lifecycle?: Lifecycle
  /** The deck's access-password hash (db column or frontmatter), if any. */
  storedHash?: string
}

/** The actor's per-deck grant; a permission-store failure never grants anything. */
async function resolveGrant(actor: Actor, slug: string): Promise<DeckGrant | undefined> {
  if (!actor.id)
    return undefined
  return await usePermissionStore().get(slug, actor.id).catch(() => null) ?? undefined
}

/** Throws `createError` on deny/needs-password; returns normally on allow. */
export async function gateDeckAccess(event: H3Event, opts: GateOptions): Promise<void> {
  const { slug, status, lifecycle, storedHash } = opts
  const actor = await getActor(event)
  const grant = await resolveGrant(actor, slug)
  const hasPassword = Boolean(storedHash)
  const passwordGranted = hasPassword
    ? await resolvePasswordGrant(event, slug, storedHash!)
    : false

  const decision = decideAccess({ status, lifecycle, role: actor.role, grant, hasPassword, passwordGranted })

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

/** 403/401 unless the actor may edit this deck (privileged role or editor grant). */
export async function assertCanEditDeck(event: H3Event, slug: string): Promise<Actor> {
  const actor = await getActor(event)
  const grant = await resolveGrant(actor, slug)
  const decision = decideAccess({
    status: 'private',
    role: actor.role,
    action: 'edit',
    grant,
    hasPassword: false,
    passwordGranted: false,
  })
  if (decision.outcome !== 'allow') {
    throw createError({
      statusCode: actor.role === 'anonymous' ? 401 : 403,
      statusMessage: 'Editing requires an owner/editor role or an editor grant on this deck',
    })
  }
  return actor
}

/** 403/401 unless the actor's global role is `owner` (user and grant management). */
export async function assertOwner(event: H3Event): Promise<Actor> {
  const actor = await getActor(event)
  if (actor.role !== 'owner') {
    throw createError({
      statusCode: actor.role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner role required',
    })
  }
  return actor
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

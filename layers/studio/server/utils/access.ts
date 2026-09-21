import type { AccessDecision, DeckGrant, Lifecycle, PublicationStatus } from '#shared/access'
import type { H3Event } from 'h3'
import type { Actor } from './actor'
import process from 'node:process'
import { decideAccess, isPrivileged, mayEdit } from '#shared/access'
import { resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'
import { accessCookieName, mintAccessPass, verifyAccessPass } from './access-pass'
import { getActor } from './actor'
import { contentTokenActor } from './content-token'
import { verifyAccessPassword } from './password'
import { hitRateLimit } from './rate-limit'
import { publishedSource, useDeckMeta, useGrants, useMediaIndex, useProjectPermissionStore } from './sources'

// Semi-private decks are guarded by a shared password, so throttle guesses per
// client and deck to keep the scrypt check from becoming a brute-force oracle.
const PASSWORD_ATTEMPTS = 10
const PASSWORD_WINDOW_MS = 5 * 60 * 1000

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
  /**
   * Whether this request may unlock the deck with `?password=`. Only the routes
   * the unlock form calls set it. Everywhere else the visitor passes on the
   * cookie those routes gave them: answering the parameter on an image or a
   * stylesheet would tell which files exist, through the rate limit, and would
   * mint the cookie from them.
   */
  unlock?: boolean
}

/**
 * The view-gate inputs of a deck, resolved in one place for every route that
 * gates on it. A managed row is the truth. A published deck whose row predates
 * that flag follows its frontmatter. A draft that was never published follows
 * its row, whose status defaults to private. A slug with no row and no published
 * version answers null, and its callers treat it as absent.
 */
export async function gateOptionsOf(slug: string, hints: { lifecycle?: Lifecycle, folderStatus?: string } = {}): Promise<GateOptions | null> {
  const meta = await useDeckMeta().get(slug)
  const stub = meta?.managed ? null : (await publishedSource.load(slug))?.raw
  if (meta && !stub)
    return { slug, status: meta.status, lifecycle: hints.lifecycle ?? meta.lifecycle, storedHash: meta.accessPasswordHash }
  if (!stub)
    return null
  return {
    slug,
    status: resolveDeckStatus(stub, hints.folderStatus),
    lifecycle: hints.lifecycle ?? meta?.lifecycle,
    storedHash: splitFrontmatter(stub).data.accessPassword as string | undefined,
  }
}

/**
 * The actor's effective grant on this deck — its per-deck grant folded with any
 * grant on the deck's project (a project grant opens every deck in the project).
 * A permission-store failure never grants anything.
 */
async function resolveGrant(actor: Actor, slug: string): Promise<DeckGrant | undefined> {
  if (!actor.id)
    return undefined
  return await useGrants().get(slug, actor.id).catch(() => undefined) ?? undefined
}

/** The access decision for this request on this deck, before its mapping to HTTP. */
export async function decideDeckAccess(event: H3Event, opts: GateOptions): Promise<AccessDecision> {
  const { slug, status, lifecycle, storedHash } = opts
  const actor = await getActor(event)
  const grant = await resolveGrant(actor, slug)
  const hasPassword = Boolean(storedHash)
  const passwordGranted = hasPassword
    ? await resolvePasswordGrant(event, slug, storedHash!, opts.unlock === true)
    : false

  return decideAccess({ status, lifecycle, role: actor.role, grant, hasPassword, passwordGranted })
}

/** Throws `createError` on deny/needs-password; returns normally on allow. */
export async function gateDeckAccess(event: H3Event, opts: GateOptions): Promise<void> {
  const decision = await decideDeckAccess(event, opts)

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
      // A signed-in actor who may not view this deck reads 404, the answer of a
      // slug that does not exist, so trying slugs teaches them nothing. An
      // anonymous visitor reads 401, which does confirm that the deck exists:
      // the person a private deck was shared with has to be told to sign in.
      throw createError({
        statusCode: decision.reason === 'forbidden' ? 404 : 401,
        statusMessage: decision.reason === 'forbidden' ? 'Not found' : 'Authentication required',
      })
  }
}

/**
 * An uploaded image is allowed to a request that may view one of the live decks
 * referencing it. `public` tells whether all of them are public.
 */
export async function decideMediaAccess(event: H3Event, mediaName: string): Promise<{ allowed: boolean, public: boolean }> {
  const decks = (await Promise.all((await useMediaIndex().decksFor(mediaName)).map(slug => gateOptionsOf(slug))))
    .filter(deck => deck !== null)

  let allowed = false
  for (const deck of decks) {
    const decision = await decideDeckAccess(event, deck)
    if (decision.outcome === 'allow') {
      allowed = true
      break
    }
  }
  return { allowed, public: decks.length > 0 && decks.every(deck => deck.status === 'public') }
}

/**
 * Whether this actor may edit this deck: the shared `mayEdit` rule on their
 * effective grant. Used by the HTTP guard below and by the collab upgrade, which
 * maps the answer to a WebSocket response instead of an H3 error.
 */
export async function canActorEditDeck(actor: Actor, slug: string): Promise<boolean> {
  return mayEdit(actor.role, await resolveGrant(actor, slug))
}

/**
 * Refuses unless the actor may edit this deck (privileged role or editor grant).
 * An actor who may not even view it is answered as if the deck were absent, the
 * way the view gate does; one who may view it but not edit it reads 403, which
 * tells them nothing they could not already see. `contentToken` lets the route
 * accept the content token in place of a session: only the markdown write path
 * opts in (see `content-token.ts`).
 */
export async function assertCanEditDeck(event: H3Event, slug: string, opts: { contentToken?: boolean } = {}): Promise<Actor> {
  const actor = (opts.contentToken ? contentTokenActor(event) : null) ?? await getActor(event)
  if (!await canActorEditDeck(actor, slug)) {
    if (actor.role === 'anonymous')
      throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
    const gate = await gateOptionsOf(slug)
    const viewable = gate !== null && (await decideDeckAccess(event, gate)).outcome === 'allow'
    throw viewable
      ? createError({ statusCode: 403, statusMessage: 'Forbidden' })
      : createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  // A trashed deck is not editable: it stays absent (draft, publish, collab all
  // refused) until restored from the corbeille.
  if (await useDeckMeta().isTrashed(slug))
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return actor
}

/**
 * 403/401 unless the actor may create a deck in `project`: a privileged role
 * anywhere, or an `editor` grant on that folder (the master key already lets
 * them edit every deck in it).
 */
export async function assertCanCreateInProject(event: H3Event, project?: string): Promise<Actor> {
  const actor = await getActor(event)
  const folderGrant = project && actor.id
    ? await useProjectPermissionStore().get(project, actor.id).catch(() => undefined) ?? undefined
    : undefined
  if (!mayEdit(actor.role, folderGrant)) {
    throw createError({
      statusCode: actor.role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner or editor role required, or an editor grant on the target folder',
    })
  }
  return actor
}

/** 403/401 unless the actor's global role is `owner` or `editor` (catalog administration). */
export async function assertPrivileged(event: H3Event): Promise<Actor> {
  const actor = await getActor(event)
  if (!isPrivileged(actor.role)) {
    throw createError({
      statusCode: actor.role === 'anonymous' ? 401 : 403,
      statusMessage: 'Owner or editor role required',
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
async function resolvePasswordGrant(event: H3Event, slug: string, storedHash: string, unlock: boolean): Promise<boolean> {
  if (verifyAccessPass(getCookie(event, accessCookieName(slug)), slug, storedHash))
    return true

  const password = unlock ? getQuery(event).password as string | undefined : undefined
  if (!password)
    return false

  const client = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  if (!hitRateLimit(`unlock:${client}:${slug}`, PASSWORD_ATTEMPTS, PASSWORD_WINDOW_MS))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later' })

  const valid = await verifyAccessPassword(password, storedHash)
  if (!valid)
    return false

  const pass = mintAccessPass(slug, storedHash)
  setCookie(event, accessCookieName(slug), pass.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: pass.maxAge,
  })
  return true
}

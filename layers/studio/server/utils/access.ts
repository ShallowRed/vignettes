import type { AccessDecision, DeckGrant, GrantTerm, Lifecycle, PublicationStatus } from '#shared/access'
import type { H3Event } from 'h3'
import type { Actor } from './actor'
import { canShare, decideAccess, isPrivileged, mayEdit, sharingLimit } from '#shared/access'
import { resolveDeckStatus, splitFrontmatter } from '@vignettes/core/deck'
import { accessCookieName, mintAccessPass, verifyAccessPass } from './access-pass'
import { getActor } from './actor'
import { clientAddress } from './client-address'
import { serverConfig } from './config'
import { contentTokenActor } from './content-token'
import { hashAccessPassword, needsRehash, verifyAccessPassword } from './password'
import { hitRateLimit } from './rate-limit'
import { securityLog } from './security-log'
import { publishedSource, useDeckMeta, useGrants, useMediaIndex, usePermissionStore, useProjectPermissionStore } from './sources'

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
   * The password the visitor posted to an unlock route (`unlockDeck`). Every
   * other route lets the visitor in on the cookie the unlock route gave them.
   */
  password?: string
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
    ? await resolvePasswordGrant(event, actor, slug, storedHash!, opts.password)
    : false

  return decideAccess({ status, lifecycle, role: actor.role, grant, hasPassword, passwordGranted })
}

/**
 * The unlock routes: the password of a semi-private deck, posted in the body of
 * the request so that no URL carries it. A right password sets the cookie of
 * the deck; a wrong one answers as the gate does.
 */
export async function unlockDeck(event: H3Event, gate: GateOptions): Promise<{ unlocked: true }> {
  const body = await readBody<{ password?: unknown }>(event).catch(() => null)
  if (typeof body?.password !== 'string' || !body.password)
    throw createError({ statusCode: 400, statusMessage: 'Body must be { password }' })
  await gateDeckAccess(event, { ...gate, password: body.password })
  return { unlocked: true }
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
 * `contentToken` lets the route accept the content token in place of a session:
 * only the markdown write path opts in (see `content-token.ts`).
 */
export async function assertCanEditDeck(event: H3Event, slug: string, opts: { contentToken?: boolean } = {}): Promise<Actor> {
  const actor = (opts.contentToken ? contentTokenActor(event) : null) ?? await getActor(event)
  if (!await canActorEditDeck(actor, slug))
    throw await refusalOnDeck(event, actor, slug)
  await assertNotTrashed(slug)
  return actor
}

/**
 * Refuses unless the actor may manage the grants of this deck (`canShare`), with
 * the answers of `assertCanEditDeck`. A slug with no deck answers 404, except to
 * the owner, who may grant a deck before it exists.
 */
export async function assertCanShareDeck(event: H3Event, slug: string): Promise<Actor> {
  const actor = await getActor(event)
  if (!canShare(actor.role, await resolveGrant(actor, slug)))
    throw await refusalOnDeck(event, actor, slug)
  await assertNotTrashed(slug)
  if (actor.role !== 'owner' && await gateOptionsOf(slug) === null)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return actor
}

/**
 * The date until which this actor may give access to this deck (`sharingLimit`),
 * from the editor grants they hold on the deck and on its folder.
 */
export async function sharingLimitOn(actor: Actor, slug: string): Promise<Date | null> {
  if (isPrivileged(actor.role) || !actor.id)
    return sharingLimit(actor.role, [])
  const project = await useDeckMeta().projectOf(slug)
  const [onDeck, onFolder] = await Promise.all([
    usePermissionStore().listForDeck(slug),
    project ? useProjectPermissionStore().listForProject(project) : Promise.resolve([]),
  ])
  const own = <T extends GrantTerm & { userId: number }>(grants: T[]) => grants.find(grant => grant.userId === actor.id)
  return sharingLimit(actor.role, [own(onDeck), own(onFolder)])
}

/**
 * The refusal of a write on a deck. An actor who may not even view it is
 * answered as if the deck were absent, the way the view gate does; one who may
 * view it reads 403, which tells them nothing they could not already see.
 */
async function refusalOnDeck(event: H3Event, actor: Actor, slug: string): Promise<Error> {
  if (actor.role === 'anonymous')
    return createError({ statusCode: 401, statusMessage: 'Authentication required' })
  const gate = await gateOptionsOf(slug)
  const viewable = gate !== null && (await decideDeckAccess(event, gate)).outcome === 'allow'
  return viewable
    ? createError({ statusCode: 403, statusMessage: 'Forbidden' })
    : createError({ statusCode: 404, statusMessage: 'Not found' })
}

/**
 * A trashed deck accepts no write: it stays absent (draft, publish, collab,
 * sharing all refused) until restored from the corbeille.
 */
async function assertNotTrashed(slug: string): Promise<void> {
  if (await useDeckMeta().isTrashed(slug))
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
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

/** 401 unless a signed-in account makes the request. */
export async function assertSignedIn(event: H3Event): Promise<Actor & { id: number, login: string }> {
  const actor = await getActor(event)
  if (actor.id === undefined || !actor.login)
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return { ...actor, id: actor.id, login: actor.login }
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

/** The actor of a content script (`/api/content/*`): the content token, or a privileged session. */
export async function assertContentScript(event: H3Event): Promise<Actor> {
  return contentTokenActor(event) ?? await assertPrivileged(event)
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

/** Password satisfied by a prior `access_<slug>` cookie, or by the right posted password (sets a 24h cookie). */
async function resolvePasswordGrant(event: H3Event, actor: Actor, slug: string, storedHash: string, password: string | undefined): Promise<boolean> {
  if (verifyAccessPass(getCookie(event, accessCookieName(slug)), slug, storedHash))
    return true
  if (!password)
    return false

  if (!hitRateLimit(`unlock:${clientAddress(event)}:${slug}`, PASSWORD_ATTEMPTS, PASSWORD_WINDOW_MS)) {
    securityLog(event, 'deck-password-lockout', { deck: slug }, actor.login)
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts, try again later' })
  }

  const valid = await verifyAccessPassword(password, storedHash)
  if (!valid)
    return false

  const signedHash = needsRehash(storedHash) ? await rehash(slug, storedHash, password) : storedHash
  const pass = mintAccessPass(slug, signedHash)
  setCookie(event, accessCookieName(slug), pass.value, {
    httpOnly: true,
    secure: serverConfig().secureCookies,
    sameSite: 'lax',
    path: '/',
    maxAge: pass.maxAge,
  })
  return true
}

/**
 * Hashes the password of a managed deck again with the current parameters, and
 * returns the hash the cookie signs. A hash read from the frontmatter of a deck
 * whose row is unmanaged stays as it is. When another unlock replaced the hash
 * first, its hash comes from the same password, and the cookie signs that one.
 */
async function rehash(slug: string, storedHash: string, password: string): Promise<string> {
  const meta = await useDeckMeta().get(slug)
  if (!meta?.managed || meta.accessPasswordHash !== storedHash)
    return storedHash
  const rehashed = await hashAccessPassword(password)
  if (await useDeckMeta().replacePasswordHash(slug, storedHash, rehashed))
    return rehashed
  return (await useDeckMeta().get(slug))?.accessPasswordHash ?? storedHash
}

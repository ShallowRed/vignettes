import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'
import process from 'node:process'
import { markdownToYDocUpdate } from '#shared/collab/ydoc'
import { RECETTE_INVITED_HANDLE, RECETTE_PASSWORD, RECETTE_PERSONAS, RECETTE_PREFIX } from '#shared/recette/personas'
import { like } from 'drizzle-orm'
import { decks } from '../db/schema'
import { getActor } from './actor'
import { useDraftStore } from './collab'
import { useDb } from './db'
import { mediaNameOf, storeMedia } from './media-store'
import { hashAccessPassword } from './password'
import { useDbContent, useDeckMeta, usePermissionStore, useProjectPermissionStore, useProjectStore } from './sources'
import { useUserStore } from './users'

/**
 * Staging acceptance kit: a named data set (`recette-*` rows) and synthetic
 * personas to open the app as each kind of account. Enabled by
 * `NUXT_RECETTE_ENABLED=1` (set only in the staging environment) and always in
 * dev. Every entry point requires an owner session, or the pass an owner
 * session minted in this browser.
 */
export function isRecetteEnabled(): boolean {
  return import.meta.dev || process.env.NUXT_RECETTE_ENABLED === '1'
}

const PASS_COOKIE = 'recette_pass'
const PASS_TTL_MS = 12 * 60 * 60 * 1000

export interface RecettePass {
  exp: number
  /** The owner identity that opened the kit, restored by `?as=me`. */
  user: { id: number, login: string, name?: string }
}

function passSecret(): string {
  const secret = process.env.NUXT_SESSION_PASSWORD
  if (!secret)
    throw createError({ statusCode: 500, statusMessage: 'NUXT_SESSION_PASSWORD is required to sign the acceptance pass' })
  return secret
}

function sign(payload: string): string {
  return createHmac('sha256', passSecret()).update(payload).digest('base64url')
}

/** Issue the pass to this browser: an owner opened the kit. */
export function mintRecettePass(event: H3Event, user: RecettePass['user']): RecettePass {
  const pass: RecettePass = { exp: Date.now() + PASS_TTL_MS, user }
  const payload = Buffer.from(JSON.stringify(pass)).toString('base64url')
  setCookie(event, PASS_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PASS_TTL_MS / 1000,
  })
  return pass
}

/** The pass carried by this browser, when its signature and expiry hold. */
export function readRecettePass(event: H3Event): RecettePass | null {
  const raw = getCookie(event, PASS_COOKIE)
  if (!raw)
    return null
  const [payload, signature] = raw.split('.')
  if (!payload || !signature)
    return null
  const expected = sign(payload)
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
    return null
  try {
    const pass = JSON.parse(Buffer.from(payload, 'base64url').toString()) as RecettePass
    return pass.exp > Date.now() && typeof pass.user?.id === 'number' ? pass : null
  }
  catch {
    return null
  }
}

/**
 * 404 when the kit is off; 403 unless the request comes from an owner (who then
 * receives the pass) or carries a valid pass.
 */
export async function assertRecette(event: H3Event): Promise<RecettePass> {
  if (!isRecetteEnabled())
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const actor = await getActor(event)
  if (actor.role === 'owner' && actor.id && actor.login) {
    const session = await getUserSession(event).catch(() => null)
    const name = (session?.user as { name?: string } | undefined)?.name
    return mintRecettePass(event, { id: actor.id, login: actor.login, name })
  }
  const pass = readRecettePass(event)
  if (!pass)
    throw createError({ statusCode: 403, statusMessage: 'Le kit de recette s\'ouvre avec un compte owner' })
  return pass
}

/** Slugs of the two seeded folders. */
export const RECETTE_FOLDERS = {
  shared: `${RECETTE_PREFIX}partage`,
  private: `${RECETTE_PREFIX}prive`,
} as const

interface SeedDeck {
  slug: string
  title: string
  status: 'public' | 'semi-private' | 'private'
  project?: string
  theme: string
  unlisted?: boolean
  lifecycle?: 'live' | 'archived'
  password?: string
  trashed?: boolean
  draftOnly?: boolean
  /** Deck language, written to the frontmatter; the deck chrome follows it. */
  lang?: string
  /** Carries a seeded image, served with the visibility of the deck. */
  image?: boolean
  note: string
}

const SEED_DECKS: SeedDeck[] = [
  { slug: `${RECETTE_PREFIX}public`, title: 'Recette · Publique', status: 'public', project: RECETTE_FOLDERS.shared, theme: 'minimal', image: true, note: 'Visible et ouvrable par tout le monde, y compris hors connexion.' },
  { slug: `${RECETTE_PREFIX}mdp`, title: 'Recette · Mot de passe', status: 'semi-private', project: RECETTE_FOLDERS.shared, theme: 'minimal', password: RECETTE_PASSWORD, note: `Absente du catalogue public ; le lien direct demande le mot de passe « ${RECETTE_PASSWORD} ».` },
  { slug: `${RECETTE_PREFIX}brouillon`, title: 'Recette · Brouillon', status: 'private', project: RECETTE_FOLDERS.shared, theme: 'minimal', draftOnly: true, note: 'Jamais publiée : listée seulement à qui peut l\'éditer.' },
  { slug: `${RECETTE_PREFIX}privee`, title: 'Recette · Privée', status: 'private', project: RECETTE_FOLDERS.private, theme: 'dsfr', image: true, note: 'Réservée aux rôles privilégiés ; un lecteur connecté reçoit 403, un anonyme 401.' },
  { slug: `${RECETTE_PREFIX}non-listee`, title: 'Recette · Non listée', status: 'public', project: RECETTE_FOLDERS.private, theme: 'dsfr', unlisted: true, note: 'Publique mais absente du catalogue public ; le lien direct fonctionne.' },
  { slug: `${RECETTE_PREFIX}archivee`, title: 'Recette · Archivée', status: 'public', project: RECETTE_FOLDERS.private, theme: 'dsfr', lifecycle: 'archived', note: 'Archivée : hors catalogue public, lien direct fonctionnel.' },
  { slug: `${RECETTE_PREFIX}lecture`, title: 'Recette · Lecture seule', status: 'private', theme: 'minimal', note: 'Sans dossier (Divers). Le collaborateur la voit en lecture seule, sans crayon.' },
  { slug: `${RECETTE_PREFIX}english`, title: 'Recette · English deck', status: 'public', project: RECETTE_FOLDERS.shared, theme: 'minimal', lang: 'en', note: 'A deck whose frontmatter says `lang: en`: its controls, loading text and print overlay are in English whatever the language of the interface.' },
  { slug: `${RECETTE_PREFIX}corbeille`, title: 'Recette · Corbeille', status: 'private', project: RECETTE_FOLDERS.private, theme: 'minimal', trashed: true, note: 'À la corbeille : 404 partout, restaurable par un rôle privilégié.' },
]

const IMAGE_MIME = 'image/svg+xml'

/** The image seeded into a deck: its title on a colored ground, so each deck has its own file. */
function imageOf(deck: SeedDeck): { name: string, data: Buffer } {
  const data = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240"><rect width="640" height="240" fill="${deck.status === 'public' ? '#18753c' : '#000091'}"/><text x="320" y="130" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#fff">${deck.title}</text></svg>`)
  return { name: mediaNameOf(data, IMAGE_MIME)!, data }
}

/** The `/media/...` address of the image seeded into a deck, by deck slug. */
export function recetteImages(): Record<string, string> {
  return Object.fromEntries(SEED_DECKS.filter(deck => deck.image).map(deck => [deck.slug, `/media/${imageOf(deck).name}`]))
}

function markdownFor(deck: SeedDeck): string {
  const lines = [
    '---',
    `title: "${deck.title}"`,
    `status: ${deck.status}`,
    `theme: ${deck.theme}`,
    ...(deck.lang ? [`lang: ${deck.lang}`] : []),
    ...(deck.project ? [`project: ${deck.project}`] : []),
    '---',
    '',
    `# ${deck.title}`,
    '',
    deck.note,
    '',
    '## Ce que cette présentation vérifie',
    '',
    `- statut : ${deck.status}`,
    `- dossier : ${deck.project ?? 'aucun (Divers)'}`,
    '',
    '## Une deuxième diapositive',
    '',
    'Modifiez ce texte pour tester l\'édition et la publication.',
    '',
    '## Un bloc de code',
    '',
    '```ts',
    '// Total TTC du panier',
    'export function total(items: Item[]): number {',
    '  return items.reduce((sum, item) => sum + item.price * 1.2, 0)',
    '}',
    '```',
    '',
    ...(deck.image ? ['## Une image téléversée', '', `![${deck.title}](/media/${imageOf(deck).name})`, ''] : []),
  ]
  return lines.join('\n')
}

export interface SeedSummary {
  folders: number
  decks: number
  accounts: number
}

/** What the data set holds; the accounts are the personas and the invited guest. */
export function recetteCounts(): SeedSummary {
  return { folders: Object.keys(RECETTE_FOLDERS).length, decks: SEED_DECKS.length, accounts: RECETTE_PERSONAS.length + 1 }
}

/** Remove every `recette-*` row (decks, folders, accounts), then recreate the set. */
export async function seedRecette(): Promise<SeedSummary> {
  await resetRecette()

  const projects = useProjectStore()
  await projects.create({ slug: RECETTE_FOLDERS.shared, title: 'Recette · Dossier partagé', color: '#2563eb', icon: 'briefcase' })
  await projects.create({ slug: RECETTE_FOLDERS.private, title: 'Recette · Dossier privé', color: '#9333ea', icon: 'flask-conical' })

  const meta = useDeckMeta()
  for (const deck of SEED_DECKS) {
    const raw = markdownFor(deck)
    if (deck.image) {
      const image = imageOf(deck)
      await storeMedia(image.name, image.data, IMAGE_MIME)
    }
    if (deck.draftOnly) {
      await useDraftStore().save(deck.slug, markdownToYDocUpdate(raw))
      await meta.update(deck.slug, { title: deck.title, status: deck.status, project: deck.project ?? null, theme: deck.theme })
      continue
    }
    await useDbContent().writer.save({ slug: deck.slug, raw, actor: 'recette' })
    await meta.update(deck.slug, {
      unlisted: deck.unlisted ?? false,
      lifecycle: deck.lifecycle ?? 'live',
      ...(deck.password ? { accessPasswordHash: await hashAccessPassword(deck.password) } : {}),
    })
    if (deck.trashed)
      await meta.softDelete(deck.slug)
  }

  const users = useUserStore()
  for (const persona of RECETTE_PERSONAS)
    await users.upsertOnLogin({ id: persona.id, login: persona.login, name: persona.name, avatarUrl: null }, persona.role)
  const invited = await users.invite({ provider: 'google', handle: RECETTE_INVITED_HANDLE })

  const byKey = Object.fromEntries(RECETTE_PERSONAS.map(p => [p.key, p]))
  const folderGrants = useProjectPermissionStore()
  await folderGrants.set(RECETTE_FOLDERS.shared, byKey.collab!.id, 'editor', 'recette')
  await folderGrants.set(RECETTE_FOLDERS.shared, byKey.expired!.id, 'editor', 'recette', new Date(Date.now() - 24 * 60 * 60 * 1000))
  await folderGrants.set(RECETTE_FOLDERS.shared, invited.id, 'viewer', 'recette')
  await usePermissionStore().set(`${RECETTE_PREFIX}lecture`, byKey.collab!.id, 'viewer', 'recette')

  return recetteCounts()
}

/** Whether every deck of the data set exists. */
export async function isRecetteSeeded(): Promise<boolean> {
  const meta = useDeckMeta()
  const present = await Promise.all(SEED_DECKS.map(deck => meta.existsIncludingTrashed(deck.slug)))
  return present.every(Boolean)
}

async function resetRecette(): Promise<void> {
  const projects = useProjectStore()
  for (const slug of Object.values(RECETTE_FOLDERS))
    await projects.purge(slug)
  // Decks outside the folders (Divers) and any stray anchor row.
  const meta = useDeckMeta()
  for (const { slug } of useDb().select({ slug: decks.slug }).from(decks).where(like(decks.slug, `${RECETTE_PREFIX}%`)).all())
    await meta.purge(slug)

  const users = useUserStore()
  for (const persona of RECETTE_PERSONAS)
    await users.remove(persona.id)
  const stub = (await users.list()).find(account => account.login === RECETTE_INVITED_HANDLE)
  if (stub)
    await users.remove(stub.id)
}

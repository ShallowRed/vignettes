import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import { load as parseYaml } from 'js-yaml'
import { deckAliases, decks, deckVersions, projects } from '../db/schema'
import { presentationsStorage } from './presentations'

/**
 * Import the git content repo into the database — the runtime half of the
 * `content-import` CLI, so the migration can be triggered from the admin UI
 * instead of poking a container. Same rules as the script:
 *
 *  - idempotent: a re-run is a no-op once everything matches;
 *  - a deck already `managed` is NEVER overwritten (the database owns it);
 *  - frozen/archived decks take their title from the registry and are forced
 *    `public`, mirroring how `presentations.get.ts` lists them — otherwise the
 *    import would silently re-title them and close their access.
 */

interface Frontmatter { [k: string]: unknown }

interface RegistryEntry {
  title?: string
  slug?: string
  lifecycle?: string
  source?: string
  noteId?: string
  frozenBundle?: string
  aliases?: string[]
}

interface ProjectEntry { title?: string, order?: number, color?: string }

export interface ImportPlan {
  stubs: number
  projectsCreate: string[]
  decksCreate: string[]
  decksUpdate: string[]
  versionsInsert: string[]
  aliasesCanonical: string[]
  aliasesHistorical: string[]
  skippedManaged: string[]
  warnings: string[]
}

interface DeckPlan {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  source: string | null
  noteId: string | null
  frozenBundle: string | null
  accessPasswordHash: string | null
  unlisted: boolean
  raw: string
  needsVersion: boolean
}

type Db = BetterSQLite3Database<Record<string, unknown>>

/** Split `---\n<yaml>\n---\n<body>`; a stub without frontmatter yields `{}`. */
function splitFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  return match ? ((parseYaml(match[1]) || {}) as Frontmatter) : {}
}

async function readYaml<T>(key: string): Promise<T> {
  try {
    const stored = await presentationsStorage().getItem(key)
    const raw = typeof stored === 'string' ? stored : stored == null ? '' : String(stored)
    return (parseYaml(raw) || {}) as T
  }
  catch {
    return {} as T
  }
}

/** Every deck stub, flat or under `archived/`, excluding repo documentation. */
async function readStubs(): Promise<{ slug: string, raw: string, archived: boolean }[]> {
  const storage = presentationsStorage()
  const keys = (await storage.getKeys()).filter(k => k.endsWith('.md'))
  const out: { slug: string, raw: string, archived: boolean }[] = []

  for (const key of keys) {
    const segments = key.split(':')
    const folder = segments.length > 1 ? segments[segments.length - 2] : undefined
    const slug = segments[segments.length - 1]!.replace(/\.md$/, '')
    if (slug === 'README')
      continue
    const stored = await storage.getItem(key)
    if (stored == null)
      continue
    out.push({ slug, raw: typeof stored === 'string' ? stored : String(stored), archived: folder === 'archived' })
  }
  return out
}

export interface ImportResult { plan: ImportPlan, applied: boolean }

export async function runContentImport(db: Db, options: { apply: boolean }): Promise<ImportResult> {
  const registry = await readYaml<Record<string, RegistryEntry>>('registry.yml')
  const projectsYml = await readYaml<Record<string, ProjectEntry>>('projects.yml')
  const stubs = await readStubs()

  const registryBySlug = new Map<string, RegistryEntry & { alias: string }>()
  for (const [alias, entry] of Object.entries(registry))
    registryBySlug.set(entry.slug ?? alias, { ...entry, alias })

  const existing = new Map(db.select().from(decks).all().map(r => [r.slug, r]))
  const publishedRaw = new Map<string, string>()
  for (const row of existing.values()) {
    if (row.publishedVersionId == null)
      continue
    const v = db.select().from(deckVersions).where(eq(deckVersions.id, row.publishedVersionId)).get()
    if (v)
      publishedRaw.set(row.slug, v.raw)
  }
  const existingProjects = new Set(db.select().from(projects).all().map(p => p.slug))
  const existingAliases = new Set(db.select().from(deckAliases).all().map(a => a.alias))

  const plan: ImportPlan = {
    stubs: stubs.length,
    projectsCreate: [],
    decksCreate: [],
    decksUpdate: [],
    versionsInsert: [],
    aliasesCanonical: [],
    aliasesHistorical: [],
    skippedManaged: [],
    warnings: [],
  }

  const deckPlans: DeckPlan[] = []
  const projectsUsed = new Set<string>()

  for (const stub of stubs) {
    const row = existing.get(stub.slug)
    if (row?.managed) {
      plan.skippedManaged.push(stub.slug)
      continue
    }

    const data = splitFrontmatter(stub.raw)
    const reg = registryBySlug.get(stub.slug)
    const project = (data.project as string) ?? null
    if (project)
      projectsUsed.add(project)

    const lifecycle = reg?.lifecycle ?? 'live'
    const registryDriven = lifecycle === 'frozen' || lifecycle === 'archived'

    const p: DeckPlan = {
      slug: stub.slug,
      title: registryDriven
        ? (reg?.title ?? stub.slug)
        : ((data.title as string) ?? reg?.title ?? stub.slug),
      status: registryDriven ? 'public' : ((data.status as string) ?? 'private'),
      lifecycle,
      project,
      theme: (data.theme as string) ?? null,
      alias: reg?.alias ?? null,
      source: reg?.source ?? null,
      noteId: reg?.noteId ?? null,
      frozenBundle: reg?.frozenBundle ?? null,
      accessPasswordHash: (data.accessPassword as string) ?? null,
      unlisted: Boolean(data.unlisted),
      raw: stub.raw,
      needsVersion: publishedRaw.get(stub.slug) !== stub.raw,
    }

    deckPlans.push(p)
    ;(row ? plan.decksUpdate : plan.decksCreate).push(p.slug)
    if (p.needsVersion)
      plan.versionsInsert.push(p.slug)
    if (p.alias)
      plan.aliasesCanonical.push(`${p.alias} → ${p.slug}`)
  }

  for (const slug of Object.keys(projectsYml)) {
    if (!existingProjects.has(slug))
      plan.projectsCreate.push(slug)
  }

  for (const missing of [...projectsUsed].filter(s => !(s in projectsYml)).sort())
    plan.warnings.push(`projet "${missing}" référencé par un stub mais absent de projects.yml (il s'affichera en slug brut)`)

  const historical: { alias: string, slug: string }[] = []
  for (const [alias, entry] of Object.entries(registry)) {
    const slug = entry.slug ?? alias
    for (const old of entry.aliases ?? []) {
      if (!existingAliases.has(old)) {
        historical.push({ alias: old, slug })
        plan.aliasesHistorical.push(`${old} → ${slug}`)
      }
    }
    if (!stubs.some(s => s.slug === slug) && !existing.has(slug))
      plan.warnings.push(`entrée de registre "${alias}" pointe sur le slug "${slug}" qui n'a ni stub ni ligne en base`)
  }

  if (!options.apply)
    return { plan, applied: false }

  const now = new Date()

  db.transaction((tx) => {
    for (const [slug, p] of Object.entries(projectsYml)) {
      tx.insert(projects)
        .values({ slug, title: p.title ?? slug, order: p.order ?? 0, color: p.color ?? null, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: projects.slug,
          set: { title: p.title ?? slug, order: p.order ?? 0, color: p.color ?? null, updatedAt: now },
        })
        .run()
    }

    for (const p of deckPlans) {
      const values = {
        slug: p.slug,
        alias: p.alias,
        title: p.title,
        status: p.status,
        lifecycle: p.lifecycle,
        project: p.project,
        theme: p.theme,
        accessPasswordHash: p.accessPasswordHash,
        frozenBundle: p.frozenBundle,
        source: p.source,
        noteId: p.noteId,
        unlisted: p.unlisted,
        managed: true,
      }
      tx.insert(decks)
        .values({ ...values, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: decks.slug, set: { ...values, updatedAt: now } })
        .run()

      if (p.needsVersion) {
        const inserted = tx.insert(deckVersions)
          .values({ deckSlug: p.slug, raw: p.raw, publishedBy: 'content-import', publishedAt: now })
          .returning({ id: deckVersions.id })
          .get()
        tx.update(decks).set({ publishedVersionId: inserted.id, updatedAt: now }).where(eq(decks.slug, p.slug)).run()
      }
    }

    for (const h of historical)
      tx.insert(deckAliases).values({ alias: h.alias, deckSlug: h.slug }).onConflictDoNothing().run()
  })

  return { plan, applied: true }
}

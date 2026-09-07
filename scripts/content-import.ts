/**
 * Import the git content repo into the database — the first half of the
 * "web pour le vif, git pour le fond" model: the database becomes the runtime
 * truth, git stays the exported archive.
 *
 * Reads `presentations/` (stubs, registry.yml, projects.yml) and writes:
 *   projects.yml  → projects
 *   .md stubs    → decks (managed) + deck_versions (the markdown)
 *   registry.yml  → decks.alias/lifecycle/frozen_bundle
 *                   + deck_aliases (historical paths)
 *
 * DRY-RUN BY DEFAULT: prints the plan and writes nothing. Pass `--apply` to
 * commit. Idempotent — re-running is a no-op once everything matches, and a deck
 * already `managed` is NEVER overwritten (the database is already its truth).
 *
 *   node scripts/content-import.ts                  # plan
 *   node scripts/content-import.ts --apply          # write
 *   node scripts/content-import.ts --db=/path/to.db # target another database
 *
 * `--republish=<slug>[,<slug>]` takes the listed decks back from their stub even
 * when the database owns them: a new published version is written from the
 * file and the row's title and theme follow it; status, unlisted, password and
 * project stay as the database has them, like a publish from the editor.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { load as parseYaml } from 'js-yaml'

const ROOT = process.cwd()
const CONTENT_DIR = join(ROOT, 'presentations')

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DB_PATH = args.find(a => a.startsWith('--db='))?.slice(5)
  ?? process.env.NUXT_DB_PATH
  ?? join(ROOT, '.data', 'slides.db')
const REPUBLISH = new Set((args.find(a => a.startsWith('--republish='))?.slice(12) ?? '').split(',').filter(Boolean))

const now = () => Math.floor(Date.now() / 1000)

// ── Parsing ─────────────────────────────────────────────────────────────────

interface Frontmatter { [k: string]: unknown }

/** Split `---\n<yaml>\n---\n<body>`; a stub without frontmatter yields `{}`. */
function splitFrontmatter(raw: string): { data: Frontmatter, body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match)
    return { data: {}, body: raw }
  return {
    data: (parseYaml(match[1]) || {}) as Frontmatter,
    body: raw.slice(match[0].length),
  }
}

function readYaml<T>(file: string): T {
  try {
    return (parseYaml(readFileSync(join(CONTENT_DIR, file), 'utf8')) || {}) as T
  }
  catch {
    return {} as T
  }
}

function listStubs(dir: string): { slug: string, path: string }[] {
  let names: string[] = []
  try {
    names = readdirSync(dir)
  }
  catch {
    return []
  }
  return names
    .filter(n => n.endsWith('.md') && n !== 'README.md')
    .map(n => ({ slug: n.slice(0, -3), path: join(dir, n) }))
    .filter(e => statSync(e.path).isFile())
}

// ── Sources ─────────────────────────────────────────────────────────────────

interface RegistryEntry {
  title?: string
  slug?: string
  lifecycle?: string
  frozenBundle?: string
  access?: string
  aliases?: string[]
}

interface ProjectEntry { title?: string, order?: number, color?: string }

const registry = readYaml<Record<string, RegistryEntry>>('registry.yml')
const projectsYml = readYaml<Record<string, ProjectEntry>>('projects.yml')

/** Registry entries indexed by the stub slug they describe (defaults to the alias). */
const registryBySlug = new Map<string, RegistryEntry & { alias: string }>()
for (const [alias, entry] of Object.entries(registry))
  registryBySlug.set(entry.slug ?? alias, { ...entry, alias })

const stubs = [
  ...listStubs(CONTENT_DIR),
  // `archived/` holds frozen/archived bodies; they are decks too, reached via the registry.
  ...listStubs(join(CONTENT_DIR, 'archived')),
]

// ── Database ────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH, { readonly: !APPLY, fileMustExist: true })

interface DeckRow {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  managed: number
  published_version_id: number | null
}

const existing = new Map<string, DeckRow>(
  db.prepare('select slug,title,status,lifecycle,project,theme,alias,managed,published_version_id from decks')
    .all()
    .map((r: any) => [r.slug, r as DeckRow]),
)
const publishedRaw = new Map<string, string>(
  db.prepare('select d.slug, v.raw from decks d join deck_versions v on v.id = d.published_version_id')
    .all()
    .map((r: any) => [r.slug, r.raw]),
)
const existingProjects = new Set<string>(db.prepare('select slug from projects').all().map((r: any) => r.slug))
const existingAliases = new Set<string>(db.prepare('select alias from deck_aliases').all().map((r: any) => r.alias))

// ── Plan ────────────────────────────────────────────────────────────────────

const plan = {
  projectsCreate: [] as string[],
  decksCreate: [] as string[],
  decksUpdate: [] as string[],
  versionsInsert: [] as string[],
  aliasesCanonical: [] as string[],
  aliasesHistorical: [] as string[],
  skippedManaged: [] as string[],
  republish: [] as string[],
  warnings: [] as string[],
}

/** A managed deck taken back from its stub: version + content axes only. */
const republishPlans: { slug: string, title: string | null, theme: string | null, raw: string }[] = []

// Projects declared by a stub but absent from projects.yml would render as a raw
// slug in the catalog; surface them instead of importing a half-defined project.
const projectsUsed = new Set<string>()

interface DeckPlan {
  slug: string
  title: string
  status: string
  lifecycle: string
  project: string | null
  theme: string | null
  alias: string | null
  frozenBundle: string | null
  accessPasswordHash: string | null
  unlisted: number
  raw: string
  needsVersion: boolean
}

const deckPlans: DeckPlan[] = []

for (const stub of stubs) {
  const raw = readFileSync(stub.path, 'utf8')
  const { data } = splitFrontmatter(raw)
  const reg = registryBySlug.get(stub.slug)
  const row = existing.get(stub.slug)

  if (row?.managed) {
    if (!REPUBLISH.has(stub.slug)) {
      // The database already owns this deck: never let a file overwrite it.
      plan.skippedManaged.push(stub.slug)
      continue
    }
    if (publishedRaw.get(stub.slug) === raw) {
      plan.warnings.push(`${stub.slug} : le fichier est identique à la version publiée, rien à republier`)
      continue
    }
    republishPlans.push({ slug: stub.slug, title: (data.title as string) ?? null, theme: (data.theme as string) ?? null, raw })
    plan.republish.push(stub.slug)
    continue
  }

  const project = (data.project as string) ?? null
  if (project)
    projectsUsed.add(project)

  // Frozen/archived decks are listed from the registry, not from their stub:
  // `presentations.get.ts` takes the registry title and forces `public`. Mirror
  // that here, or the import would silently re-title them and close their access.
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
    frozenBundle: reg?.frozenBundle ?? null,
    accessPasswordHash: (data.accessPassword as string) ?? null,
    unlisted: data.unlisted ? 1 : 0,
    raw,
    // Only publish a new version when the markdown actually changed.
    needsVersion: publishedRaw.get(stub.slug) !== raw,
  }

  deckPlans.push(p)
  if (row)
    plan.decksUpdate.push(p.slug)
  else
    plan.decksCreate.push(p.slug)
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

// Historical aliases from the registry.
const historical: { alias: string, slug: string }[] = []
for (const [alias, entry] of Object.entries(registry)) {
  const slug = entry.slug ?? alias
  for (const old of entry.aliases ?? []) {
    if (!existingAliases.has(old)) {
      historical.push({ alias: old, slug })
      plan.aliasesHistorical.push(`${old} → ${slug}`)
    }
  }
}

// A registry entry whose stub is missing would produce a dangling alias.
for (const [alias, entry] of Object.entries(registry)) {
  const slug = entry.slug ?? alias
  if (!stubs.some(s => s.slug === slug) && !existing.has(slug))
    plan.warnings.push(`entrée de registre "${alias}" pointe sur le slug "${slug}" qui n'a ni stub ni ligne en base`)
}

// ── Report ──────────────────────────────────────────────────────────────────

function section(label: string, items: string[]) {
  console.log(`\n${label} (${items.length})`)
  for (const i of items) console.log(`  · ${i}`)
}

console.log(`base    : ${DB_PATH}`)
console.log(`contenu : ${CONTENT_DIR}`)
console.log(`mode    : ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (aucune écriture)'}`)
console.log(`\nstubs lus : ${stubs.length} · entrées de registre : ${Object.keys(registry).length} · projets yaml : ${Object.keys(projectsYml).length}`)

for (const slug of REPUBLISH) {
  if (!stubs.some(st => st.slug === slug))
    plan.warnings.push(`${slug} : aucun stub de ce nom dans presentations/`)
  else if (!existing.get(slug)?.managed)
    plan.warnings.push(`${slug} : pas encore en base, il sera importé normalement`)
}

section('projets à créer', plan.projectsCreate)
section('decks à créer', plan.decksCreate)
section('decks à mettre à jour', plan.decksUpdate)
section('versions à publier (markdown différent)', plan.versionsInsert)
section('alias canoniques', plan.aliasesCanonical)
section('alias historiques', plan.aliasesHistorical)
section('ignorés — déjà managed (la base fait foi)', plan.skippedManaged)
section('republiés depuis le fichier (accès inchangés)', plan.republish)
section('⚠ avertissements', plan.warnings)

if (!APPLY) {
  console.log('\nDry-run terminé — rien n\'a été écrit. Relancer avec --apply pour appliquer.')
  process.exit(0)
}

// ── Apply ───────────────────────────────────────────────────────────────────

const ts = now()

const upsertProject = db.prepare(`
  insert into projects (slug,title,"order",color,created_at,updated_at)
  values (@slug,@title,@order,@color,@ts,@ts)
  on conflict(slug) do update set title=@title,"order"=@order,color=@color,updated_at=@ts
`)
const upsertDeck = db.prepare(`
  insert into decks (slug,alias,title,status,lifecycle,project,theme,access_password_hash,
                     frozen_bundle,unlisted,managed,created_at,updated_at)
  values (@slug,@alias,@title,@status,@lifecycle,@project,@theme,@accessPasswordHash,
          @frozenBundle,@unlisted,1,@ts,@ts)
  on conflict(slug) do update set
    alias=@alias,title=@title,status=@status,lifecycle=@lifecycle,project=@project,theme=@theme,
    access_password_hash=@accessPasswordHash,frozen_bundle=@frozenBundle,
    unlisted=@unlisted,managed=1,updated_at=@ts
`)
const insertVersion = db.prepare(
  'insert into deck_versions (deck_slug,raw,published_by,published_at) values (?,?,?,?)',
)
const pointVersion = db.prepare('update decks set published_version_id=?, updated_at=? where slug=?')
const insertAlias = db.prepare('insert or ignore into deck_aliases (alias,deck_slug) values (?,?)')
const retitle = db.prepare('update decks set title=coalesce(?, title), theme=coalesce(?, theme), updated_at=? where slug=?')

db.transaction(() => {
  for (const [slug, p] of Object.entries(projectsYml)) {
    upsertProject.run({ slug, title: p.title ?? slug, order: p.order ?? 0, color: p.color ?? null, ts })
  }

  for (const p of deckPlans) {
    upsertDeck.run({ ...p, ts })
    if (p.needsVersion) {
      const res = insertVersion.run(p.slug, p.raw, 'content-import', ts)
      pointVersion.run(res.lastInsertRowid, ts, p.slug)
    }
  }

  for (const h of historical)
    insertAlias.run(h.alias, h.slug)

  for (const r of republishPlans) {
    const res = insertVersion.run(r.slug, r.raw, 'content-import', ts)
    pointVersion.run(res.lastInsertRowid, ts, r.slug)
    retitle.run(r.title, r.theme, ts, r.slug)
  }
})()

console.log('\n✅ Import appliqué.')

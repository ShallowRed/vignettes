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
 *   node scripts/content-import.ts --db=/path/to.db # target a SQLite file
 *   node scripts/content-import.ts --content=<dir>  # read another content directory
 *
 * `--remote=<url>` sends `--republish` decks to a running instance instead of a
 * database file, through the draft-save and publish routes, authenticated with
 * `NUXT_CONTENT_TOKEN` (the same value the instance was started with). A deck
 * edited online and not yet published is refused unless `--force`.
 *
 * `--republish=<slug>[,<slug>]` takes the listed decks back from their stub even
 * when the database owns them: a new published version is written from the
 * file and the row's title and theme follow it; status, unlisted, password and
 * project stay as the database has them, like a publish from the editor. The
 * draft of a deck that gets a new version follows it when it held the replaced
 * one.
 */

import type { ArchiveWrite } from '../layers/studio/server/db/ports.ts'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { isDeckSlug, LEGACY_FORMS, legacyMentions, splitFrontmatter } from '@vignettes/core/deck'
import { isFrozen } from '@vignettes/core/status'
import { contentDir } from '@vignettes/nuxt/build/theme-registry'
import { load as parseYaml } from 'js-yaml'
import { describeDatabase } from '../layers/studio/server/db/config.ts'
import { openDatabaseFile } from '../layers/studio/server/db/open.ts'
import { scriptDatabaseConfig } from './lib/database.ts'
import { followDrafts } from './lib/follow-drafts.ts'
import { applyRemoteRepublish, planRemoteRepublish } from './lib/remote-republish.ts'

const ROOT = process.cwd()

const args = process.argv.slice(2)
const CONTENT_DIR = args.find(a => a.startsWith('--content='))?.slice(10) ?? contentDir(ROOT)
const APPLY = args.includes('--apply')
const DATABASE = scriptDatabaseConfig(args)
const REPUBLISH = new Set((args.find(a => a.startsWith('--republish='))?.slice(12) ?? '').split(',').filter(Boolean))
const REMOTE = args.find(a => a.startsWith('--remote='))?.slice(9)
const FORCE = args.includes('--force')

// ── Parsing ─────────────────────────────────────────────────────────────────

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

// The alias, the slug and the bundle each name a path segment of `/p/` or `/frozen/`.
const registryEntries = Object.entries(readYaml<Record<string, RegistryEntry>>('registry.yml'))
const refusedEntries = registryEntries
  .filter(([alias, entry]) => ![alias, entry?.slug, entry?.frozenBundle].every(name => name == null || isDeckSlug(name)))
  .map(([alias]) => alias)
const registry = Object.fromEntries(registryEntries.filter(([alias]) => !refusedEntries.includes(alias)))
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

// ── Remote ──────────────────────────────────────────────────────────────────

if (REMOTE) {
  if (REPUBLISH.size === 0) {
    console.error('--remote demande --republish=<slug>[,<slug>] : seule la republication va vers une instance.')
    process.exit(1)
  }
  const token = process.env.NUXT_CONTENT_TOKEN?.trim()
  if (!token) {
    console.error('NUXT_CONTENT_TOKEN absent : le jeton de contenu de l\'instance est requis (infisical run --env=prod -- …).')
    process.exit(1)
  }
  try {
    const deps = { remote: REMOTE, token, fetch: globalThis.fetch }
    const wanted = [...REPUBLISH]
    const found = wanted.map(slug => stubs.find(st => st.slug === slug)).filter(Boolean) as { slug: string, path: string }[]
    for (const slug of wanted) {
      if (!found.some(st => st.slug === slug))
        console.log(`⚠ ${slug} : aucun stub de ce nom dans presentations/`)
    }
    const items = await planRemoteRepublish(deps, found.map(st => ({ slug: st.slug, raw: readFileSync(st.path, 'utf8') })), { force: FORCE })

    console.log(`instance : ${REMOTE}`)
    console.log(`mode     : ${APPLY ? 'APPLY (écriture distante)' : 'DRY-RUN (aucune écriture)'}`)
    const label: Record<string, string> = {
      'republish': 'à republier',
      'create': 'à créer (accès dérivés du frontmatter)',
      'identical': 'identique à la version publiée',
      'unpublished-draft': 'REFUSÉ : brouillon édité en ligne et non publié (--force pour écraser)',
    }
    for (const item of items)
      console.log(`  · ${item.slug} — ${label[item.action]} — ${item.title ?? item.slug}, ${item.slides} slides`)

    if (!APPLY) {
      console.log('\nDry-run terminé — rien n\'a été écrit. Relancer avec --apply pour publier.')
      process.exit(0)
    }
    const results = await applyRemoteRepublish(deps, items)
    for (const r of results)
      console.log(`✅ ${r.slug} publié (${r.bytes} octets)`)
    if (results.length === 0)
      console.log('Rien à publier.')
    process.exit(0)
  }
  catch (error: any) {
    console.error(`✖ ${error?.status ? error.message : `${REMOTE} injoignable : ${error?.cause?.message ?? error?.message ?? error}`}`)
    process.exit(1)
  }
}

// ── Database ────────────────────────────────────────────────────────────────

const database = await openDatabaseFile(DATABASE, { readonly: !APPLY })
const { archive } = database.stores

const existing = new Map((await archive.decks()).map(row => [row.slug, row]))
const publishedRaw = new Map([...existing.values()].flatMap(row => row.raw === null ? [] : [[row.slug, row.raw] as const]))
const existingProjects = new Set((await archive.projects()).map(row => row.slug))
const existingAliases = new Set((await archive.aliases()).map(row => row.alias))

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

for (const alias of refusedEntries)
  plan.warnings.push(`entrée de registre "${alias}" ignorée : son alias, son slug ou son frozenBundle contient un caractère autre que des lettres, des chiffres, - et _`)

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
  unlisted: boolean
  raw: string
  needsVersion: boolean
}

const deckPlans: DeckPlan[] = []

// The studio editor converts these forms once the deck is in the database.
// A frozen deck keeps its text: the warning skips it.
function warnLegacyForms(slug: string, raw: string, registryDriven: boolean) {
  if (registryDriven)
    return
  const forms = [...new Set(legacyMentions(raw).map(mention => mention.form))]
  if (forms.length)
    plan.warnings.push(`${slug} : formes anciennes à convertir dans l'éditeur (${forms.map(id => LEGACY_FORMS[id].written).join(', ')})`)
}

for (const stub of stubs) {
  const raw = readFileSync(stub.path, 'utf8')
  const { data, yamlError } = splitFrontmatter(raw)
  if (yamlError) {
    plan.warnings.push(`${stub.slug} : frontmatter illisible, stub ignoré (${yamlError.split('\n')[0]})`)
    continue
  }
  const reg = registryBySlug.get(stub.slug)
  const row = existing.get(stub.slug)
  // Frozen/archived decks are listed from the registry, not from their stub:
  // `presentations.get.ts` takes the registry title and forces `public`. Mirror
  // that here, or the import would silently re-title them and close their access.
  const lifecycle = reg?.lifecycle ?? 'live'
  const registryDriven = isFrozen({ lifecycle })

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
    warnLegacyForms(stub.slug, raw, registryDriven)
    continue
  }

  const project = (data.project as string) ?? null
  if (project)
    projectsUsed.add(project)

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
    unlisted: Boolean(data.unlisted),
    raw,
    // Only publish a new version when the markdown actually changed.
    needsVersion: publishedRaw.get(stub.slug) !== raw,
  }

  deckPlans.push(p)
  if (row)
    plan.decksUpdate.push(p.slug)
  else
    plan.decksCreate.push(p.slug)
  if (p.needsVersion) {
    plan.versionsInsert.push(p.slug)
    warnLegacyForms(p.slug, raw, registryDriven)
  }
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

console.log(`base    : ${describeDatabase(DATABASE)}`)
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
  await database.close()
  console.log('\nDry-run terminé — rien n\'a été écrit. Relancer avec --apply pour appliquer.')
  process.exit(0)
}

// ── Apply ───────────────────────────────────────────────────────────────────

const writes: ArchiveWrite[] = []

for (const [slug, p] of Object.entries(projectsYml))
  writes.push({ kind: 'project', project: { slug, title: p.title ?? slug, order: p.order ?? 0, color: p.color ?? null } })

for (const { slug, raw, needsVersion, ...axes } of deckPlans) {
  writes.push({ kind: 'deck', slug, axes })
  if (needsVersion)
    writes.push({ kind: 'version', slug, raw })
}

for (const h of historical)
  writes.push({ kind: 'alias', alias: h.alias, slug: h.slug })

for (const r of republishPlans) {
  writes.push({ kind: 'version', slug: r.slug, raw: r.raw })
  // A file without a title or a theme keeps the row's.
  writes.push({ kind: 'deck', slug: r.slug, axes: { ...(r.title !== null && { title: r.title }), ...(r.theme !== null && { theme: r.theme }) } })
}

const at = new Date()
await archive.apply(writes, { by: 'content-import', at })
// Every deck that had a row and receives a version: the managed ones taken
// back from their stub, and the rows that predate the managed flag.
const versioned = [...republishPlans, ...deckPlans.filter(d => d.needsVersion && existing.has(d.slug))]
const followed = await followDrafts(database.stores.rewrites, versioned.map(d => ({ slug: d.slug, previous: publishedRaw.get(d.slug) ?? null, next: d.raw })), at)
if (followed.length)
  console.log(`brouillons mis à jour : ${followed.join(', ')}`)
await database.close()

console.log('\n✅ Import appliqué.')

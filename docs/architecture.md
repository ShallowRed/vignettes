# Vignettes Architecture

## System Overview
A Nuxt 4 application that turns MDC markdown into reveal.js slides. Ports and adapters: a framework-free deck core answers what a deck is, the render module draws it, and the studio adds the catalog, the access rules and the editor around it. Every page renders per request in production; the single-deck bundle is the only prerendered output.

## Core Stack
- Nuxt 4 (SSR, file-based routing) with Nitro's `node_server` preset
- @nuxtjs/mdc (markdown parsing, Vue component support)
- reveal.js (presentation framework, client-only)
- PostgreSQL through drizzle-orm, behind the storage ports: node-postgres for a server, PGlite in the process for development and the tests; the SQLite adapter (better-sqlite3) runs an instance that sets `NUXT_DATABASE_DRIVER=sqlite`. Each adapter has its migrations in `layers/studio/server/db/<adapter>/migrations`
- Yjs + Hocuspocus (collaborative draft), CodeMirror 6 (editor)
- nuxt-auth-utils (session, GitHub and Google OAuth)
- @nuxt/ui + Tailwind CSS (app shell), Pinia Colada (client queries); slides themed via SCSS
- zod (deck metadata + config validation), sass (theme compilation)
- pnpm (catalog in pnpm-workspace.yaml), Node 22, vitest

## Directory Structure
The repository holds three kinds of code. `packages/` are published units that know nothing about this instance: the deck core, the Nuxt render module, the two extension modules, the themes and the orthotypography. `layers/studio/` is the application a tenant extends: catalog, access, accounts, editor, collaboration, trash, acceptance kit, with its own `src/`, `server/` and `shared/`. The repository root is one such tenant: it extends the layer, installs the modules, and adds its themes, its brand component and its deployment.

Inside the layer, files import each other by relative path, since `~` resolves to the application's source directory and never to a layer's. The layer redeclares `#shared` so it keeps pointing at the domain it carries.

```
packages/
  core/          the dialect: schema, model, deck resolution, transforms, theme tokens, component contract
  nuxt/          the render module: Reveal layer, generic components, parsers, theme pipeline
  schemas/       pictogram steps, drawn diagrams, guided file reading
  storybook/     story embeds and their scaling
  typographie/   the French orthotypography directive
  freeze/        the static bundle of one deck, and the build toggles it reads
  theme-kit/     engine CSS: semantic tokens, Reveal patches, layouts, scale presets
  theme-dsfr/    the brand-neutral DSFR base

layers/studio/
  src/           pages, catalog and editor components, queries, session
  server/        API routes, storage ports and their PostgreSQL and SQLite adapters, auth, collab, asset routes
  shared/        the domain reached through #shared: access, projects, catalog contract, trash, storage

themes/          this instance's themes, compiled to public/themes/
presentations/   this instance's content space, ignored by git: deck stubs, registry.yml, projects.yml
scripts/         content and build commands, run through mise
test/            unit and golden suites
```

## Domain layer (`#shared`, inside the studio layer)
Ports and adapters: `layers/studio/shared/` holds framework-free, I/O-free domain logic that
both the client and the Nitro server import through `#shared/...`; the adapters that touch
session, crypto, filesystem or YAML sit in `layers/studio/server/utils/`. A `shared/<x>`
module usually has a matching `server/utils/<x>` adapter, as `shared/access` has
`server/utils/access.ts`.

`eslint.config.js` checks these boundaries: `@vignettes/core` imports zod, js-yaml, slugify and its own files; `shared/` imports no framework, no I/O module and no render module, reads no `process.env`, and keeps `yjs` to `shared/collab`; `server/` reads `process.env` through `server/utils/config.ts` alone; drizzle-orm and the database drivers (better-sqlite3, pg, PGlite) are imported by the adapters (`server/db/sqlite/`, `server/db/postgres/`), the test helpers and `test/unit/migrations.test.ts`; `@nuxtjs/mdc` is imported by the render module, the configuration files and the tests. The `exports` of `@vignettes/nuxt` list its public entry points, and its slide helpers stay out of the auto-imports, so a helper reached without an `import` cannot escape these rules.

The deck core is the workspace package `@vignettes/core`, which depends on nothing in the
application and ships its TypeScript sources (`build.transpile` for Vite,
`nitro.externals.inline` for the server bundle).

- **`@vignettes/core/deck`** — "what is the config of this deck?". `resolveDeck()` is the pure pivot
  the three deck routes converge on: it merges layers (preset → stub → note-frontmatter
  whitelist), validates once through the zod `DeckMetaSchema`, and returns metadata + body +
  provenance. Also exposes the **parser port**: `ParserId = 'heading' | 'separator'`,
  `parserIdFor(meta)`, and the `DeckParser` contract. The concrete parsers depend on the MDC
  runtime, so they live in the render module (`PARSERS` registry);
  `usePresentation` selects one via `PARSERS[parserIdFor(metadata)]`.
- **`@vignettes/core/render`** — the writer side: Reveal config defaults,
  iframe sandbox policy, asset-URL rebasing, Storybook embed URL shape, named transforms, print writer.
- **`@vignettes/core/theme`** — theme **tokens** are the single source of truth for a theme's data
  (backgrounds, Reveal dimensions), from which presets, backgrounds, and the generated SCSS
  partial derive; `consistency` cross-checks tokens ↔ compiled CSS ↔ source at boot.
- **`@vignettes/core/status`** — the publication status and lifecycle vocabulary, re-exported by `shared/access`.
- **`shared/access`** — "may this actor view/list/admin this deck?". Pure `Role`,
  `PublicationStatus`, `decideAccess`/`canList` capability matrix, env login→role resolution.
- **`shared/collab`** — markdown ↔ Y.Doc conversion for the collaborative draft.
- **`shared/presentations`** — catalog wire contract + status display config, shared by
  `GET /api/presentations` and the home/admin pages; the history contract and its order
  (`history.ts`); the family rules (`family.ts`: a replacement never loops, a family stays
  inside one folder).
- **`shared/projects`** — project-registry schema (YAML I/O in `server/utils/projects.ts`).

## Data Flow
```
[published version in the database] → [studio server adapters] → [resolveDeck (@vignettes/core/deck)] → [API route JSON]
                                                                                         ↓
[API route] → [usePresentation] → [PARSERS[parserIdFor(metadata)].parse()] → [Slide[]]
                    ↓                         (parser port of @vignettes/core/deck, implemented in @vignettes/nuxt)
             [useAsyncData caching]
                    ↓
        [RevealPresentation + MDCRenderer]
                    ↓
         [useReveal + useTheme]
                    ↓
             [Rendered slides]
```

## Key Patterns

### Rendering Strategy (SSR)
Production runs SSR via the Nitro `node_server` preset (see Deployment). Every page and API route renders per request: the catalog and the decks depend on the session and on the database, neither of which exists at build time, so `nuxt.config.ts` sets no prerender rule outside bundle mode.
- Data fetching goes through Pinia Colada queries over a typed client; SSR requests forward the session cookie with `useRequestFetch`.
- Reveal.js is imported client-side only.
- Bundle mode (`BUNDLE_ONLY_SLUG`) prerenders one deck and its API JSON into a self-contained, JS-free static bundle (`noScripts`, inlined CSS); a Nitro plugin turns the page into a standalone Reveal document.

### Slide Parsing Rules
`splitSlides` of `@vignettes/core/deck` holds the slide boundaries the two parsers, the editor and the catalog share; fenced code and MDC block components are read as content, never as boundaries.

1. **H1**: Title slide (single, keeps content together until first H2)
2. **H2**: Horizontal slide separator
3. **H3**: Vertical slide separator (nested under H2)
4. **HR** (`---`): Alternative horizontal separator
5. Each slide tagged with `headingLevel` for CSS classes (`slide-h1`, `slide-h2`, etc.)
6. **`:slide-background{image="..."}`**: Inline override for per-slide background image; extracted and removed from rendered output by the parser.
7. **Full-slide components** (list in `FULL_SLIDE_COMPONENTS`): skip header/body split, render all children in `body`. CSS class `layout-full` applied.
8. **`:layout{name="..." ...}`**: Slide-level layout annotation. Unlike full-slide components, preserves header/body split. Supports `media-right`, `media-left`, `media-right-wide`, and `media-left-wide` for two-column layouts with media, plus extra props such as `fit="contain|cover"`. The layouts are declared in `DECK_LAYOUTS` of `@vignettes/core/deck`, their geometry in `@vignettes/theme-kit`.

### Storage
`layers/studio/server/db/ports.ts` declares one interface per store and `Stores`, the set an adapter provides; it reuses the ports of `@vignettes/core/deck` and `#shared` and imports no driver. Every method returns a promise, and an operation that must be atomic is one method, which the adapter runs in one transaction. Two adapters implement the ports. `server/db/postgres/` holds a `pgTable` schema, its drizzle migrations and the stores, written once against drizzle's `PgDatabase` and assembled by `createPostgresStores(db)`; node-postgres and PGlite both run them. `server/db/sqlite/` holds the SQLite schema, its migrations and `createSqliteStores(db)`. The two schemas give their tables and columns the same names, so `copySqliteToPostgres()` copies a SQLite database row by row. The rules every adapter applies are in `server/db/`: snapshot retention, the data migrations and the heading-parser rewrite, the free project slug, the identity of an invited account and the spellings of a handle, and how a stored value reads back (an invalid status, grant, role or token scope fails closed).

`readDatabaseConfig()` of `server/db/config.ts` chooses the database from the environment: the PostgreSQL server of `NUXT_DATABASE_URL`, through a pool of five connections whose TLS follows the URL's `sslmode`; otherwise PGlite in `.data/pglite` (`NUXT_PGLITE_DIR`); the SQLite file of `NUXT_DB_PATH` when `NUXT_DATABASE_DRIVER=sqlite`. `server/db/open.ts` opens it with its stores: `openDatabase()` for the server, `openDatabaseFile()` for a script. PGlite accepts one process per directory, so a lock file next to the directory names its holder: a script refuses to start while the development server holds it, and a new worker of the development server waits for the one it replaces.

At boot, a Nitro plugin starts `databaseReady()` of `server/utils/db.ts`, which applies the schema migrations, then the data migrations. Nitro calls a plugin without awaiting it but awaits its `request` hook, so every request waits there until the migrations end, and a migration that fails stops the process. A websocket upgrade and the other boot plugins skip that hook and await `databaseReady()` themselves; `useStores()` throws before it resolves. The accessors of `server/utils/sources.ts`, `collab.ts` and `users.ts` read one store each. The local content scripts open the database through `openDatabaseFile()` and write through the `archive` port. `content-push`, `content-pull` and `theme-rename` reach a deployed instance through the `/api/content/*` routes with its content token, so the instance runs them on whatever database it uses. These modules and the adapters import each other by relative path with the `.ts` extension, so Node runs them without Nuxt.

The store tests are contracts: each suite runs over `ADAPTERS` of `test/unit/helpers/adapters.ts`, SQLite and PGlite in memory, opened once per file and emptied before every test, and checks rows through the table helper of that file. A PGlite instance takes close to 1 GB, so Vitest runs four workers at most. The schema and migration tests run on SQLite alone.

### Deck history
A deck keeps every publication as an immutable `deck_versions` row, and its draft as `deck_draft_snapshots` rows taken while people edit (at most one every five minutes, plus one when the last editor leaves), on each solo save, before a restore, and on demand with a label. `snapshotsToDrop` in `server/db/snapshot-retention.ts` prunes them: the last day whole, then one per hour for a month, then one per day, labelled ones kept, with a cap on each group. Restoring copies a version or a snapshot into the draft through the open collab room when there is one, and keeps the replaced draft as a snapshot, so the history only grows. The logins of the editors between two snapshots are gathered in process memory by the collab hooks: a restart forgets the interval, and the deployment runs one instance. Times are stored to the second; `compareHistoryEntries` orders equal seconds.

### Families
Decks that are variants of one presentation share a free-text `family` on their rows, with no row of its own, and a `variantLabel`; a deck replaced by a newer edition points at it through `supersededBy`. The folder page draws a family as one card, the viewer offers the variants the visitor may open, and `POST /api/presentations/:slug/duplicate` creates a variant or a replacing edition from a deck.

### Interface languages
The studio is translated with `@nuxtjs/i18n`, configured in `layers/studio/nuxt.config.ts`: French by default, English, no locale in the URLs. The first visit follows the language of the browser, the selector in the header changes it, and the cookie `vignettes_locale` keeps the choice. The messages are JSON files in `layers/studio/i18n/locales/<locale>/`, one per area of the interface (`common`, `catalog`, `deck`, `editor`, `reference`, `admin`, `auth`, `recette`); `test/unit/i18n-locales.test.ts` fails when two locales do not carry the same keys. A component calls `useI18n()`; a plain module that produces interface text (CodeMirror extensions, the authoring reference) receives `t` from the component that uses it, and a declarative table holds message keys (`labelKey`). The server answers errors in English.

The chrome of a deck (controls, loading veil, print overlay, enlarge hints) follows the `lang` of the deck instead: `deckMessages` in `packages/core/src/render/deck-messages.ts` carries its texts, so the render packages do not depend on the i18n module and a frozen bundle has them.

### Theme System
Three layers:
- `packages/theme-kit` (`@vignettes/theme-kit`): engine-level CSS shipped with every theme (Reveal patches, MDC `display: contents` bridge, media-layout grid, slide-h1/h2/h3 flex skeleton, quicklinks, neutral semantic tokens, the `layout` scale preset).
- `packages/theme-dsfr` (`@vignettes/theme-dsfr`): the brand-neutral DSFR base (palette, Marianne, light surfaces), usable as is and made to be extended.
- `themes/<name>/` in the application and in the content space (`NUXT_CONTENT_DIR/themes`): a `theme.json` manifest (language, parser, Reveal defaults, backgrounds, aliases), an SCSS entry that `@use`s the packages through sass's `pkg:` importer, and `assets/`.
- `pnpm build:themes` generates the token module from the manifests, compiles each theme to `public/themes/<name>.css` and copies its assets.
- Per-presentation selection via frontmatter (`theme: <name>`), aliases resolved by `resolveThemeName`; the CSS is loaded via `<link>`.
- In development the render module watches the theme directories and reloads the page.

`docs/theme-system.md` holds the full reference.

## Build

1. `pnpm build` runs `build:themes` first (`build-theme-tokens.ts` then `build-themes.ts`), then `nuxt build`.
2. A Nitro plugin applies pending migrations at boot: the repo folders in development, the copies shipped with the output (`.output/server/migrations/<adapter>`) in production.
3. Output lands in `.output/` (server + public); the Docker runtime stage ships that folder only.

In bundle mode (`BUNDLE_ONLY_SLUG`), `nuxt generate` prerenders the one deck and skips the SPA fallbacks (`prerender:generate` hook).

### Client Hydration
- Initial load: SSR HTML
- Hydration: Vue takes over (except JS-free frozen bundles)
- Navigation: client-side routing
- Data: JSON from the API routes, cached by Pinia Colada

## Extending

A **theme** is a directory with a manifest and an SCSS entry, in the application or in the content space; `docs/theme-system.md` holds the recipe.

A **component** is a Vue file plus an entry declared with `registerDeckComponents`, which a Nuxt module or the application does in a plugin. `@vignettes/schemas` and `@vignettes/storybook` are two such modules.

A **parser** implements the `DeckParser` port of `@vignettes/core/deck` and joins the `PARSERS` registry of the render module.

## Deployment
Production is SSR, not static hosting:
- Nitro `node-server` preset (`NITRO_PRESET=node_server`), built into a multi-stage
  `Dockerfile` (deps → build → `node:22-slim` runtime with `.output/` only). In CI the image takes the `.output/` the end-to-end tests ran on, passed as the named build context `output`.
- Content lives in the database; the image holds code only, so a content change never rebuilds it. With `NUXT_DATABASE_URL`, `run-app.sh` starts the app on that PostgreSQL server. Without it, `run-app.sh` sets `NUXT_DATABASE_DRIVER=sqlite`, restores the SQLite file from object storage on an empty volume and runs the app under Litestream replication.
- `.github/workflows/docker-publish.yml` builds + pushes the image to GHCR and deploys it over SSH: push to `staging` deploys the staging instance, push to `main` the production one (infra lives in a separate `vps-infra` repo).
- Runtime secrets are pulled from a self-hosted Infisical instance by `docker-entrypoint.sh` (`infisical run`); secrets never touch disk.
- Single-deck frozen bundles (`mise run freeze -- <alias>`) are the static mode, served by `/frozen/**` behind the deck's access gate.

### One instance at a time

The application runs as a single process. Three pieces of state are kept in the memory of that process: the rate limiter of the password attempts and of the personal tokens (failures, creations, requests) (`server/utils/rate-limit.ts`), the editors of a deck since its last snapshot (`noteContributor` in `server/utils/collab.ts`) and the open collaborative documents of the Hocuspocus server (`useCollabServer`, same file). On an instance running SQLite, the file on a volume, replicated by Litestream, also accepts one writer.

With a second replica, each replica would count the password attempts and the token requests separately, a snapshot would credit only the editors who reached the replica that writes it, and two editors on different replicas would edit the same deck in two documents that never merge. Running several replicas requires moving these three to a shared store first.

# Vignettes Architecture

## System Overview
A Nuxt 4 application that turns MDC markdown into reveal.js slides. Ports and adapters: a framework-free deck core answers what a deck is, the render module draws it, and the studio adds the catalog, the access rules and the editor around it. Every page renders per request in production; the single-deck bundle is the only prerendered output.

## Core Stack
- Nuxt 4 (SSR, file-based routing) with Nitro's `node_server` preset
- @nuxtjs/mdc (markdown parsing, Vue component support)
- reveal.js (presentation framework, client-only)
- SQLite through better-sqlite3 and drizzle-orm; migrations in `layers/studio/server/db/migrations`
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
  server/        API routes, database stores and their migrations, auth, collab, asset routes
  shared/        the domain reached through #shared: access, projects, catalog contract, trash, storage

themes/          this instance's themes, compiled to public/themes/
presentations/   this instance's content: deck stubs, registry.yml, projects.yml
scripts/         content and build commands, run through mise
test/            unit and golden suites
```

## Domain layer (`#shared`, inside the studio layer)
Ports and adapters: `layers/studio/shared/` holds framework-free, I/O-free domain logic that
both the client and the Nitro server import through `#shared/...`; the adapters that touch
session, crypto, filesystem or YAML sit in `layers/studio/server/utils/`. A `shared/<x>`
module usually has a matching `server/utils/<x>` adapter, as `shared/access` has
`server/utils/access.ts`.

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
- **`shared/content`** — declared content-source config + pure fetch-policy decision
  (replaces the implicit submodule + token + ad-hoc-script tangle).
- **`shared/presentations`** — catalog wire contract + status display config, shared by
  `GET /api/presentations` and the home/admin pages; the history contract and its order
  (`history.ts`); the family rules (`family.ts`: a replacement never loops, a family stays
  inside one folder).
- **`shared/projects`** — project-registry schema (YAML I/O in `server/utils/projects.ts`).
- **`shared/build`** — public-deck discovery in the content space.

## Data Flow
```
[published version in SQLite] → [studio server adapters] → [resolveDeck (@vignettes/core/deck)] → [API route JSON]
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
1. **H1**: Title slide (single, keeps content together until first H2)
2. **H2**: Horizontal slide separator
3. **H3**: Vertical slide separator (nested under H2)
4. **HR** (`---`): Alternative horizontal separator
5. Each slide tagged with `headingLevel` for CSS classes (`slide-h1`, `slide-h2`, etc.)
6. **`:slide-background{image="..."}`**: Inline override for per-slide background image; extracted and removed from rendered output by the parser.
7. **Full-slide components** (list in `FULL_SLIDE_COMPONENTS`): skip header/body split, render all children in `body`. CSS class `layout-full` applied.
8. **`:layout{name="..." ...}`**: Slide-level layout annotation. Unlike full-slide components, preserves header/body split. Supports `media-right`, `media-left`, `media-right-wide`, and `media-left-wide` for two-column layouts with media, plus extra props such as `fit="contain|cover"`. The layout name is resolved to a `LayoutStrategy` by the layout registry of `@vignettes/nuxt`.

### Deck history
A deck keeps every publication as an immutable `deck_versions` row, and its draft as `deck_draft_snapshots` rows taken while people edit (at most one every five minutes, plus one when the last editor leaves), on each solo save, before a restore, and on demand with a label. `snapshotsToDrop` in `server/db/snapshot-store.ts` prunes them: the last day whole, then one per hour for a month, then one per day, labelled ones kept, with a cap on each group. Restoring copies a version or a snapshot into the draft through the open collab room when there is one, and keeps the replaced draft as a snapshot, so the history only grows. The logins of the editors between two snapshots are gathered in process memory by the collab hooks: a restart forgets the interval, and the deployment runs one instance. Times are stored to the second; `compareHistoryEntries` orders equal seconds.

### Families
Decks that are variants of one presentation share a free-text `family` on their rows, with no row of its own, and a `variantLabel`; a deck replaced by a newer edition points at it through `supersededBy`. The folder page draws a family as one card, the viewer offers the variants the visitor may open, and `POST /api/presentations/:slug/duplicate` creates a variant or a replacing edition from a deck.

### Theme System
Three layers:
- `packages/theme-kit` (`@vignettes/theme-kit`): engine-level CSS shipped with every theme (Reveal patches, MDC `display: contents` bridge, media-layout grid, slide-h1/h2/h3 flex skeleton, quicklinks, neutral semantic tokens, the `dsfr-layout` scale preset).
- `packages/theme-dsfr` (`@vignettes/theme-dsfr`): the brand-neutral DSFR base (palette, Marianne, light surfaces), usable as is and made to be extended.
- `themes/<name>/` in the application and in the content space (`NUXT_CONTENT_DIR/themes`): a `theme.json` manifest (language, parser, Reveal defaults, backgrounds, aliases), an SCSS entry that `@use`s the packages through sass's `pkg:` importer, and `assets/`.
- `pnpm build:themes` generates the token module from the manifests, compiles each theme to `public/themes/<name>.css` and copies its assets.
- Per-presentation selection via frontmatter (`theme: <name>`), aliases resolved by `resolveThemeName`; the CSS is loaded via `<link>`.
- In development the render module watches the theme directories and reloads the page.

`docs/theme-system.md` holds the full reference.

## Build

1. `pnpm build` runs `build:themes` first (`build-theme-tokens.ts` then `build-themes.ts`), then `nuxt build`.
2. A Nitro plugin applies pending migrations at boot: the repo folder in development, the copy shipped with the output in production.
3. Output lands in `.output/` (server + public); the Docker runtime stage ships that folder only.

In bundle mode (`BUNDLE_ONLY_SLUG`), `nuxt generate` prerenders the one deck and skips the SPA fallbacks (`prerender:generate` hook).

### Client Hydration
- Initial load: SSR HTML
- Hydration: Vue takes over (except JS-free frozen bundles)
- Navigation: client-side routing
- Data: JSON from the API routes, cached by Pinia Colada

## Extending

A **theme** is a directory with a manifest and an SCSS entry, in the application or in the content space; `docs/theme-system.md` holds the recipe.

A **component** is a Vue file plus an entry declared with `registerDeckComponents`, which a Nuxt module or the application does in a plugin. `@vignettes/schemas` and `@vignettes/storybook` are two such modules, and the application declares `RuleCard` the same way.

A **parser** implements the `DeckParser` port of `@vignettes/core/deck` and joins the `PARSERS` registry of the render module.

## Deployment
Production is SSR, not static hosting:
- Nitro `node-server` preset (`NITRO_PRESET=node_server`), built into a multi-stage
  `Dockerfile` (deps → build → `node:22-slim` runtime with `.output/` only).
- Content lives in the SQLite database on a volume; the image holds code only, so a content change never rebuilds it. `run-app.sh` restores the database from object storage on an empty volume and runs the app under Litestream replication.
- `.github/workflows/docker-publish.yml` builds + pushes the image to GHCR and deploys it over SSH: push to `staging` deploys the staging instance, push to `main` the production one (infra lives in a separate `vps-infra` repo).
- Runtime secrets are pulled from a self-hosted Infisical instance by `docker-entrypoint.sh` (`infisical run`); secrets never touch disk.
- Single-deck frozen bundles (`mise run freeze -- <alias>`) are the static mode, served by `/frozen/**` behind the deck's access gate.

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
layers/studio/src/                  # the studio's Nuxt app (its own srcDir)
├── app.vue, layouts/, middleware/, plugins/
├── types/presentation.ts          # Type definitions (Slide, PresentationMetadata, RevealConfig)
├── config/
│   ├── presentation.ts            # Constants (defaults, MDC component mappings)
│   ├── layouts.ts                 # Layout registry & strategy dispatch
│   └── injection-keys.ts          # Typed Vue provide/inject keys
├── utils/
│   ├── slide-ast.ts               # MDC AST → Slide[] + PARSERS registry (pure, stateless)
│   ├── slide-rendering.ts         # Pure helpers: quicklinkParts, getMediaFit, getSlideClasses, resolveSlideBackground
│   ├── slugify.ts                 # slugify + getTextContent
│   └── storybook.ts               # Storybook embed helpers
├── composables/                   # Reactive state & business logic
│   ├── usePresentation.ts         # Data loading with useAsyncData (delegates to the core parser port)
│   ├── useAppSession.ts           # Auth session state
│   ├── useSlideIds.ts             # Deduplicated HTML ids for slides
│   ├── useReveal.ts               # Reveal.js lifecycle management
│   ├── useRevealSync.ts           # Inject sync/instance in child components
│   └── useTheme.ts                # Dynamic CSS theme loading
├── components/
│   ├── AppHeader.vue, PresentationCard.vue, CatalogToolbar.vue, AsyncSection.vue, DeckError.vue
│   ├── RevealPresentation.vue     # Reveal.js wrapper component
│   ├── RevealSlides.vue           # Section scaffolding (iterates Slide[])
│   ├── SlideContent.vue           # Inner slide rendering (layout strategy dispatch)
│   └── mdc/                       # Custom MDC components
│       ├── IconInline.vue         # Inline icon (Iconify, accepts ri:name or ri-name)
│       ├── Columns.vue / Column.vue   # multi-column layout
│       ├── Quote.vue              # Blockquote with attribution
│       ├── Image.vue              # Img with optional caption + Reveal.js lightbox
│       ├── FullScreenImage.vue    # Full-bleed background image slide
│       ├── Iframe.vue             # Embedded iframe
│       ├── Mermaid.vue            # Mermaid diagram renderer
│       ├── Highlight.vue          # Inline highlight
│       ├── SplitSlide.vue         # Split layout
│       ├── PreviewLink.vue        # Link with preview thumbnail
│       └── StoryFrame.vue / Screens.vue   # Storybook story embeds
├── api/, queries/                 # Typed HTTP client + Pinia Colada queries and mutations
├── pages/
│   ├── index.vue                  # Catalog: project folders, filters, deck cards
│   ├── projects/[slug].vue        # One folder's decks
│   ├── slides/[slug].vue          # Deck viewer (published version, or `?draft`)
│   ├── edit/[slug].vue            # Collaborative editor with live preview
│   ├── p/[alias].vue              # Alias route: live deck, or redirect to its frozen bundle
│   ├── unlock/[slug].vue          # Password prompt for semi-private decks
│   ├── users.vue                  # Accounts and global roles (owner)
│   ├── trash.vue                  # Restore or erase trashed decks and folders
│   ├── recette.vue                # Acceptance kit (owner, flag-gated)
│   └── login.vue

layers/studio/server/               # the studio's Nitro server
├── api/
│   ├── presentations*.ts          # Catalog, deck read, create, draft save, publish, trash
│   ├── projects.get.ts, p/[alias].get.ts, media.post.ts
│   ├── admin/                     # Deck metadata, projects, trash, users, grants
│   ├── auth/                      # session.get.ts, providers.get.ts
│   └── recette/                   # Acceptance kit seed + status
├── routes/
│   ├── auth/                      # github, google, logout, dev-login, recette
│   ├── collab.ts                  # Hocuspocus over Nitro's WebSocket
│   ├── media/[...path].ts         # Uploaded images (object storage or .media/)
│   └── frozen/[...path].ts        # Frozen bundle assets, behind the deck's access gate
├── db/                            # drizzle schema, migrations, stores (content, draft, permissions, projects, users)
├── middleware/                     # alias-redirect.ts, app-session.ts
├── plugins/                        # migrations.ts (boot), theme-consistency.ts, nuxtout-deck.ts (bundle mode)
└── utils/                          # Adapters: access, actor, catalog, collab, content-token, db, password, rate-limit, recette, sources, users

layers/studio/shared/               # studio domain, reached through #shared
├── access/      # roles, publication status, access-decision matrix (pure)
├── collab/      # markdown ↔ Y.Doc conversion
├── content/     # content-source config + fetch policy
├── presentations/ # catalog wire contract + status display config
├── projects/    # project-registry schema
└── build/       # bundle toggles, freeze descriptor, public-deck discovery

packages/core/               # @vignettes/core: dialect, schema, model, resolution, transforms, theme tokens
packages/nuxt/               # @vignettes/nuxt: Reveal layer, authoring components, parsers, theme pipeline
packages/schemas/            # @vignettes/schemas: pictogram steps, drawn diagrams, guided file reading
packages/storybook/          # @vignettes/storybook: story embeds and their scaling
packages/typographie/        # @vignettes/typographie: French orthotypography directive
packages/theme-kit/          # Engine CSS layer (semantic tokens, Reveal patches, layouts, presets)
packages/theme-dsfr/         # Brand-neutral DSFR base theme
public/themes/               # Compiled CSS themes and copied assets (build output)
presentations/               # Archive submodule: deck stubs exported from production, registry.yml, projects.yml
themes/                      # Application themes: a manifest, an SCSS entry, assets/
scripts/build-themes.ts      # Theme compilation (manifests in themes/ and in the content space)
plugins/presentation-watcher.js  # Vite plugin watching the content directory
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
  `GET /api/presentations` and the home/admin pages.
- **`shared/projects`** — project-registry schema (YAML I/O in `server/utils/projects.ts`).
- **`shared/build`** — standalone-bundle env toggles, freeze descriptor, public-deck
  discovery; consumed by `nuxt.config.ts`, the frozen-bundle Nitro plugin, and freeze scripts.

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

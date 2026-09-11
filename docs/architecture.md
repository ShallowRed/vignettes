# Nuxt Slides Architecture

## System Overview
Nuxt 4 presentation system converting MDC markdown to reveal.js slides. Ports-and-adapters
architecture: an isomorphic domain core (`shared/`) sits between the client app (`src/`) and
the Nitro server (`server/`). Every page renders per request in production; the only prerendered output is the single-deck bundle mode.

## Core Stack
- Nuxt 4 (SSR, file-based routing) with Nitro's `node_server` preset
- @nuxtjs/mdc (markdown parsing, Vue component support)
- reveal.js (presentation framework, client-only)
- SQLite through better-sqlite3 and drizzle-orm; migrations in `server/db/migrations`
- Yjs + Hocuspocus (collaborative draft), CodeMirror 6 (editor)
- nuxt-auth-utils (session, GitHub and Google OAuth)
- @nuxt/ui + Tailwind CSS (app shell), Pinia Colada (client queries); slides themed via SCSS
- zod (deck metadata + config validation), sass (theme compilation)
- pnpm (catalog in pnpm-workspace.yaml), Node 22, vitest

## Directory Structure
Three top-level layers at the REPO ROOT: `src/` (Nuxt client app, `srcDir: 'src/'`),
`server/` (Nitro server — NOT under `src/`), and `shared/` (isomorphic domain core,
imported via the `#shared` alias). See "Shared Domain Layer" below.

```
src/                                # Nuxt app (srcDir)
├── app.vue, layouts/, middleware/, plugins/, directives/
├── types/presentation.ts          # Type definitions (Slide, PresentationMetadata, RevealConfig)
├── config/
│   ├── presentation.ts            # Constants (defaults, MDC component mappings)
│   ├── layouts.ts                 # Layout registry & strategy dispatch
│   └── injection-keys.ts          # Typed Vue provide/inject keys
├── utils/
│   ├── slide-ast.ts               # MDC AST → Slide[] + PARSERS registry (pure, stateless)
│   ├── slide-rendering.ts         # Pure helpers: quicklinkParts, getMediaFit, getSlideClasses, resolveSlideBackground
│   ├── slugify.ts                 # slugify + getTextContent
│   ├── storybook.ts               # Storybook embed helpers
│   ├── french-typography.ts       # French spacing rules
│   └── dom-text-transformer.ts    # DOM text utilities
├── composables/                   # Reactive state & business logic
│   ├── usePresentation.ts         # Data loading with useAsyncData (delegates to #shared/deck parser port)
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

server/                             # Nitro server (repo root, NOT under src/)
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

shared/                             # Isomorphic domain core (#shared alias) — see below
├── deck/        # deck resolution, parser port, schema, frontmatter, merge, presets, cache
├── access/      # roles, publication status, access-decision matrix (pure)
├── content/     # content-source config + fetch policy
├── render/      # reveal config, Storybook embed, transform pipeline (writer side)
├── theme/       # theme tokens (single source of truth) + consistency check
├── presentations/ # catalog wire contract + status display config
├── projects/    # project-registry schema
└── build/       # bundle toggles, freeze descriptor, public-deck discovery

public/themes/               # Compiled CSS themes (generated)
presentations/               # Archive submodule: deck stubs exported from production, registry.yml, projects.yml
themes/                      # SCSS theme source files
scripts/build-themes.js      # Theme compilation script
plugins/theme-watcher.js     # Vite plugin for theme hot-reload
plugins/presentation-watcher.js
```

## Shared Domain Layer (`shared/`, `#shared` alias)
The core of the current architecture is a ports-and-adapters (hexagonal) design. `shared/`
holds framework-agnostic, I/O-free, unit- and golden-testable domain logic that both the
client (`src/`) and the Nitro server (`server/`) import via `#shared/...`. Ports (interfaces
/ pure functions) live in `shared/`; adapters (session, crypto, HTTP, filesystem, YAML I/O)
live in `server/utils/`. As a rule: a `shared/<x>` module has a matching `server/utils/<x>`
adapter (e.g. `shared/access` decision logic ↔ `server/utils/access.ts` session/crypto).

- **`shared/deck`** — "what is the config of this deck?". `resolveDeck()` is the pure pivot
  the three deck routes converge on: it merges layers (preset → stub → note-frontmatter
  whitelist), validates once through the zod `DeckMetaSchema`, and returns metadata + body +
  provenance. Also exposes the **parser port**: `ParserId = 'heading' | 'separator'`,
  `parserIdFor(meta)`, and the `DeckParser` contract. The concrete parsers depend on the MDC
  runtime so their implementations stay in `src/utils/slide-ast.ts` (`PARSERS` registry);
  `usePresentation` selects one via `PARSERS[parserIdFor(metadata)]`.
- **`shared/access`** — "may this actor view/list/admin this deck?". Pure `Role`,
  `PublicationStatus`, `decideAccess`/`canList` capability matrix, env login→role resolution.
- **`shared/content`** — declared content-source config + pure fetch-policy decision
  (replaces the implicit submodule + token + ad-hoc-script tangle).
- **`shared/render`** — the "writer" side of the deck hexagon: shared Reveal config defaults,
  iframe sandbox policy, asset-URL rebasing, Storybook embed URL shape, named transforms.
- **`shared/theme`** — theme **tokens** are the single source of truth for a theme's data
  (backgrounds, Reveal dimensions), from which presets, backgrounds, and the generated SCSS
  partial derive; `consistency` cross-checks tokens ↔ compiled CSS ↔ source at boot.
- **`shared/presentations`** — catalog wire contract + status display config, shared by
  `GET /api/presentations` and the home/admin pages.
- **`shared/projects`** — project-registry schema (YAML I/O in `server/utils/projects.ts`).
- **`shared/build`** — standalone-bundle env toggles, freeze descriptor, public-deck
  discovery; consumed by `nuxt.config.ts`, the frozen-bundle Nitro plugin, and freeze scripts.

## Data Flow
```
[published version in SQLite] → [server/utils/sources] → [resolveDeck (#shared/deck)] → [API route JSON]
                                                                                         ↓
[API route] → [usePresentation] → [PARSERS[parserIdFor(metadata)].parse()] → [Slide[]]
                    ↓                         (parser port #shared/deck + src/utils/slide-ast.ts)
             [useAsyncData caching]
                    ↓
        [RevealPresentation + MDCRenderer]
                    ↓
         [useReveal + useTheme]
                    ↓
             [Rendered slides]
```

## Key Patterns

### Separation of Concerns
- **Types** (`src/types/`): Shared TypeScript interfaces
- **Config** (`src/config/`): Constants and registries, no reactive state — `presentation.ts` (MDC mappings, backgrounds), `layouts.ts` (layout strategy registry), `injection-keys.ts` (typed provide/inject keys). Deck presets live in `shared/deck/presets.ts` (derived from theme tokens).
- **Shared** (`shared/`): isomorphic domain core imported via `#shared` — see "Shared Domain Layer".
- **Server** (`server/`): Nitro API routes + `server/utils/` I/O adapters over the shared ports.
- **Utils** (`src/utils/`): Pure, stateless functions — `slide-ast.ts` (MDC AST → Slide[] conversion), `slide-rendering.ts` (class/background/media helpers), `slugify.ts`, etc.
- **Composables** (`src/composables/`): Reactive derived state and business logic — `useSlideIds.ts`, `usePresentation.ts`, etc.
- **Components**: Presentation only; `SlideContent.vue` owns inner rendering, `RevealSlides.vue` owns section scaffolding
- **Pages**: Composition, no logic

### Rendering Strategy (SSR)
Production runs SSR via the Nitro `node_server` preset (see Deployment). Every page and API route renders per request: the catalog and the decks depend on the session and on the database, neither of which exists at build time, so `nuxt.config.ts` sets no prerender rule outside bundle mode.
- Data fetching goes through Pinia Colada queries (`src/queries`) over the typed client in `src/api`; SSR requests forward the session cookie with `useRequestFetch`.
- Reveal.js is imported client-side only.
- Bundle mode (`BUNDLE_ONLY_SLUG`) prerenders one deck and its API JSON into a self-contained, JS-free static bundle (`noScripts`, inlined CSS); `server/plugins/nuxtout-deck.ts` turns the page into a standalone Reveal document.

### Slide Parsing Rules
1. **H1**: Title slide (single, keeps content together until first H2)
2. **H2**: Horizontal slide separator
3. **H3**: Vertical slide separator (nested under H2)
4. **HR** (`---`): Alternative horizontal separator
5. Each slide tagged with `headingLevel` for CSS classes (`slide-h1`, `slide-h2`, etc.)
6. **`:slide-background{image="..."}`**: Inline override for per-slide background image; extracted and removed from rendered output by the parser.
7. **Full-slide components** (list in `FULL_SLIDE_COMPONENTS`): skip header/body split, render all children in `body`. CSS class `layout-full` applied.
8. **`:layout{name="..." ...}`**: Slide-level layout annotation. Unlike full-slide components, preserves header/body split. Supports `media-right`, `media-left`, `media-right-wide`, and `media-left-wide` for two-column layouts with media, plus extra props such as `fit="contain|cover"`. The layout name is resolved to a `LayoutStrategy` via `getLayoutStrategy()` in `src/config/layouts.ts` — add a new entry there to extend without touching the template.

### Theme System
Layered SCSS architecture (foundation → preset → skin):
- `themes/shared/` — engine-level CSS shipped with every theme (Reveal patches,
  MDC `display: contents` bridge, media-layout grid, slide-h1/h2/h3 flex
  skeleton, quicklinks, neutral semantic tokens).
- `themes/presets/<name>/` — reusable layout/scale packages (heading sizes,
  rhythm). Skin-agnostic on colors and font-family. Currently: `dsfr-layout`.
- `themes/<name>/` — skins (colors, gradients, font-family). A skin imports
  the foundation, optionally a preset, and sets the `--accent`, `--surface`,
  ... semantic tokens.
- `themes/themes.config.js` — single source of truth for the build pipeline
  (consumed by `scripts/build-themes.js` and `plugins/theme-watcher.js`).
- Compiled to `public/themes/[name].css`, loaded dynamically via `<link>`.
- Per-presentation selection via frontmatter (`theme: <name>`).
- Hot-reload in dev via Vite plugin (watches own dir + `watchExtraDirs`).

See `docs/theme-system.md` for the full reference and the recipe to
create a new theme.

## Component Responsibilities

### usePresentation(slug)
Loads presentation data. Returns `{ presentationData, error, status, refresh }` from useAsyncData.
- Fetches `/api/presentations/${slug}`
- Parses MDC via `parseMarkdown`
- Extracts frontmatter metadata
- Calls `parseSlides()` or `parseSlidesFromSeparators()` from `src/utils/slide-ast.ts`

### src/utils/slide-ast.ts
Pure MDC AST → Slide[] conversion. Not a composable — no Vue reactivity.
- `parseSlides(ast)`: heading-based parser (H1/H2/H3)
- `parseSlidesFromSeparators(rawContent)`: separator-based parser (--- / ----)
- `createSlide(children)`: builds a single Slide from AST nodes
- `getHeadingLevel(children)`: finds first heading tag in children

### useReveal(container, config)
Manages Reveal.js instance. Returns `{ initialize, destroy, getInstance }`.
- Dynamic imports reveal.js
- Merges config with defaults
- Handles initialization/cleanup

### useTheme(themeName)
Theme CSS management. Returns `{ loadTheme, unloadTheme, watchTheme }`.
- Creates/removes `<link>` elements
- Watches reactive theme changes

### RevealPresentation.vue
Thin wrapper component.
- Props: theme, transition, center, config
- Uses useTheme + useReveal
- Lifecycle: onMounted (initialize), onUnmounted (cleanup)
- Provides slot for slide content

### RevealSlides.vue
Iterates `PresentationData.slides` and emits Reveal.js `<section>` scaffolding.
- Uses `useSlideIds` for deduplicated HTML ids
- Uses `getSlideClasses` / `resolveSlideBackground` from `utils/slide-rendering`
- Delegates inner rendering entirely to `<SlideContent>`
- No layout branching — purely structural

### SlideContent.vue
Renders the content of a single slide according to its layout strategy.
- Calls `getLayoutStrategy(slide.layout)` from `src/config/layouts.ts`
- `'full'` strategy: single `MDCRenderer` for the whole slide
- `'default'` strategy: hgroup/header + article + optional media pane + quicklink
- Uses `getMediaFit`, `quicklinkParts` from `utils/slide-rendering`
- Adding a new layout that changes the component tree: add a strategy to `config/layouts.ts` and a branch here

### pages/slides/[slug].vue
Presentation viewer page.
- Extracts slug from route
- Calls usePresentation(slug)
- Maps MDC components via resolveComponent
- Renders with RevealPresentation + MDCRenderer
- Handles loading/error states

## Build

1. `pnpm build` runs `build:themes` first (`build-theme-tokens.ts` then `build-themes.js`), then `nuxt build`.
2. `server/plugins/migrations.ts` applies pending migrations at boot: the repo folder in development, the copy shipped with the output in production.
3. Output lands in `.output/` (server + public); the Docker runtime stage ships that folder only.

In bundle mode (`BUNDLE_ONLY_SLUG`), `nuxt generate` prerenders the one deck and skips the SPA fallbacks (`prerender:generate` hook).

### Client Hydration
- Initial load: SSR HTML
- Hydration: Vue takes over (except JS-free frozen bundles)
- Navigation: client-side routing
- Data: JSON from the API routes, cached by Pinia Colada

## Configuration Files

### nuxt.config.ts
- srcDir: 'src/' (server/ and shared/ stay at repo root)
- modules: ['@pinia/nuxt', '@pinia/colada-nuxt', '@nuxtjs/mdc', 'nuxt-auth-utils', '@nuxt/ui']
- vite.plugins: [tailwindcss(), themeWatcher(), presentationWatcher()] for dev hot-reload
- routeRules: prerender rules exist in bundle mode only (see Rendering Strategy)
- nitro: `experimental.websocket` for the collaboration route, prerender disabled outside bundle mode
- runtimeConfig: `sourceCacheTtlMs` (server-only); OAuth credentials and access lists are read from the environment by nuxt-auth-utils and `shared/access`
- hooks['nitro:config']: in bundle mode, restricts prerendering to the bundle's deck and its API JSON
- hooks['nitro:build:public-assets']: copies `server/db/migrations` next to the server output for the boot-time migration plugin

### src/config/presentation.ts
```ts
DEFAULT_METADATA = { theme: 'dsfr', transition: 'slide', center: true }
DEFAULT_REVEAL_CONFIG = { hash: true, slideNumber: 'c/t', ... }
MDC_COMPONENTS = { ThreeColumns: 'ThreeColumns', TwoColumns: 'TwoColumns', ... }
```

### src/config/layouts.ts
```ts
type LayoutStrategy = 'full' | 'default'
SLIDE_LAYOUT_REGISTRY: Record<string, LayoutStrategy> // maps layout names to rendering strategy
getLayoutStrategy(layout?: string): LayoutStrategy    // falls back to 'default'
```
Extend here to add new layout strategies without touching component templates.

### src/types/presentation.ts
```ts
interface Slide { body: any, verticalSlides?: Slide[], headingLevel?: string }
interface PresentationMetadata { theme: string, transition: string, center: boolean }
interface PresentationData { slides: Slide[], metadata: PresentationMetadata }
interface RevealConfig { hash?: boolean, center?: boolean, ... }
```

## Scripts

### package.json
- `dev`: `nuxt dev` (theme watcher runs via the Vite plugin)
- `dev:themes`: Builds themes → starts dev server
- `build`: Builds themes → SSR build
- `generate`: Builds themes → static generation (bundle mode)
- `build:themes`: `build-theme-tokens.ts` → `build-themes.js` (compiles all SCSS themes)
- `dev:theme`: Watch-compile themes
- `hash-password`: Generate a password hash for a protected deck
- `test` / `test:watch`: Vitest

### scripts/build-themes.js
- Reads themes/ directory
- Compiles SCSS → CSS via sass.compile()
- Outputs to public/themes/
- Supports --watch flag
- Accepts theme name argument

### plugins/theme-watcher.js
Vite plugin for dev mode:
- Watches themes/ directory
- Triggers full-reload on SCSS changes
- Compiles via sass.compile() in buildStart hook

## Extension Points

### New Slide Parser
Create composable implementing `{ parseSlides }` interface, swap in usePresentation.

### New Theme
1. Create `themes/[name]/[name].scss`
2. Run `pnpm build:theme [name]`
3. Use `theme: [name]` in frontmatter

### New MDC Component
1. Create `src/components/mdc/Component.vue`
2. Add to `MDC_COMPONENTS` in config
3. Use `::component-name` in markdown

### Reveal.js Plugins
Add to DEFAULT_REVEAL_CONFIG or pass custom config to RevealPresentation.

## Performance Optimizations
- Source cache: shared TTL cache (`shared/deck/cache`) over content sources + registry
- Code splitting: Reveal.js loaded client-side only
- Lazy loading: Themes loaded on demand
- Caching: useAsyncData deduplicates by key
- Tree-shaking: Unused MDC components removed

## Deployment
Production is SSR, not static hosting:
- Nitro `node-server` preset (`NITRO_PRESET=node_server`), built into a multi-stage
  `Dockerfile` (deps → build → `node:22-slim` runtime with `.output/` only).
- Content lives in the SQLite database on a volume; the image holds code only, so a content change never rebuilds it. `run-app.sh` restores the database from object storage on an empty volume and runs the app under Litestream replication.
- `.github/workflows/docker-publish.yml` builds + pushes the image to GHCR and deploys it over SSH: push to `staging` deploys the staging instance, push to `main` the production one (infra lives in a separate `vps-infra` repo).
- Runtime secrets are pulled from a self-hosted Infisical instance by `docker-entrypoint.sh` (`infisical run`); secrets never touch disk.
- Single-deck frozen bundles (`make bundle-frozen`) are the static mode, served by `/frozen/**` behind the deck's access gate.

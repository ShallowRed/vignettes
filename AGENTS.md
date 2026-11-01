# Vignettes

Instructions for coding agents working in this repository. [CONTRIBUTING.md](CONTRIBUTING.md) holds the checks and the conventions, [docs/architecture.md](docs/architecture.md) the layout and the data flow. To write a deck, use the `vignettes-decks` plugin published from `plugins/vignettes-decks`.

## Toolchain

Node 22, pinned in `mise.toml`: `better-sqlite3` is built for that line. pnpm comes from `packageManager` through corepack. `mise run check` runs what the CI runs: `pnpm lint`, `pnpm exec nuxi typecheck`, `pnpm test`.

## Boundaries

The code keeps these boundaries, and `eslint.config.js` checks them with messages that name the place a change belongs. When a rule fires, move the code there; keep the rule.

- `packages/core` is the deck core: it imports zod, js-yaml, slugify and its own files.
- `layers/studio/shared` is the studio's domain, run on the client and the server: no framework, no I/O, no `process.env`, no render module. `yjs` stays in `shared/collab`.
- `@nuxtjs/mdc` is read by the render module (`packages/nuxt`), the configuration files and the tests.
- drizzle-orm and the database drivers (better-sqlite3, pg, PGlite) are read by the adapters (`layers/studio/server/db/sqlite`, `layers/studio/server/db/postgres`), the test helpers and `test/unit/migrations.test.ts`. Code elsewhere reaches the rows through a port of `server/db/ports.ts`.

Three more rules hold the entry points:

- `layers/studio/server` reads its configuration through `serverConfig()` of `server/utils/config.ts`, the one server module that reads `process.env`.
- `layers/studio/server` reads the host a request reaches through `requestOrigin()` and `requestSide()` of `server/utils/deck-origin.ts`, the one server module that calls `getRequestURL` or `getRequestHost` or reads the `Host` header.
- `@vignettes/nuxt` exposes the entry points its `package.json` lists under `exports`; an import of anything else fails the type check. Its slide helpers stay out of the auto-imports.

## The deck format

The format is defined once, in `packages/core/src/deck`: `split.ts` cuts the slides and gives their source lines, `components.ts` lists the annotations, layouts and components, `schema.ts` validates the frontmatter, `legacy-forms.ts` lists the forms of the earlier format that a conversion rewrites into the current format. The parsers, the editor and the catalog read these; add a rule there, never in one of its readers. A change that renames or retires a form keeps reading it and adds its conversion to `legacy-forms.ts`.

An extension package declares its components as data (`packages/schemas/src/components.ts`, `packages/storybook/src/components.ts`) and registers them in its Nuxt plugin.

The README of `packages/nuxt`, `packages/schemas` and `packages/storybook` holds the reference of each component between `<!-- component: Name -->` and `<!-- /component -->`. After a change to the props or the slots of a component, or to its entry in the contract, run `node scripts/component-reference.ts`: it writes these blocks from the `defineProps`, `withDefaults` and `defineSlots` of the Vue file and their JSDoc, and the `component-attributes.ts` of the package that the editor reads for its completion, its tooltips and its checks. `test/unit/component-reference.test.ts` fails while a README or a `component-attributes.ts` differs from its components. Write a JSDoc comment on each prop and slot, and end the comment of a prop with its French description after `@fr`.

After a change to the format, to `docs/theme-system.md`, to `examples/controle-du-theme.md` or to the README of `packages/nuxt`, `packages/schemas`, `packages/storybook`, `packages/theme-kit` or `packages/theme-dsfr`, run `node scripts/deck-plugin.ts`: it writes the references of the deck authoring plugin, and `test/unit/deck-plugin.test.ts` fails while they differ from their sources.

# Vignettes

Instructions for coding agents working in this repository. [CONTRIBUTING.md](CONTRIBUTING.md) holds the checks and the conventions, [docs/architecture.md](docs/architecture.md) the layout and the data flow. [docs/decisions](docs/decisions/README.md) records the decisions that shape the code, and [docs/design](docs/design/README.md) those of the interface, each with its reasons and its check: read the ones a change touches; [0000](docs/decisions/0000-recording-decisions.md) says how we propose one. To write a deck, use the `vignettes-decks` plugin published from `plugins/vignettes-decks`; to write a theme, the `vignettes-themes` plugin of `plugins/vignettes-themes`.

## Toolchain

Node 22, pinned in `mise.toml`: `better-sqlite3` is built for that line. pnpm comes from `packageManager` through corepack. `mise run check` runs what the CI runs: `pnpm lint`, `pnpm exec nuxi typecheck`, `pnpm test`.

## Pushes

[CONTRIBUTING.md](CONTRIBUTING.md#checks) says what each push runs in the CI.

- Related changes (same audit, same surface, same family of texts) go in one pull request: before opening one, look for an open pull request on the same subject with `gh pr list` and add to it. A stack is one pull request, or pull requests that follow each other, built with `gh stack` from the `github/gh-stack` extension.
- Keep the commits of the stack local until `mise run check` passes and Lucas approves the stack on the local studio. Check every behaviour the stack changes yourself (unit tests, end-to-end tests, the in-app browser), and write in the recette file of the branch only the visual judgments no measure settles, as questions ([CONTRIBUTING.md](CONTRIBUTING.md#local-acceptance)). Run `mise run dev`, then `mise run recette:capture`, and give Lucas the recette address `mise run dev` prints once no capture is missing or stale. Lucas answers in the conversation and names a question by its `id`. When Lucas works on another machine of the tailnet, run `PORTLESS_TAILSCALE=1 mise run dev` and give the Tailscale address it prints. A stack without a visual judgment has no recette file: tell Lucas what you checked and how. Fix the feedback locally, capture again and ask Lucas to try again. Once Lucas approves the stack, remove its recette file and trial decks in a last commit on its top branch, run `mise run test:e2e`, push the stack once, open or update its pull request, then push its top branch to `staging`, without asking again, interface changes included.
- When `origin/staging` holds commits the top branch lacks, push it with `--force-with-lease` if those commits come from an earlier version of the top branch or from pull requests merged into `main`; otherwise ask Lucas. Merging into `main` deploys production: wait for Lucas's explicit approval.
- Lucas tries a documentation change with `mise run site:dev`, and it goes to `main` from its pull request.

## Boundaries

The code keeps these boundaries, and `eslint.config.js` checks them with messages that name the place a change belongs. When a rule fires, move the code there; keep the rule.

- `packages/core` is the deck core: it imports zod, js-yaml, slugify and its own files.
- An extension package (`packages/schemas`, `packages/storybook`) imports `@vignettes/core` and `@vignettes/nuxt`, and no other package of the repository.
- `packages/pptx` writes a deck as a PowerPoint file: it imports `@vignettes/core`, pptxgenjs, jszip and pptx-embed-fonts, and reaches no resource itself (no `fetch`, no DOM). The browser side of the export, images, font and download, is in `packages/nuxt/src/runtime/utils/pptx-export.ts`.
- `layers/studio/shared` is the studio's domain, run on the client and the server: no framework, no I/O, no `process.env`, no render module. `yjs` stays in `shared/collab`.
- `@nuxtjs/mdc` is read by the render module (`packages/nuxt`), the configuration files and the tests.
- [0002](docs/decisions/0002-storage-behind-ports.md) sets which modules import drizzle-orm and the database drivers.

Four more rules hold the entry points:

- `layers/studio/server` reads its configuration through `serverConfig()` of `server/utils/config.ts`, the one server module that reads `process.env`.
- `layers/studio/server` writes a draft through `useDraftStore()` and `writeDraftText()` of `server/utils/collab.ts`, the one server module that reads `useStores().drafts`: each write keeps the Yjs lineage of the stored draft. `ContentRewrites` of `server/db/ports.ts` rewrites a stored draft in its lineage too, for the theme rename, the data migrations and the content scripts.
- [0003](docs/decisions/0003-separate-deck-origin.md) sets which module reads the host a request reaches.
- `@vignettes/nuxt` exposes the entry points its `package.json` lists under `exports`; an import of anything else fails the type check. Its slide helpers stay out of the auto-imports.

## The deck format

The decisions on the format are [0001](docs/decisions/0001-deck-format-in-the-core.md), [0005](docs/decisions/0005-earlier-forms-stay-readable.md) and [0006](docs/decisions/0006-adapter-keys-under-their-adapter.md). In `packages/core/src/deck`, `scan.ts` reads the lines, following fenced code and the MDC blocks, `split.ts` cuts the slides and gives their source lines, `components.ts` lists the annotations, layouts and components, `schema.ts` validates the frontmatter, and `legacy-forms.ts` lists the forms of the earlier format with their conversion.

The README of `packages/nuxt`, `packages/schemas` and `packages/storybook` holds the reference of each component between `<!-- component: Name -->` and `<!-- /component -->`. After a change to the props or the slots of a component, or to its entry in the contract, run `node scripts/component-reference.ts`: it writes these blocks from the `defineProps`, `withDefaults` and `defineSlots` of the Vue file and their JSDoc, and the `component-attributes.ts` of the package that the editor reads for its completion, its tooltips and its checks. `test/unit/component-reference.test.ts` fails while a README or a `component-attributes.ts` differs from its components. Write a JSDoc comment on each prop and slot, end the comment of a prop with its French description after `@fr`, and add `@symbol icon` or `@symbol pictogram` before it on a prop whose value names one.

After a change to the format, to `docs/theme-system.md`, to `examples/controle-du-theme.md` or to the README of `packages/nuxt`, `packages/schemas`, `packages/storybook`, `packages/theme-kit` or `packages/theme-dsfr`, run `node scripts/deck-plugin.ts`: it writes the references of the authoring plugins of `plugins/`, and `test/unit/deck-plugin.test.ts` fails while they differ from their sources.

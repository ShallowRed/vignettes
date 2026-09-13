# Vignettes

A self-hosted catalog and editor for Markdown slide decks. Decks are written in MDC (Markdown with Vue components), rendered with reveal.js, edited collaboratively in the browser, and published as immutable versions with per-deck access rules.

## What it does

- **Catalog**: decks grouped in project folders, filtered by status and project, with a trash for reversible deletion.
- **Editor**: a CodeMirror editor with a live preview, real-time collaboration (Yjs over Hocuspocus), image paste and drop, and a draft that stays separate from what readers see.
- **Publishing**: publishing a draft creates a new immutable version; the catalog shows which decks have unpublished changes; `?draft` previews the draft on the deck page.
- **Access control**: four global roles (anonymous, viewer, editor, owner), four publication statuses (public, private, semi-private with a password, draft), per-deck and per-project grants for collaborators, and pre-provisioned invitations by GitHub or Google handle.
- **Themes**: reveal.js themes compiled from SCSS on an engine package, with a brand-neutral DSFR base (the French state design system) made to be extended, a minimal theme, and a tenant's own brands shipped next to its decks; each deck picks its theme in its frontmatter.
- **Slide components**: columns, quotes, images with lightbox, media layouts, live Storybook embeds, Mermaid diagrams, JSON tours, speaker notes, fragments, and more.
- **Print**: any deck exports to PDF through reveal.js print mode.
- **Frozen bundles**: `mise run freeze -- <alias>` turns a deck into a self-contained static bundle with no server, database or JavaScript, served from object storage under the same access rules as the live deck, so a link stays alive long after the deck stops being maintained.

## Quick start

```bash
mise install          # Node 22, pnpm, portless
mise run dev          # opens https://vignettes.localhost once the app answers
```

In development, `/auth/dev-login?role=owner` signs you in without OAuth. Create a deck from the catalog, or import the example stubs from `presentations/` with `mise run content:import`.

`mise run dev:nuxt` serves the bare Nuxt dev server on `http://localhost:3000` for tools that need a fixed port.

## Writing a deck

A deck is one Markdown file with a frontmatter block:

```markdown
---
title: My deck
theme: dsfr
---

# Title slide

## First section

Content.

### A vertical slide

More content.

::Quote{author="Someone"}
A quote.
::
```

`#` opens the title slide, `##` starts a horizontal slide, `###` a vertical one, and `---` also separates slides. [docs/presentation-format.md](docs/presentation-format.md) says where a deck lives here and points at the reference of each package: the dialect and the generic components in [packages/nuxt](packages/nuxt/README.md), the explanation kit in [packages/schemas](packages/schemas/README.md), the story embeds in [packages/storybook](packages/storybook/README.md).

## Content model

The database is the only runtime source of content. Each deck has a draft (a Yjs document), a list of published versions, and a pointer to the version readers see. The `presentations/` submodule is an archive of deck stubs, exported from production and imported into new instances:

| Task | Effect |
|------|--------|
| `mise run content:plan` | What an import would do, without writing |
| `mise run content:import` | Import the stubs the database does not own yet |
| `mise run content:republish -- <slug>` | New published version from the stub, access rules untouched |
| `mise run content:push -- <slug> --apply` | Same, on a deployed instance over SSH |
| `mise run theme:push -- <name> --apply` | Publish a theme of the content space to the object storage the deployed instances serve it from |
| `mise run assets:push --apply` | Mirror `presentations/assets/` (images, backgrounds, pictograms referenced by decks) to the same object storage |
| `mise run freeze -- <alias>` | Build a deck's frozen bundle and upload it; `--storybook <dir>` embeds a built Storybook, `--no-upload` stops after the build |

## Access model

A request on a deck is decided by a pure function of the actor's role, the deck's status, the grants the actor holds, and the password cookie for semi-private decks. Owners and editors see everything; viewers see public decks plus what they were granted; anonymous readers see public decks. Owners manage accounts, roles, grants, and the trash. The full decision tree is in [docs/access-matrix.md](docs/access-matrix.md).

Sign-in uses GitHub or Google OAuth. Accounts are identified by provider and provider id; an owner can invite a handle before its first login so that grants apply immediately.

## Deployment

The app builds into a Docker image (`Dockerfile`) that runs the Nitro server on port 3000 with a SQLite database on a volume. At start, `docker-entrypoint.sh` fetches the runtime secrets from Infisical with a machine identity and injects them into the process; `run-app.sh` then restores the database from object storage when the volume is empty and runs the app under Litestream replication. Without bucket credentials the app starts on the local database alone.

GitHub Actions builds the image on every push to `main` and `staging`, publishes it to GHCR, and deploys it over SSH to the matching environment. Docs-only commits do not trigger a build.

### Configuration

| Variable | Role |
|----------|------|
| `NUXT_SESSION_PASSWORD` | Session cookie secret, 32 characters minimum |
| `NUXT_OAUTH_GITHUB_CLIENT_ID`, `NUXT_OAUTH_GITHUB_CLIENT_SECRET` | GitHub sign-in |
| `NUXT_OAUTH_GOOGLE_CLIENT_ID`, `NUXT_OAUTH_GOOGLE_CLIENT_SECRET` | Google sign-in; the login page hides providers without credentials |
| `NUXT_OWNER_LOGINS`, `NUXT_EDITOR_LOGINS` | Handles that receive the owner and editor roles at login |
| `NUXT_DB_PATH` | SQLite file, `.data/slides.db` by default |
| `NUXT_CONTENT_TOKEN` | Bearer token that lets `content:republish:prod` publish without a session |
| `NUXT_FROZEN_S3_*` | Object storage for frozen bundles, uploaded media, and the database replica |
| `NUXT_RECETTE_ENABLED` | Enables the acceptance kit (`/recette`) outside development |

`.env.example` lists them with comments. Locally, `.env` is read by Nuxt; in production the variables come from Infisical.

## Development

```bash
mise run test         # vitest: unit and golden tests
mise run lint         # eslint
mise run check        # lint and tests, what the CI runs
mise run build        # themes, then Nuxt
```

Several branches can run at the same time, each in its own worktree with its own database and host name:

```bash
mise run worktree -- feat/my-branch      # ../vignettes.wt/feat-my-branch, ready to run
cd ../vignettes.wt/feat-my-branch && mise run dev
```

The repository layout: `packages/` holds the published units, from the deck core to the Nuxt render module and the themes; `layers/studio/` the application a tenant extends, with its own `src/`, `server/` and `shared/`; the root is one such tenant, with its themes in `themes/`, its content in `presentations/`, its tools in `scripts/` and its suites in `test/`. [docs/architecture.md](docs/architecture.md) describes the whole, [docs/api-routes.md](docs/api-routes.md) the HTTP API, and [docs/recette-staging.md](docs/recette-staging.md) the acceptance kit.

## License

MIT

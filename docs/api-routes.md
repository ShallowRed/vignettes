# API Routes Reference

The Nitro server lives at **`server/` (repo root)**, NOT `src/server/`.
(`srcDir` is `src/`, but the Nitro server directory stays at the repo root.)

Route files:
- `server/api/**`      → `/api/**` handlers
- `server/routes/**`   → top-level routes (`/auth/**`)
- `server/middleware/**`→ request middleware
- `server/utils/**`    → shared helpers (access, actor, presentations, registry, deck-resolution, sources, codimd, password, projects)

Access model (shared, in `shared/access`): actor role is `anonymous | viewer | editor | owner`,
resolved at login from `NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`. Deck publication status is
`public | draft | private | semi-private`, derived from each stub's frontmatter. Two deck routes
(`/api/presentations/[slug]`, `/api/p/[alias]`) share one gate, `gateDeckAccess`.

---

## GET /api/presentations
**Location**: `server/api/presentations.get.ts`

Catalog listing. Role-based visibility via the shared `canList` predicate (same privilege rule as
the per-deck gate). The access-filtered listing lives in `listVisiblePresentations`
(`server/utils/catalog.ts`), the source of truth shared with `GET /api/projects`.

**Process**:
1. Resolve actor role (`getActorRole`).
2. Enumerate stubs (`listAllPresentations`) → `{slug, status}` (status from frontmatter).
3. For each: read content, parse frontmatter (`splitFrontmatter`), join with the registry (`listRegistry`)
   for the canonical `alias` + `lifecycle`.
4. Add frozen/archived decks that left the live layout, sourced from the registry (theme from the archived stub).
5. Filter with `canList({status, lifecycle, role, unlisted})`.

**Response Schema** (`PresentationListItem[]`):
```ts
Array<{
  slug: string
  title: string        // frontmatter title, else slug
  theme: string        // frontmatter theme, else 'dsfr'
  status: 'public' | 'draft' | 'private' | 'semi-private'
  filename: string     // `${slug}.md`
  project?: string     // frontmatter project group
  unlisted?: boolean   // hidden from listings when true
  alias?: string       // registry canonical alias → link to /p/<alias>
  lifecycle?: 'live' | 'frozen' | 'archived'
}>
```

**Error Handling**: returns `[]` on error, logs to console.

**Prerender**: prerendered to `/api/presentations.json` in the default/bundle builds. In node-server
(self-hosted Docker) mode it is served SSR at runtime, not prerendered (see SSG section).

---

## GET /api/presentations/[slug]
**Location**: `server/api/presentations/[slug].get.ts`

Serve one deck by slug, with access gating and CodiMD/HackMD body resolution.

**Parameters**: `slug` (route param).

**Process**:
1. `readPresentationContent(slug)` → stub + derived status (404 if missing, 400 if slug absent).
2. Parse stub frontmatter; it is the source of truth for access + provenance.
3. `gateDeckAccess(event, {slug, status, storedHash: frontmatter.accessPassword})` — may throw
   401/403 (see Access Gate).
4. `resolveDeckForRoute` with `noteOverride: []` (stub frontmatter fully authoritative). If the stub
   declares `source: codimd|hackmd` + `noteId`, the body is fetched from the collaborative note;
   otherwise the stub body is used.

**Response Schema**:
```ts
{
  content: string          // resolved markdown (frontmatter + body)
  status: PublicationStatus
  editUrl?: string         // CodiMD/HackMD edit URL when collaborative
}
```

**Prerender**: prerendered per public slug in the default build. In node-server mode these are SSR
only (the file/folder `/api/presentations` vs `/api/presentations/<slug>` collision would EISDIR at
prerender). Protected decks are always SSR (`routeRules['/api/presentations/**'].ssr`).

---

## GET /api/projects
**Location**: `server/api/projects.get.ts`

Catalog grouping metadata (folders). Access-filtered like `GET /api/presentations`, from the shared
`listVisibleProjects` (`server/utils/catalog.ts`): an unprivileged actor only gets folders that hold
at least one deck they can list; privileged actors get every folder, including empty ones. Session-
dependent — callers must forward the session cookie (`useRequestFetch` in SSR).

**Response Schema** (`Project[]`):
```ts
Array<{ slug, title, order, color, ... }>   // shape from shared/projects
```
**Error Handling**: returns `[]` on error.

---

## GET /api/p/[alias]
**Location**: `server/api/p/[alias].get.ts`

Stable diffused-presentation endpoint (DDR-018). Resolves an alias through the registry and serves
content per lifecycle.

**Parameters**: `alias` (route param; canonical or historical alias).

**Process**:
1. `resolveAlias(alias)` (404 if unknown, 400 if absent).
2. Read the stub: `readArchivedStub` for frozen/archived, else `readPresentationContent` (404 if missing).
3. Derive status via `resolveDeckStatus(stub, entry.access)` (fail-closed).
4. `gateDeckAccess(event, {slug, status, lifecycle, storedHash})` — runs BEFORE the frozen
   short-circuit, so a frozen private deck is not leaked.
5. Frozen/archived → return the static-bundle target. Live → `resolveDeckForRoute` with
   `noteOverride: ['storybook']` (diffused URL uses the public Storybook from the live note).

**Response Schema**:
```ts
// live:
{ lifecycle: 'live', content: string, editUrl?: string }
// frozen | archived:
{ lifecycle: 'frozen' | 'archived', frozenUrl: string, content: '' }
//   frozenUrl = `/frozen/<bundle>/slides/<slug>--standalone/`
```

Note: `/slides/<x>` paths that resolve to a registry entry are 301-redirected to `/p/<alias>` by
`server/middleware/alias-redirect.ts` (single source of truth).

---

## GET /api/codimd/[noteId]
**Location**: `server/api/codimd/[noteId].get.ts`

Fetch any CodiMD/HackMD note and serve it merged with a preset's frontmatter. No access gate (always
public).

**Parameters**:
- `noteId` (route param, 400 if absent)
- `?source=codimd|hackmd` (query, default `codimd`; 400 if other)
- `?preset=<name>` (query, default `dsfr`)

**Process**: load remote note via the `ContentSource` port (502 if unfetchable) → `resolveDeck({preset,
remote, noteOverride: 'all', source})` (the remote note's frontmatter overrides the preset base).

**Response Schema**:
```ts
{ content: string, status: 'public', editUrl: string }
```

---

## POST /api/admin/hash-password
**Location**: `server/api/admin/hash-password.post.ts`

Generate an `accessPassword` hash for semi-private decks. Requires an authenticated session (401 if
none). Body `{ password: string }` (400 if missing/short, min 4 chars).

**Response Schema**:
```ts
{ hash: string, usage: string }   // usage = frontmatter snippet to paste
```

---

## GET /api/auth/session
**Location**: `server/api/auth/session.get.ts`

Current session + resolved access role (so the client can gate by role without re-deriving it).

**Response Schema**:
```ts
{
  user: { id, login, name, avatar, role } | null
  loggedIn: boolean
  role: 'anonymous' | 'viewer' | 'editor' | 'owner'
}
```

---

## GET /auth/github
**Location**: `server/routes/auth/github.get.ts`

GitHub OAuth handler (`defineOAuthGitHubEventHandler`). Requires `NUXT_OAUTH_GITHUB_CLIENT_ID` /
`NUXT_OAUTH_GITHUB_CLIENT_SECRET`. On success, resolves the actor's role from the env login→role map
(`NUXT_OWNER_LOGINS` / `NUXT_EDITOR_LOGINS`; unknown logins → `viewer`), stores it in the session, and
redirects: to a stashed same-origin `auth_redirect` cookie if safe, else `/admin` (privileged) or `/`
(viewer). On error, redirects to `/login?error=oauth_failed`.

---

## GET /auth/logout
**Location**: `server/routes/auth/logout.get.ts`

Clears the user session (`clearUserSession`) and redirects to `/`.

---

## Access Gate (shared, `server/utils/access.ts`)

`gateDeckAccess(event, {slug, status, lifecycle?, storedHash?})` — the single per-status gate used by
`/api/presentations/[slug]` and `/api/p/[alias]`:
1. Resolve actor role (`getActorRole`, from the session set at OAuth login; `anonymous` if none).
2. If the deck has an `accessPassword` hash, grant is satisfied by an `access_<slug>=granted` cookie
   OR a valid `?password=` query (which then sets that cookie, 24h, httpOnly).
3. Feed the pure `decideAccess(...)`; map outcome to HTTP:
   - `allow` → returns normally
   - `needs-password` → 401 `{ data: { requiresPassword: true } }`
   - `deny` → 403 (forbidden) or 401 (auth required)

---

## Content token (`server/utils/content-token.ts`)

`NUXT_CONTENT_TOKEN` lets a script publish a deck from its markdown without a browser
session: `Authorization: Bearer <token>` is accepted, as an `editor` actor named
`content-token`, by the three routes of the markdown write path only — `PUT
/api/presentations/[slug]` (draft), `POST /api/presentations/[slug]/publish`, `GET
/api/presentations/[slug]?draft`. Every other guard ignores it: no upload, no catalog
administration, no user or grant management. Unset, no bearer is ever accepted. Used by
`scripts/content-import.ts --remote` (`mise run content:republish:prod`).

## SSG / Prerendering

Behavior depends on the Nitro preset (`nuxt.config.ts`, `isNodeServer = NITRO_PRESET === node_server`).

**Default build** (`routeRules` + `nitro.prerender`):
- `/`, `/login`, `/slides/public/**` prerendered; `/slides/**`, `/unlock/**`, `/admin/**` SSR.
- `/api/presentations` (index) prerendered.
- `/api/presentations/<slug>` prerendered per public slug (discovered via `discoverPublicSlugs`);
  `/api/presentations/**` otherwise SSR.
- `crawlLinks: true`.

**node-server build** (self-hosted Docker):
- `crawlLinks: false` (avoids following `/auth/github`, which needs OAuth secrets at build).
- `/api/presentations` index NOT prerendered — served SSR at runtime (avoids the
  file-vs-folder EISDIR collision with `/api/presentations/<slug>`).
- Only `/slides/<slug>` pages are prerendered; the SSG page calls the API internally (SSR) without
  writing JSON to disk.

**Bundle build** (`BUNDLE_ONLY_SLUG`, standalone frozen deck):
- Only `/slides/<slug>` + `/api/presentations/<slug>` prerendered; SPA fallbacks and the API index are
  skipped (`prerender:generate` hook).

**Route discovery** (`hooks['nitro:config']`): public slugs discovered by parsing stub frontmatter
(status now lives in frontmatter, not the `public/` folder). `presentations/` is registered as a Nitro
server asset so `useStorage('assets:presentations')` resolves in dev, Node server, and serverless.

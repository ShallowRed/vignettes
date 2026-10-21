# API routes

The Nitro server lives in `server/` at the repository root (`srcDir` is `src/`). `server/api/**` answers under `/api/**`, `server/routes/**` under `/`, `server/middleware/**` runs on every request, and `server/utils/**` holds the adapters (session, access gate, stores, collaboration).

Every route resolves the actor from the session cookie, and the routes listed under [Personal tokens](#personal-tokens) also from a personal token. Roles are `anonymous | viewer | editor | owner`; `owner` and `editor` are privileged. Deck statuses are `public | private | semi-private | draft`. One gate, `gateDeckAccess` in `server/utils/access.ts`, decides reads on a deck; `assertCanEditDeck`, `assertCanShareDeck`, `assertPrivileged`, `assertOwner`, and `assertCanCreateInProject` decide writes. The pure decision functions are in `shared/access`, documented in [access-matrix.md](access-matrix.md). A `sharer` of a deck is whoever may edit it (`canShare`).

## Catalog

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/presentations` | any | Decks the actor may list, with status, project, theme, grants summary, and the unpublished-changes flag |
| `GET /api/projects` | any | Project folders the actor may see; privileged actors see every folder |
| `GET /api/presentations/:slug` | gate | The published version of a deck; `?draft` returns the draft to actors who may edit it |
| `GET /api/presentations/:slug/markdown` | gate | The Markdown of the published version as a `<slug>.md` attachment; `?draft` returns the draft, the live text of an open collab room included, to actors who may edit the deck |
| `GET /api/templates` | any | The ids of the templates a new deck starts from, the default one first |
| `GET /api/p/:alias` | gate | Resolve a directory alias: live decks return their published markdown, frozen ones the bundle URL |
| `POST /api/presentations/:slug/unlock`, `POST /api/p/:alias/unlock` | gate | The password of a semi-private deck, in the body `{ password }`; the right one sets the `access_<slug>` cookie |

## Deck lifecycle

| Route | Access | Effect |
|-------|--------|--------|
| `POST /api/presentations` | privileged, creation right on the project | Create a deck from a template (`template`, `title`, `theme`) or from a Markdown file (`raw`), whose frontmatter gives the title and the theme; a refused frontmatter answers 400 with the key in `data.issues`. The route writes the chosen folder in the draft's frontmatter and removes `status`, which the row holds |
| `POST /api/presentations/:slug/duplicate` | may edit, creation right on the folder | Copy the deck as a new draft: a variant of its family, or the edition replacing it |
| `PUT /api/presentations/:slug` | may edit | Save the markdown as the draft, and keep it as a snapshot |
| `POST /api/presentations/:slug/publish` | may edit | Persist the draft as a new immutable version and point readers to it |
| `GET /api/presentations/:slug/history` | may edit | The published versions and the draft snapshots, newest first, with the version readers see marked |
| `GET /api/presentations/:slug/versions/:id` | may edit | One published version with its markdown |
| `POST /api/presentations/:slug/versions/:id/restore` | may edit | Copy a version into the draft, through the open collab room when there is one; readers keep the current version until the next publish, and the replaced draft stays as a snapshot |
| `POST /api/presentations/:slug/snapshots` | may edit | Keep the draft as it is now, with an optional label; labelled snapshots are never pruned |
| `GET /api/presentations/:slug/snapshots/:id` | may edit | One draft snapshot with its markdown |
| `POST /api/presentations/:slug/snapshots/:id/restore` | may edit | Copy a snapshot into the draft; the replaced draft stays as a snapshot |
| `DELETE /api/presentations/:slug` | owner | Move the deck to the trash; refused while a collaboration session is open |
| `PATCH /api/admin/decks/:slug` | privileged | Edit catalog and access metadata (status, project, password, alias, family, variant, replacement); the title and the theme come from the frontmatter at each publication; a family stays inside one folder and a replacement never loops |
| `POST /api/media?deck=:slug` | may edit | Upload an image; the response gives its `/media/<hash>.<ext>` URL, and the deck is keyed to the image so the serving route knows who may see it; a refusal answers 415 for a format outside PNG, JPG, WEBP, GIF, SVG and AVIF, 413 above 10 MB and 503 when the storage fails, with the cause in its message and in `data.reason` |

## Projects

| Route | Access | Effect |
|-------|--------|--------|
| `POST /api/admin/projects` | privileged | Create a folder; the slug derives from the title |
| `PATCH /api/admin/projects/:slug` | privileged | Rename, recolor, reorder, or change the slug (cascades to decks and grants) |
| `DELETE /api/admin/projects/:slug` | owner | Move the folder and its decks to the trash |

## Trash

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/admin/trash` | privileged | Trashed projects with their deck count, and standalone trashed decks |
| `POST /api/admin/trash/decks/:slug/restore` | privileged | Restore a deck |
| `POST /api/admin/trash/projects/:slug/restore` | privileged | Restore a folder and the decks trashed with it |
| `DELETE /api/admin/trash/decks/:slug` | owner | Erase a deck permanently: grants, aliases, draft, versions |
| `DELETE /api/admin/trash/projects/:slug` | owner | Erase a folder and every deck it holds |

## Sharing

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/admin/decks/:slug/permissions` | sharer | Grants on a deck |
| `POST /api/admin/decks/:slug/permissions` | sharer | Grant `editor` or `viewer` on a deck to an account named by its provider handle, invited when it never logged in; 30 per sharer every 10 minutes |
| `PUT /api/admin/decks/:slug/permissions/:userId` | sharer | Grant `editor` or `viewer` on a deck, with an optional expiry; a sharer other than the owner changes a listed grant, never their own, within the bounds of [access-matrix.md](access-matrix.md#grants-targeted-escalation) |
| `DELETE /api/admin/decks/:slug/permissions/:userId` | sharer | Revoke a deck grant, their own included |
| `GET /api/admin/projects/:slug/permissions` | owner, or a sharer of `?deck=<slug>` in that project | Grants on a project |
| `PUT /api/admin/projects/:slug/permissions/:userId` | owner | Grant `editor` or `viewer` on every deck of a project |
| `DELETE /api/admin/projects/:slug/permissions/:userId` | owner | Revoke a project grant |

A grant never lowers what the global role already allows; `strongerGrant` in `shared/access` folds deck and project grants into the actor's effective right.

## Accounts

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/admin/users` | owner | Every known identity, its role and its number of active personal tokens |
| `POST /api/admin/users/invite` | owner | Pre-provision an account by provider handle so grants apply before its first login |
| `PATCH /api/admin/users/:id` | owner | Change a global role; an owner cannot change their own |
| `DELETE /api/admin/users/:id` | owner | Remove an account, its grants and its personal tokens; refused for yourself and for owners |
| `DELETE /api/admin/users/:id/tokens` | owner | Revoke every active personal token of an account |

## Session

A session ends eight hours after the login, or after two hours without a `GET` request whose response is not cached publicly (`runtimeConfig.session` in `nuxt.config.ts`). A logout or a change of role ends every session of the account. A collaboration socket that is already open stays open until it reconnects: the session is checked when the socket opens, and the messages of the socket do not count as requests.

| Route | Effect |
|-------|--------|
| `GET /api/auth/session` | The current user, or `null`, and the resolved role |
| `GET /api/auth/providers` | The OAuth providers this deployment has credentials for |
| `GET /auth/github`, `GET /auth/google` | OAuth handlers; the role comes from `NUXT_OWNER_LOGINS` and `NUXT_EDITOR_LOGINS`, for a Google address once Google has verified it, and other handles become `viewer` |
| `POST /auth/logout` | End every session of the account and clear the cookie; another method answers 405 |
| `GET /auth/dev-login?role=<role>` | Development only: sign in as a given role |
| `POST /api/admin/hash-password` | Hash a password for a semi-private deck |

## Collaboration and assets

| Route | Effect |
|-------|--------|
| `GET /collab` (WebSocket) | Hocuspocus endpoint; the connection is pinned to one deck and checked against the same edit right as `PUT` |
| `GET /media/<hash>.<ext>` | Uploaded image, streamed from object storage or the local `.media/` directory, with the visibility of the decks referencing it; a visitor who may open none of them gets a 404, as does an image no deck references |
| `GET /frozen/<bundle>/...` | Asset of a frozen bundle, served after `gateDeckAccess` on the bundle's deck |
| `GET /themes/<name>.css`, `GET /themes/<name>/assets/...` | Tenant theme files streamed from object storage; the application's own themes are static files served before this route |
| `GET /images/...`, `GET /backgrounds/...`, `GET /pictograms/...` | Deck assets of the content space, from object storage on a deployment or from `presentations/assets/` in development; files the application ships under `public/` with the same prefix are static and served first |
| `POST /api/admin/themes/reload` | Owner: re-read the published tenant themes now instead of waiting for the cache |

## Acceptance kit

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/recette/status` | owner, or a persona holding the pass | State of the `recette-*` data set |
| `POST /api/recette/seed` | owner | Reset the data set |
| `POST /auth/recette`, body `as=<persona>` | pass | Open the app as a persona |

The kit answers 404 unless `NUXT_RECETTE_ENABLED=1` or the app runs in development. See [recette-staging.md](recette-staging.md).

## Content scripts

| Route | Access | Effect |
|-------|--------|--------|
| `POST /api/content/push` | content token, or privileged | `content:push`: publish stubs of the content space, or say what it would do; a new deck takes its access axes from the frontmatter, a known one keeps them; a `folder` files a created deck there and sets its `project` key, and refuses a known deck filed elsewhere |
| `GET /api/content/decks?slugs=<slug>[,<slug>]` | content token, or privileged | `content:pull`: the catalog axes and the published markdown of live decks; the access password column stays on the instance, and a hash written in the frontmatter travels with the markdown |
| `POST /api/content/theme-rename` | content token, or privileged | `theme:rename`: rename a theme in the `theme` column, the published versions, the snapshots and the drafts of the decks declaring it, in one transaction, or say which decks it would rewrite |

## Personal tokens

A personal token lets the command line and the scripts act as an account without a browser session. A request carries `Authorization: Bearer vgt_…`; `getActor` reads it, refuses an unknown, revoked or expired token with 401, and answers 403 on a route outside `TOKEN_ROUTES` of `server/utils/personal-token.ts` or beyond the token's scope. The token acts with the rights of its account, its role capped at `editor`, as [access-matrix.md](access-matrix.md#personal-tokens) describes.

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/tokens` | session | The tokens of the account, newest first, with their state: active, revoked or expired |
| `POST /api/tokens` | session | Create a token `{ name, scope, days }`: `read` or `write`, 90 days by default, 365 at most; the response carries the secret, and the server shows it only in this response; 10 per account every hour |
| `DELETE /api/tokens/:id` | session | Revoke an active token of the account; remove a revoked or expired one from its list |
| `GET /api/tokens/current` | token | The account, its role as the token applies it, the name, prefix, scope and expiry of the token |
| `DELETE /api/tokens/current` | token | Revoke the token of the request |

The routes that accept a token, with the scope each one requires:

- `read`: `GET /api/tokens/current`, `DELETE /api/tokens/current`, `GET /api/projects`, `GET /api/presentations/:slug` (`?draft` included), `GET /api/presentations/:slug/markdown`, `GET /api/content/decks`.
- `write`, which includes `read`: `POST /api/presentations`, `PUT /api/presentations/:slug`, `POST /api/presentations/:slug/publish`, `POST /api/media`, `POST /api/content/push`, `POST /api/content/theme-rename`.

The server answers 429 after 20 invalid tokens from one client address in 10 minutes, the address that `clientAddress` (`server/utils/client-address.ts`) reads, and after 300 requests with one token in 5 minutes. The security log records each creation and revocation on a `[security] token-creation` or `token-revocation` line, a `[token]` line records each refused token, and each of these lines names the token by its prefix. The `[api]` and `[content]` lines add that prefix to the login.

## Password-protected decks

When a semi-private deck is requested without its cookie, the gate answers 401 with `{ requiresPassword: true }`; the deck page redirects to `/unlock/:slug`, which posts the password to the `unlock` route of the deck and receives the `access_<slug>` cookie for 24 hours.

## Content token

`NUXT_CONTENT_TOKEN` lets a script reach an instance without a browser session. `Authorization: Bearer <token>` is accepted as an `editor` actor by the markdown write path, `PUT /api/presentations/:slug`, `POST /api/presentations/:slug/publish` and `GET /api/presentations/:slug?draft`, which `scripts/content-import.ts --remote` uses, and by the content script routes above. Every other guard ignores it. A personal token of an account with the editor or owner role reaches the same routes.

## Response headers

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Content-Security-Policy` limited to `frame-ancestors 'self'`, `base-uri 'self'`, `object-src 'none'` and `form-action 'self'`: the `/**` route rule of the studio layer sets them, from `server/utils/security-headers.ts`. The studio frames its own pages; to let another site frame a deck, add its origin to `frame-ancestors` in `BASE_DIRECTIVES` of that file. `/media` serves an SVG with its own sandboxing policy and as an attachment. A request received over https, directly or through a proxy that sets `X-Forwarded-Proto`, gets `Strict-Transport-Security: max-age=31536000`, which a proxy that sets its own value replaces.

A rendered page replaces that policy with the one `pagePolicy` writes, `default-src 'self'` at its base. Its scripts are the build's files and the inline scripts of the renderer, which carry a nonce drawn for the response; a script written in a deck's Markdown has no nonce, and the browser blocks it. The speaker view of Reveal writes its inline script into a blank window that takes this policy: `SPEAKER_VIEW_SCRIPT_HASH` allows it, and a unit test fails when an update of reveal.js changes that script. `'unsafe-eval'` lets zod try `new Function` when it builds its first object schema, as `#shared/access` loads; `z.config({ jitless: true })` would come after that. Frames, images and media accept any https origin, since a deck embeds any page and the editor previews the deck as it is typed, and any port of `http://localhost` and `http://127.0.0.1`, for a Storybook or a page served on the presenter's machine. A deck that embeds another http page or image shows an empty frame or a missing image, and the browser console names the blocked address.

## Request bodies

A request body above 2 MB answers 413, and above 11 MB for `POST /api/media`. A chunked body, which declares no `Content-Length`, answers 411.

## Requests from another origin

A request other than `GET`, `HEAD` and `OPTIONS` that does not carry the content token or a valid personal token, and the upgrade of `/collab`, answer 403 when they do not come from a page of the instance: `Origin` must equal the address of the request, or, when the browser sends no `Origin`, `Sec-Fetch-Site` must be `same-origin`. The server builds that address from `Host` and `X-Forwarded-Proto`, as nuxt-auth-utils builds the OAuth callback, and never reads `X-Forwarded-Host`. Configure the proxy to keep `Host` and to send `X-Forwarded-Proto: https`, one value; any other value refuses every write with 403.

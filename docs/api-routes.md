# API routes

The Nitro server lives in `server/` at the repository root (`srcDir` is `src/`). `server/api/**` answers under `/api/**`, `server/routes/**` under `/`, `server/middleware/**` runs on every request, and `server/utils/**` holds the adapters (session, access gate, stores, collaboration).

Every route resolves the actor from the session cookie. Roles are `anonymous | viewer | editor | owner`; `owner` and `editor` are privileged. Deck statuses are `public | private | semi-private | draft`. One gate, `gateDeckAccess` in `server/utils/access.ts`, decides reads on a deck; `assertCanEditDeck`, `assertPrivileged`, `assertOwner`, and `assertCanCreateInProject` decide writes. The pure decision functions are in `shared/access`, documented in [access-matrix.md](access-matrix.md).

## Catalog

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/presentations` | any | Decks the actor may list, with status, project, theme, grants summary, and the unpublished-changes flag |
| `GET /api/projects` | any | Project folders the actor may see; privileged actors see every folder |
| `GET /api/presentations/:slug` | gate | The published version of a deck; `?draft` returns the draft to actors who may edit it |
| `GET /api/p/:alias` | gate | Resolve a directory alias: live decks return their published markdown, frozen ones the bundle URL |

## Deck lifecycle

| Route | Access | Effect |
|-------|--------|--------|
| `POST /api/presentations` | privileged, creation right on the project | Create a deck with starter markdown |
| `PUT /api/presentations/:slug` | may edit | Save the markdown as the draft, and keep it as a snapshot |
| `POST /api/presentations/:slug/publish` | may edit | Persist the draft as a new immutable version and point readers to it |
| `GET /api/presentations/:slug/history` | may edit | The published versions and the draft snapshots, newest first, with the version readers see marked |
| `GET /api/presentations/:slug/versions/:id` | may edit | One published version with its markdown |
| `POST /api/presentations/:slug/versions/:id/restore` | may edit | Copy a version into the draft, through the open collab room when there is one; readers keep the current version until the next publish, and the replaced draft stays as a snapshot |
| `POST /api/presentations/:slug/snapshots` | may edit | Keep the draft as it is now, with an optional label; labelled snapshots are never pruned |
| `GET /api/presentations/:slug/snapshots/:id` | may edit | One draft snapshot with its markdown |
| `POST /api/presentations/:slug/snapshots/:id/restore` | may edit | Copy a snapshot into the draft; the replaced draft stays as a snapshot |
| `DELETE /api/presentations/:slug` | owner | Move the deck to the trash; refused while a collaboration session is open |
| `PATCH /api/admin/decks/:slug` | privileged | Edit catalog and access metadata (title, status, project, password, theme) |
| `POST /api/media?deck=:slug` | may edit | Upload an image; the response gives its `/media/<hash>.<ext>` URL |

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
| `GET /api/admin/decks/:slug/permissions` | owner | Grants on a deck |
| `PUT /api/admin/decks/:slug/permissions/:userId` | owner | Grant `editor` or `viewer` on a deck, with an optional expiry |
| `DELETE /api/admin/decks/:slug/permissions/:userId` | owner | Revoke a deck grant |
| `GET /api/admin/projects/:slug/permissions` | owner | Grants on a project |
| `PUT /api/admin/projects/:slug/permissions/:userId` | owner | Grant `editor` or `viewer` on every deck of a project |
| `DELETE /api/admin/projects/:slug/permissions/:userId` | owner | Revoke a project grant |

A grant never lowers what the global role already allows; `strongerGrant` in `shared/access` folds deck and project grants into the actor's effective right.

## Accounts

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/admin/users` | owner | Every known identity and its role |
| `POST /api/admin/users/invite` | owner | Pre-provision an account by provider handle so grants apply before its first login |
| `PATCH /api/admin/users/:id` | owner | Change a global role; an owner cannot change their own |
| `DELETE /api/admin/users/:id` | owner | Remove an account and its grants; refused for yourself and for owners |

## Session

| Route | Effect |
|-------|--------|
| `GET /api/auth/session` | The current user, or `null`, and the resolved role |
| `GET /api/auth/providers` | The OAuth providers this deployment has credentials for |
| `GET /auth/github`, `GET /auth/google` | OAuth handlers; the role comes from `NUXT_OWNER_LOGINS` and `NUXT_EDITOR_LOGINS`, other handles become `viewer` |
| `GET /auth/logout` | Clear the session |
| `GET /auth/dev-login?role=<role>` | Development only: sign in as a given role |
| `POST /api/admin/hash-password` | Hash a password for a semi-private deck |

## Collaboration and assets

| Route | Effect |
|-------|--------|
| `GET /collab` (WebSocket) | Hocuspocus endpoint; the connection is pinned to one deck and checked against the same edit right as `PUT` |
| `GET /media/<hash>.<ext>` | Uploaded image, streamed from object storage or the local `.media/` directory |
| `GET /frozen/<bundle>/...` | Asset of a frozen bundle, served after `gateDeckAccess` on the bundle's deck |
| `GET /themes/<name>.css`, `GET /themes/<name>/assets/...` | Tenant theme files streamed from object storage; the application's own themes are static files served before this route |
| `GET /images/...`, `GET /backgrounds/...`, `GET /pictograms/...` | Deck assets of the content space, from object storage on a deployment or from `presentations/assets/` in development; files the application ships under `public/` with the same prefix are static and served first |
| `POST /api/admin/themes/reload` | Owner: re-read the published tenant themes now instead of waiting for the cache |

## Acceptance kit

| Route | Access | Effect |
|-------|--------|--------|
| `GET /api/recette/status` | owner, or a persona holding the pass | State of the `recette-*` data set |
| `POST /api/recette/seed` | owner | Reset the data set |
| `GET /auth/recette?as=<persona>` | pass | Open the app as a persona |

The kit answers 404 unless `NUXT_RECETTE_ENABLED=1` or the app runs in development. See [recette-staging.md](recette-staging.md).

## Password-protected decks

When a semi-private deck is requested without its cookie, the gate answers 401 with `{ requiresPassword: true }`; the deck page redirects to `/unlock/:slug`, which verifies `?password=` against the stored hash and sets the `access_<slug>` cookie for 24 hours.

## Content token

`NUXT_CONTENT_TOKEN` lets a script publish a deck without a browser session. `Authorization: Bearer <token>` is accepted as an `editor` actor by the markdown write path only: `PUT /api/presentations/:slug`, `POST /api/presentations/:slug/publish`, and `GET /api/presentations/:slug?draft`. Every other guard ignores it. `scripts/content-import.ts --remote` uses it.

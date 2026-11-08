# Access and visibility matrix

Who can open what, and who sees what in the catalog. The pure decision lives in `layers/studio/shared/access/decide.ts` (`decideAccess` for opening, `canList` for discoverability); the HTTP adapter in `layers/studio/server/utils/access.ts`.

## Decision tree (one request on a deck)

1. **Deck in the trash?** (`decks.deleted_at`): 404 everywhere, read and write alike (`isTrashed` in the edit guards and the collab upgrade).
2. **`managed` row?** The database is the truth for the access axes. Otherwise (a deck never published nor edited by an admin), the frontmatter decides.
3. **`decideAccess(status, role, grant, hasPassword, passwordGranted)`**: allow / deny / needs-password (401 + `data.requiresPassword`). On a read, a refusal answers 401 to an anonymous visitor and 404 to a signed-in account, the answer of a slug that does not exist. On an edit, it answers 403 to whoever can read the deck and 404 otherwise.
4. **`canList(status, lifecycle, role, grant, unlisted)`**: presence in the catalog. Listing and opening are two distinct axes.

## The five axes

| Axis | Values | Decides | Does NOT decide |
|---|---|---|---|
| `status` | `public` / `semi-private` / `private` | who can **open** | nothing else |
| `unlisted` | bool | presence in the public **catalog** | opening (the direct link works) |
| `lifecycle` | `live` / `frozen` / `archived` | presence in the catalog + serving mode (static bundle) | opening (an archived private deck stays private) |
| `published` | derived (`published_version_id`) | whether servable content exists; an unpublished deck is listed to editors only | nothing else |
| `managed` | bool | which source is the truth for the metadata (database vs frontmatter) | access itself |

## Status semantics

- `public` opens to everyone, listed to everyone (except `unlisted`/archived).
- `semi-private` ("Mot de passe") opens with the deck's password. The cookie lasts 24 h and carries an HMAC signature of the slug, the expiry and the password hash: changing the password invalidates the cookies already issued. Attempts are limited to 10 per 5 min per IP. The hash is scrypt with N=2^14, r=8, p=5, a set of the OWASP Password Storage cheat sheet, and a hash of the former parameters is replaced at the next right password. That replacement ends the `access_<slug>` cookies already issued for the deck, and their holders type the password once more. A hash written in the frontmatter of an unmanaged deck stays until its author replaces it with `pnpm hash-password`. It fails closed: with no hash defined, nobody opens it; the UI blocks saving this state without a password. Never listed to the public (reached by link).
- `private` opens to the privileged roles (global Editor/Owner) and the grant holders. Never listed to the public.

### Uploaded images

An image of `/media/<hash>.<ext>` is served with the visibility of the decks that reference it: the `deck_media` table ties each image to the decks whose text cites it, and the route serves the file as soon as one of those decks is open to the visitor. A refusal answers 404, like an image no live deck references. The associations are written at upload and at every write of a deck's text, and deleted when the deck is purged: a deck that once cited an image keeps opening it after removing it from its text.

## Grants (targeted escalation)

- A per-deck grant (`deck_permissions`) opens reading with `viewer` and editing with `editor`, on THAT deck. A grant also makes the deck appear in the holder's catalog, whatever its status and `unlisted`.
- A folder grant (`project_permissions`, the "master key") does the same on EVERY deck of the project. The fold takes the stronger of the two (`strongerGrant`).
- A grant never gives `admin`: the global roles, the folder grants and the accounts belong to the global owner role.
- `canShare(role, grant)` in `decide.ts` decides who shares a deck: whoever may edit the deck (global owner or editor, `editor` grant on the deck or its folder). They list, add, change and remove the per-deck grants, up to `editor`, with an expiry or none. The routes check it through `assertCanShareDeck`, which also answers 404 for a slug with no deck, except to the owner. Two rules bound a sharer other than the owner. `mayWriteGrantOf`: they do not write their own grant; removing it stays open to everyone. `sharingLimit` and `mayGrantUntil`: when their own editor grants expire, the latest of them is their limit, and a grant they give or change ends by that limit, or, without raising its role, no later than it already did; a permanent editor grant or a global role sets no limit. Every sharer, the owner included, makes 30 shares at most every 10 minutes through `POST .../permissions`, since each one may create an invited account.
- The password and the grants are **orthogonal**: the password covers sharing without an account (client demo), the grant covers identified collaboration. A grant holder skips the password.

## Historical pitfall (fixed)

On publish, `content-store.writer.save` re-derived ALL the axes from the frontmatter, overwriting the admin's choices (`managed`). Since the fix, a `managed` row **keeps** its access axes (`status`, `unlisted`, hash) on republish; only the content axes (title, theme, project) follow the frontmatter. A deck's first publish still derives everything from the frontmatter.

## Decision: the editors of a deck share it

A team works on its own instance with one owner, and sharing a deck must not go through that owner. Whoever may edit a deck therefore manages its per-deck grants. The owner keeps the global roles, the folder grants, the accounts page and the trash. The status and the password stay with the global editor and owner roles (`PATCH /api/admin/decks/:slug`).

A sharer other than the owner names an account by its provider handle: they type the GitHub username or the Google address, and `POST /api/admin/decks/:slug/permissions` finds that exact account or invites it, then grants it. The list of accounts (`GET /api/admin/users`) stays with the owner: a search by prefix, or the accounts of the folder, would show logins the sharer does not already know. For the same reason, `PUT .../permissions/:userId` from a sharer other than the owner changes a grant the deck already lists: accepting any id would let them read every login through the grant list. The deck's panel reads the folder grants through the deck (`GET /api/admin/projects/:slug/permissions?deck=<slug>`), since they open the deck too.

## Collaborators (global `viewer` role + `editor` grant)

An invited account holding only an `editor` grant (deck or folder) must be able to work as an editor on that scope. What the server accepts from them, and what the UI shows them:

| Action | Collaborator (`editor` grant) | Where |
|---|---|---|
| Open the editor, save, publish | yes, on the deck of the grant | `assertCanEditDeck` |
| Join the real-time session | yes, on the deck of the grant | `canActorEditDeck` (upgrade) |
| Upload an image | yes, through `?deck=<slug>` checked against the grant | `api/media.post.ts` |
| Download the Markdown | the published version as for reading, the draft on the deck of the grant | `gateDeckAccess`, `assertCanEditDeck` (`[slug]/markdown.get.ts`) |
| Create a presentation | yes, in a folder where they hold an `editor` grant | `assertCanCreateInProject` |
| See the pencil in the catalog | yes (`canEdit` per deck, `myGrant` per folder) | `mayEdit` in `utils/catalog.ts` |
| Change the access metadata (status, password, folder) | no: global editor/owner role | `PATCH /:slug` |
| Share the deck: list, add by handle, change, remove its grants | yes, on the deck of the grant; they remove their own grant and do not change it; a grant they give ends by the end of their own access | `assertCanShareDeck`, `mayWriteGrantOf`, `mayGrantUntil` |
| Read the folder grants in the deck's panel | yes, through a deck of the grant | `GET /api/admin/projects/:slug/permissions?deck=` |
| Folder grants, global roles, trash, accounts | no: owner | `assertOwner` |

## Personal tokens

A personal token acts as its account. `getActor` reads the role in `users` at every request, and the guards read the account's grants, so a lowered role or a removed grant applies to the token from the next request. The rules are in `shared/access/tokens.ts`.

- The role of a token is the role of its account, capped at `editor` (`tokenRole`): a token of the owner acts as a global editor, and the accounts, the folder grants and the trash stay with an owner's session. On an instance that opens the acceptance kit, the token of an owner opens through `POST /auth/recette` the session of a persona whose role is below the owner.
- The scope `read` reads the decks and the folders; `write` also creates, saves and publishes a deck and uploads its images (`scopeAllows`).
- A token reaches the routes listed in `TOKEN_ROUTES` (`server/utils/personal-token.ts`), and [api-routes.md](api-routes.md#personal-tokens) lists them. Sharing a deck and changing its status are left to a person in the studio. The real-time session reads the session cookie.
- Any signed-in account creates its own tokens, an invited collaborator included. A token lasts 90 days by default and 365 days at most. The database keeps the SHA-256 of the secret, and the holder or the owner revokes a token in the studio.

## Concurrent editing

- The editor opens **in real time by default** (Yjs through Hocuspocus in Nitro): every keystroke is merged, the presence shows the peers' names. `?solo` turns the session off for a given deck (manual save; the link is offered when the connection to the real-time session is lost).
- A solo save carries the `stamp` of the loaded draft; if someone saved in the meantime, the server refuses (`409`, `data.conflict`) and keeps the newer draft. A save that loaded no draft carries the `publishedVersion` it loaded, and the server accepts it while the draft still holds that version's text. A solo save is refused while a collab room of the deck is open.
- The draft and the published version are two texts. The editor shows "Enregistré" (real time), then the "Publier" button with a dot or the "En ligne" badge depending on whether the draft differs from the published one; ⌘S captures a snapshot of the draft; the catalog carries the same signal on the card for whoever can edit. `/slides/<slug>?draft` shows the draft as it will be published, reserved to whoever can edit.
- A draft holds one Yjs lineage. The server creates it once, from the published version, before the first room of the deck opens, and every later write of the server (solo save, restore, `content:push`, `content-import`, `content-pull`) goes through the room or rewrites the stored draft in that lineage. A tab whose document holds another lineage, kept open across a server restart for example, is refused: the editor turns read-only and offers to reload, or to copy the text of the tab.
- When a new version is pushed, imported or pulled, a draft that held the text of the replaced version takes the text of the new one; a draft with changes not published stays as it is.

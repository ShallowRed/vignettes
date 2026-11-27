---
status: proposed
date: 2026-11-27
decision-makers: Lucas Poulain
---

# 0023 A publication by an account without a global role sets no access from its text

## Context and problem

Which access does a publication give a deck row that is not `managed`, when the account that publishes it holds no global role? The access axes of a deck (status, `unlisted`, password, folder) belong to the global editor and owner roles in the studio, and a collaborator edits and publishes a deck through an `editor` grant on the deck or its folder. The text of a deck is written by whoever edits it, in the editor or by a client such as the command line, and its frontmatter can carry `status`, `access`, `unlisted`, `accessPassword` and `project`.

## Considered options

- The command line refuses a text with an access key before it sends it. Set aside because the editor and every other client publish through the same route, and the rule belongs to the server.
- A row that is not `managed` and has a published version, published by such an account, leaves the catalog until an owner opens it. Set aside because it needs a new column, and the column `unlisted` of the row already tells whether the public catalog lists the deck.

## Decision

`POST /api/presentations/:slug/publish` passes `accessFromText: isPrivileged(role)` to `writer.save`, and `publicationAccess` of `layers/studio/shared/presentations/publication-access.ts` gives the access axes of the row in both adapters:

- a `managed` row keeps its axes;
- a row that is not `managed` takes the axes of the text when `accessFromText` is true: a global editor or owner, and the content token, which carries the editor role;
- otherwise the text sets no axis. A row without a published version becomes private, without a password and with its own folder. A row with a published version keeps the status and the password of that text, those `gateOptionsOf` serves before the publication, and the folder and `unlisted` of its row. Without a row, the deck becomes private, without a folder.

The publication makes the row `managed` in each case, and its title and theme follow the text.

## Consequences

- A collaborator who publishes a deck never published, in the studio or by the command line, gets a private deck, and an editor or an owner sets its access.
- A row published before the `managed` flag existed, as the migration `0002_legal_king_cobra.sql` of SQLite leaves it, keeps the access visitors already had and its folder, so the grants of its folder still apply. The catalog lists it by `canList` with its column `unlisted`.
- The keys `status`, `access`, `unlisted`, `accessPassword` and `project` of a text published by such an account stay in the text without effect on the row.
- Every caller of `writer.save` passes `accessFromText`, which the type `DeckContentWriter` of `server/db/ports.ts` requires: the type check makes each new caller choose.

## Confirmation

- `test/unit/publish-access.test.ts` checks, in error in the CI, the publication of a row that is not `managed` by a collaborator, by the editor role and by the content token, with and without a published version, through `gateOptionsOf`, the deck route, the grants and the catalog.
- `test/unit/content-store.test.ts` checks `writer.save` with `accessFromText` true and false on both adapters, SQLite and PostgreSQL.

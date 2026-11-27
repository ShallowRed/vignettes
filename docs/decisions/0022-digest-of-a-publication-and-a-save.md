---
status: proposed
date: 2026-11-27
decision-makers: Lucas Poulain
---

# 0022 A publication and a save check the digest of the text they expect

## Context and problem

How does a client that writes a deck without the editor, such as the command line, make sure that the version it publishes is the text it sent, and that its save replaces the draft it read? Someone else can write the draft between two requests of the client, in the editor or by another client, and the stamp of a draft counts seconds on SQLite, so a write within the same second keeps the same stamp. The editor, `content:republish:prod` and the clients of an earlier version send neither digest, and keep working.

## Considered options

- The publication alone compares a digest, and the save keeps the stamp as its only check. Set aside because a write within the second of the stamp passes the save, and the publication that follows then refuses the deck without telling the client that its save replaced a draft it had not read.
- No change of the server: the client reads the draft again before it publishes. Set aside because a keystroke in an open room can reach the draft between that read and the publication, which then publishes a text the client never sent.

## Decision

`POST /api/presentations/:slug/publish` reads an optional body `{ digest }`, the SHA-256 of the text to publish in lowercase hexadecimal, computed by `textDigest` of `@vignettes/core/digest`. With the key, the route computes the digest of the draft it is about to publish, the text of an open room included, answers 409 with `data.conflict` when it differs, and otherwise publishes that same text.

`PUT /api/presentations/:slug` reads an optional key `draftDigest`, the digest of the draft the client read, or `null` when it read none. With the key, after the check of the stamp, the route answers 409 with `data.conflict` when the digest of the stored draft differs, except for a save that read no draft facing the published version it read, as for the stamp.

A malformed key gets a 400 before the route reads the draft. With the key, the 200 answer repeats the digest the route compared, `digest` or `draftDigest`: a client that sent a digest and finds none in the answer is talking to an instance without this check, and stops before it writes again.

## Consequences

- A version published with a digest is the sent text, byte for byte, whatever the precision of the stamp and whether a room is open.
- A save with a digest refuses a draft changed since it was read, also within the second of its stamp.
- Two saves that carry the same digest can still both pass the comparison before either writes; the publication that follows refuses the text of the other save.
- A save checks for an open room before it reads its body, then computes the digest of the stored draft before it writes: a room that opens in between receives the write through its direct connection, as it already could with the comparison of the stamp.
- The editor and the scripts keep their requests and their answers.
- The server, the editor and the command line compute a digest with `@vignettes/core/digest`. A change of `textDigest` on the server alone makes every check refuse, by 409.

## Confirmation

- `test/unit/publish-digest.test.ts` and the block `saving a draft solo (PUT /api/presentations/:slug)` of `test/unit/deck-write-handlers.test.ts` check, in error in the CI, the requests with and without a digest, the 409 of a different draft or room, the 400 of a malformed key and the digest in the answer.
- `test/unit/media-rules.test.ts` checks that `sha256Hex` is the SHA-256 that Node computes.

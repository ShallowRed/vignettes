---
status: accepted
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0003 We serve deck pages from an origin on another registrable domain

## Context and problem

How does a deck page, whose Markdown an author writes and which embeds pages of other sites, run without acting with the session of the studio? A browser treats the subdomains of a registrable domain as one site: a page of a subdomain can set a cookie for the whole domain, which the studio then reads. A person who may read a private deck or a draft opens it while signed in to the studio.

## Considered options

- Serve the decks from a subdomain of the studio's domain, such as `decks.vignettes.io`. Set aside because a page of that subdomain can set a cookie that the studio reads, the session or the OAuth state, and sign the person in to an account of a third party.

## Decision

An instance that serves decks to other people serves its deck pages from an origin on another registrable domain than the studio, named by `NUXT_PUBLIC_DECKS_URL` with `NUXT_STUDIO_URL`: `vignettes.page` beside `app.vignettes.io` in production. A local studio keeps one origin. The deck origin holds no session of the studio. A signed-in person opens a private deck or a draft there with a ticket that the studio seals into the redirect, which the deck origin turns into a view pass for that deck.

## Consequences

- A script of a deck runs on an origin that holds no session of the studio and cannot set a cookie the studio reads.
- Each instance that serves decks to other people needs a second registrable domain, its DNS and its certificates, and a link between a studio page and a deck page is a full navigation that the server redirects.
- Every route belongs to one side: we give a new route its side in `test/unit/origins.test.ts`, and in `#shared/origins` when a deck page reads it. The server reads the host a request reaches in `server/utils/deck-origin.ts` alone, through `requestOrigin()` and `requestSide()`.

## Confirmation

- `test/unit/origins.test.ts` lists every route that Nitro serves with its side, and fails while a route is missing from that list or `routeSide` gives it another side, in error in the CI.
- The `REQUEST_HOST` selectors of `eslint.config.js` refuse a read of the request host outside `server/utils/deck-origin.ts`, in error.
- No check reads whether an instance sets `NUXT_PUBLIC_DECKS_URL` and `NUXT_STUDIO_URL`: we set them when we deploy an instance, following the guide of its platform.

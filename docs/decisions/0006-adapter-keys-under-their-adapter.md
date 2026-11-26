---
status: accepted
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0006 We write the keys of an adapter under the key of that adapter

## Context and problem

Which keys of the frontmatter sit at its root, and where do the settings of the syntax and of the renderer go? The root of the frontmatter describes the presentation: its title, its language, its theme, its status. An author writes the text in MDC and reveal.js renders it, and each has settings of its own.

## Considered options

- A port of syntax, so that another syntax than MDC could replace it. Set aside until a need to import or edit decks in another syntax appears.

## Decision

We write a key that belongs to an adapter under the key of that adapter: `split` under `syntax:` for the MDC syntax, the options of reveal.js under `reveal:`. The root of the frontmatter holds the keys that describe the presentation.

## Consequences

- The keys that would change with another syntax or another renderer sit under one key each.
- When we move a key under its adapter, the core keeps reading it at the root, as an earlier form ([0005](0005-earlier-forms-stay-readable.md)).

## Confirmation

- `DeckMetaSchema` of `packages/core/src/deck/schema.ts` lists the keys of the frontmatter, and the editor marks a key it does not know, as information.
- The reviewer checks by hand where a new key of the frontmatter goes.

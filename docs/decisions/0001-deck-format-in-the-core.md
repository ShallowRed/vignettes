---
status: accepted
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0001 We define the deck format once, in the core

## Context and problem

Where does a rule of the deck format live, so that every program that reads a deck reads it the same way? The parsers, the editor, the catalog and the PowerPoint export read decks, and scripts write the references of the deck authoring plugin from the format; an author sees the same deck in each of them.

## Decision

We define the format once, in `packages/core/src/deck`: the reading of the lines, the cutting into slides, the list of the annotations, layouts and components, and the schema of the frontmatter. The parsers, the editor, the catalog and the scripts read these modules, and we add a new rule there, never in one of its readers. An extension package declares its components as data in its own contract (`packages/schemas/src/components.ts`, `packages/storybook/src/components.ts`) and registers them in its Nuxt plugin.

## Consequences

- A deck reads the same in the editor preview, the catalog card, the published page and the export.
- A change of the format touches the core first, then the references that scripts write from it.
- When a reader needs a rule that the core lacks, we add the rule to the core, with its test, in the same pull request.

## Confirmation

- `test/unit/component-reference.test.ts` and `test/unit/deck-plugin.test.ts` fail while the component references and the plugin references differ from the core and the components they are written from, in error in the CI.
- No lint rule finds a rule of the format written in a reader: the reviewer checks it by hand.

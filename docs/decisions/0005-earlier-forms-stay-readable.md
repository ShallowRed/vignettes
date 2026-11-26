---
status: accepted
date: 2026-11-26
decision-makers: Lucas Poulain
---

# 0005 Earlier forms of the format stay readable, without a version of the syntax

## Context and problem

How does a deck written in an earlier form keep rendering after we rename or retire that form? The versions of a deck stay in the database and render as they were written, and authors keep writing the forms they learned.

## Considered options

- A version of the syntax in the frontmatter (`syntax: { version: N }`), with the earliest version when it is absent. Set aside until a change alters the meaning of a text already written, since a version adds a branch to every reader.

## Decision

When we rename or retire a form, the core keeps reading it. `LEGACY_FORMS` of `packages/core/src/deck/legacy-forms.ts` lists it with its conversion into the current form, and the editor marks it and offers the conversion. The syntax has no version. We track the two retired components that `legacyComponentLayout` reads without an entry in `LEGACY_FORMS`, `FullScreenImage` and `SplitSlide`, in [issue 236](https://github.com/ShallowRed/vignettes/issues/236).

## Consequences

- A published version stays readable after a change of the format, and no migration of the stored versions is needed for it to render.
- `LEGACY_FORMS` grows with each renamed form, and every reader of the format reads both forms.
- The editor marks an earlier form until the author converts it.

## Confirmation

- `test/unit/legacy-forms.test.ts` checks the conversions of `LEGACY_FORMS`, in error in the CI.
- The reviewer checks by hand that a change which renames or retires a form adds it to `LEGACY_FORMS`.

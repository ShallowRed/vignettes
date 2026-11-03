# Contributing

[README.md](README.md) describes the setup and the layout of the repository.

## Checks

```bash
mise run check        # eslint, vue-tsc and the unit tests
mise run test:e2e     # playwright, on the production build
```

The end-to-end suite needs its browsers once: `pnpm exec playwright install chromium firefox`.

`mise run setup` installs a git `pre-push` hook that runs `mise run check`. The CI checks a pull request into `main` once it leaves draft, with the end-to-end tests in Chromium; a pull request higher in a stack is checked when it targets `main`. A push to `staging` builds and deploys without checking, so run both commands above before it. `main` runs every check, Firefox included, before it deploys production.

## Local acceptance

The author of a branch writes the checks to make on the local studio in a recette file, `test/recette/<subject>.yaml`:

```yaml
title: Kit de recette de branche
decks:
  - slug: recette-branche
    file: test/recette/decks/recette-branche.md
checks:
  - account: editor
    page: /edit/recette-branche
    expect: L'éditeur ouvre la présentation d'essai « Recette · Branche ».
```

`decks` lists the trial decks to create, each with a slug that starts with `recette-` and a `.md` deck file of the repository, whose frontmatter gives the status, the theme and the folder. `checks` lists the checks, each with the account that opens the page (`owner`, `editor`, `viewer` or `anonymous`), the page of the studio and the expected result in one sentence. The page is any path of the studio, with its query and its fragment: `/edit/<slug>`, `/slides/<slug>` for the published version, `/slides/<slug>?draft` for the working draft. `#/<slide-id>` opens a slide by its id, and `#/1` opens the second slide by its index from zero. On an instance that serves its decks from their own origin, the studio redirects a deck page there and keeps the account of the check. `layers/studio/shared/recette/branch.ts` holds the schema, and `test/unit/recette-branch.test.ts` validates every recette file of the repository.

`mise run dev` creates the trial decks missing from the database of the worktree, and prints the address that signs in as owner and opens the recette page once the studio answers: `https://<host>/auth/dev-login?role=owner&redirect=/recette`, plus the Tailscale address under `PORTLESS_TAILSCALE=1`. The page lists the recette files the branch adds or changes since `origin/main`, committed or not: for a stack, those of every branch of the stack. Each check opens its page in a new tab with its account, and the button « Recréer les présentations d'essai » replaces the trial decks with their file, after an edit during the recette or a change of the file.

The recette files stay in the repository after the merge, as the record of what was checked.

## Conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, lowercase after the colon, imperative present, in English.

Code, code comments and commit messages are written in English. The texts of the interface are in `layers/studio/i18n/locales/`, in French and English with the same keys.

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

The author of a branch checks every behaviour the branch changes: unit tests, end-to-end tests, the in-app browser. What no measure settles, such as the rendering of a theme, the balance of a layout or the legibility of a slide, the author judges from captures, written as questions in a recette file `test/recette/<subject>.yaml` whose subject is written in lowercase letters, digits and hyphens:

```yaml
title: Contraste des sections du thème DSFR
decks:
  - slug: recette-sections-dsfr
    file: test/recette/decks/recette-sections-dsfr.md
questions:
  - id: section-bleue
    account: anonymous
    page: /slides/recette-sections-dsfr#/section-bleue
    question: Le titre blanc de la section bleue se lit-il bien à distance ?
  - id: panneau-mise-en-page
    account: editor
    page: /edit/recette-sections-dsfr
    question: Le panneau de mise en page se lit-il bien à côté de la diapositive ?
    steps:
      - click: {text: '## Section bleue'}
      - click: {role: button, name: Mise en page}
```

`decks` lists the trial decks to create, each with a slug that starts with `recette-` and a `.md` deck file of the repository, whose frontmatter gives the status, the theme and the folder. Each question has an `id`, unique in its file, the account that opens the page (`owner`, `editor`, `viewer` or `anonymous`), the page of the studio and the question, in 200 characters at most. The page is any path of the studio, with its query and its fragment: `/edit/<slug>`, `/slides/<slug>` for the published version, `/slides/<slug>?draft` for the working draft. `#/<slide-id>` opens a slide by its id, and `#/1` opens the second slide by its index from zero. On an instance that serves its decks from their own origin, the studio redirects a deck page there and keeps the account of the question.

`steps` lists the gestures the capture plays before its picture: `click` an element by its role and accessible name, or by its exact text; `press` a key, by its Playwright name, with `repeat` from 1 to 20; `type` a text. A gesture whose target matches no element or several fails the capture. `full: true` captures the whole page beyond the window. `layers/studio/shared/recette/branch.ts` holds the schema, and `test/unit/recette-branch.test.ts` validates every recette file of the repository.

`mise run dev` creates the trial decks missing from the database of the worktree, opens the catalog signed in as owner once the studio answers, and prints the address of the recette of the branch: `https://<host>/auth/dev-login?role=owner&redirect=/recette/branche`, plus the Tailscale address under `PORTLESS_TAILSCALE=1`. `mise run recette:capture` then republishes the trial decks from their file and captures each question as its account, at the width of a computer and of a phone, in `.data/recette/captures/` of the worktree. The page `/recette/branche` lists the recette files the branch adds or changes since `origin/main`, committed or not, for a stack those of every branch of the stack, and shows each question with its two captures, its gestures and a button that opens its page in a new tab with its account. A capture taken before the last change of the worktree is marked « Capture périmée ». The button « Recréer les présentations d'essai » replaces the trial decks with their file.

Once the author approves the recette, they remove the recette file and its trial decks in a last commit, which the top branch of a stack carries, and the pull request says what they approved. A branch without a visual judgment has no recette file: its pull request says what was checked and how.

## Conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, lowercase after the colon, imperative present, in English.

Code, code comments and commit messages are written in English. The texts of the interface are in `layers/studio/i18n/locales/`, in French and English with the same keys.

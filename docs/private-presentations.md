# Private Presentations

## Architecture

Two-repository model: the public repo (`nuxt-slides`) contains all code, the private repo (`nuxt-slides-content`) contains sensitive presentations. At build time in CI (GitHub Actions / Docker), `scripts/fetch-presentations.js` clones the private repo and copies content into `presentations/` before Nuxt builds — the content is then baked into the Docker image.

Presentations are stored **flat** (`presentations/<slug>.md`); the publication status
lives in each stub's frontmatter (`status: public|semi-private|private|draft`), not in
the folder path (see [presentation-metadata.md](./presentation-metadata.md)). Public
stubs are committed to the public repo; non-public ones live in the private content
repo and are cloned in at build time.

```
nuxt-slides (public)                 nuxt-slides-content (private)
└── presentations/                   └── presentations/
    ├── <public-slug>.md   (in git)      ├── <private-slug>.md
    └── ...                               └── ...   (status: in frontmatter)
```

The `prebuild` and `pregenerate` npm scripts run `fetch-presentations.js` automatically. Without a token (local dev), the script exits silently.

## Setup

### 1. Private repository

```bash
./scripts/init-private-repo.sh
# or manually:
gh repo create ShallowRed/nuxt-slides-content --private
```

The private repo contains only `presentations/{private,semi-private,draft}/`.

### 2. GitHub token

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) scoped to the private repo with **Contents: Read-only**. A classic token with `repo` scope also works.

### 3. CI configuration

The token lives in **Infisical** (not in GitHub): store `PRESENTATIONS_REPO_TOKEN`
in the `nuxt-slides` project (`prod`). The build workflow fetches it at build time
via OIDC (`Infisical/secrets-action`) and passes it to the Docker build as a
BuildKit secret. The other variables use their defaults unless overridden:

| Variable | Required | Default |
|----------|----------|---------|
| `PRESENTATIONS_REPO_TOKEN` | yes (in Infisical) | -- |
| `PRESENTATIONS_REPO` | no | `ShallowRed/nuxt-slides-content` |
| `PRESENTATIONS_BRANCH` | no | `main` |
| `PRESENTATIONS_FOLDERS` | no | `public,draft,private,semi-private` |

## Local development

Private presentations are not synced locally by default. Options:

```bash
# Use the fetch script with a token
export PRESENTATIONS_REPO_TOKEN=ghp_xxx
node scripts/fetch-presentations.js

# Or copy from a local clone
cp -r ../nuxt-slides-content/presentations/* presentations/
```

## Updating content

Push changes to the private repo, then rebuild the app (push to `nuxt-slides` or
re-run the CI workflow) — the content is baked into the Docker image at build time.

## Troubleshooting

- **"Authentication failed"**: token expired or missing `repo` / Contents scope
- **"Repository not found"**: wrong `PRESENTATIONS_REPO` value or token lacks access
- **Content missing after build**: check the GitHub Actions build logs for fetch script output

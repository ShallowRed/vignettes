# Nuxt Slides - Private Content

Private presentations for [nuxt-slides](https://github.com/ShallowRed/nuxt-slides).

## Structure

```
presentations/
├── private/         # GitHub auth required
├── semi-private/    # Password-protected
└── draft/           # Admin only
```

## Usage

Add `.md` files to the appropriate folder, commit, and push. Rebuild the app (push to `nuxt-slides` or re-run its CI) to sync — the content is baked into the image at build time.

For local development, copy content into the main repo's `presentations/` folder:

```bash
cd nuxt-slides
cp -r ../nuxt-slides-content/presentations/* presentations/
pnpm dev
```

## CI configuration

The build fetches this repo using `PRESENTATIONS_REPO_TOKEN`, stored in Infisical
(the `nuxt-slides` project) and pulled at build time by GitHub Actions.

See [private presentations docs](https://github.com/ShallowRed/nuxt-slides/blob/main/docs/private-presentations.md) for details.

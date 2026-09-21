# Contributing

[README.md](README.md) describes the setup and the layout of the repository.

## Checks

```bash
mise run check        # eslint, vue-tsc and the unit tests
mise run test:e2e     # playwright, on the production build
```

The end-to-end suite needs its browsers once: `pnpm exec playwright install chromium firefox`.

## Conventions

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, lowercase after the colon, imperative present, in English.

Code, code comments and commit messages are written in English. The texts of the interface are in `layers/studio/i18n/locales/`, in French and English with the same keys.

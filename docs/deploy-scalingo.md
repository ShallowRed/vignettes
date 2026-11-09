# Deploy on Scalingo

A Scalingo instance runs one tenant. The [Node.js buildpack](https://github.com/Scalingo/nodejs-buildpack) installs the dependencies with the pnpm version of `packageManager` and runs the `scalingo-postbuild` script of `package.json` ([Node.js](https://doc.scalingo.com/languages/nodejs/start)), which calls `build:server`: the Nitro server with the `node_server` preset and a 4 GB heap (the build container has 8 GB, [deployment limits](https://doc.scalingo.com/platform/deployment/limits)). The `web` process of the `Procfile` starts `.output/server/index.mjs` on `$PORT` ([Procfile](https://doc.scalingo.com/platform/app/procfile)). The app runs on the PostgreSQL addon and keeps its files in an S3 bucket: uploaded media, published themes and frozen bundles.

At boot, the server applies the migrations under a PostgreSQL advisory lock and holds the requests until they end, so the new container of a deployment migrates while the old one still serves.

The commands below take the application name from a shell variable, and `sc` runs the Scalingo CLI on that application in the `osc-fr1` region:

```sh
APP=<app>
sc() { scalingo --region osc-fr1 --app "$APP" "$@"; }
```

## Create the application and its database

```sh
scalingo --region osc-fr1 create "$APP"
sc addons-plans postgresql
sc addons-add postgresql <plan>
```

Choose a plan that accepts at least 10 connections: each container opens up to 5, and two containers run together during a deployment.

In the database dashboard, under Settings, Internet Access, enable "Force TLS connections" ([connecting](https://doc.scalingo.com/databases/postgresql/shared-resources/getting-started/connecting)).

## Create the bucket

The example uses Scaleway Object Storage, whose endpoint and region (`https://s3.fr-par.scw.cloud`, `fr-par`) are the defaults of the app.

1. Create a private bucket in `fr-par`. The app reads the objects with its keys and serves them itself under `/media`, `/themes` and `/frozen`.
2. Create an IAM application with an API key, and give it a policy on the project of the bucket with the permission sets `ObjectStorageObjectsRead`, `ObjectStorageObjectsWrite` and `ObjectStorageBucketsRead` ([permission sets](https://www.scaleway.com/en/docs/iam/reference-content/permission-sets/)).

## Create the GitHub OAuth app

In GitHub, under Settings, Developer settings, OAuth Apps, create an app with the homepage `https://<app>.osc-fr1.scalingo.io` and the authorization callback URL `https://<app>.osc-fr1.scalingo.io/auth/github`. With a custom domain, both use that domain. Generate a client secret.

## Set the variables

```sh
sc env-set \
  'NUXT_DATABASE_URL=$SCALINGO_POSTGRESQL_URL' \
  NODE_EXTRA_CA_CERTS=/usr/share/ca-certificates/Scalingo/scalingo-database.pem \
  NUXT_TRUSTED_PROXY_HOPS=1 \
  NUXT_SESSION_PASSWORD="$(node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))")" \
  NUXT_CONTENT_TOKEN="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))")"
```

`NUXT_DATABASE_URL` references the addon URL, as the [environment](https://doc.scalingo.com/platform/app/environment) page describes; the single quotes keep `$` for Scalingo. Without it, the instance runs on PGlite on the container's disk, which Scalingo empties at each restart. node-postgres treats the `sslmode=prefer` of the URL as `verify-full`. To verify the certificate, Node needs the Scalingo database authority, which `NODE_EXTRA_CA_CERTS` adds from the path that the [Symfony page](https://doc.scalingo.com/languages/php/symfony) gives. `NUXT_TRUSTED_PROXY_HOPS=1` counts the router as one proxy, which adds the client address to `X-Forwarded-For` ([routing](https://doc.scalingo.com/platform/internals/routing)): the rate limit of the deck passwords counts by that address.

Then set the other variables in the Environment tab of the dashboard, or with `sc env-set --file <file>` from a file kept outside the repository:

- `NUXT_OAUTH_GITHUB_CLIENT_ID`, `NUXT_OAUTH_GITHUB_CLIENT_SECRET`: the OAuth app.
- `NUXT_OWNER_LOGINS`, `NUXT_EDITOR_LOGINS`: the GitHub handles of the owners and of the editors, separated by commas.
- `NUXT_FROZEN_S3_BUCKET`, `NUXT_FROZEN_S3_ACCESS_KEY_ID`, `NUXT_FROZEN_S3_SECRET_ACCESS_KEY`: the bucket and its API key. Add `NUXT_FROZEN_S3_ENDPOINT` and `NUXT_FROZEN_S3_REGION` for a provider other than Scaleway `fr-par`.
- `NUXT_PUBLIC_DEFAULT_THEME`: the theme of a deck that declares none, `dsfr` by default.
- `NUXT_PUBLIC_HELP_URL=<address of the documentation>`: the « Documentation » link, the `/docs` address of a copy of the Vignettes documentation site, `https://vignettes.io/docs` by default. The editor adds to it the paths of the pages of the documentation.
- `NUXT_PUBLIC_FEEDBACK_URL`: the « Envoyer un retour » link, for example the address of a Tchap room.
- `NUXT_PUBLIC_INSTANCE_NAME`: the name of the instance, after « Vignettes » in the header of the home page, in the page titles and in the link previews.
- `NUXT_PUBLIC_UI_THEME`: the interface theme of the instance, `vignettes` (default), `dsfr` or `lasuite`.
- `NUXT_PUBLIC_UMAMI_HOST`, `NUXT_PUBLIC_UMAMI_STUDIO_WEBSITE_ID`, `NUXT_PUBLIC_UMAMI_DECKS_WEBSITE_ID`: the Umami service of the instance. Set them to count page views.
- `NUXT_PUBLIC_ERROR_TRACKING_DSN`, `NUXT_PUBLIC_ERROR_TRACKING_ENVIRONMENT`: the DSN of the GlitchTip project of the instance and the name of its environment. Set the DSN to report errors.
- `NUXT_PUBLIC_PRIVACY_CONTACT`: the address the privacy page gives for questions about personal data, for an instance that sets one of the variables above.
- `NUXT_PUBLIC_UMAMI_RETENTION_MONTHS`, `NUXT_PUBLIC_ERROR_TRACKING_RETENTION_DAYS`: the periods the privacy page states for page views, in months, and for error reports, in days. Set the periods the services of the instance apply.
- `NUXT_PUBLIC_DECKS_URL`, `NUXT_STUDIO_URL`: the addresses of the deck pages and of the studio, for an instance that serves its decks from an origin of their own (see « Deck origin » in `docs/architecture.md`). The deck address is on another registrable domain than the studio, and both are domains of the app ([custom domains](https://doc.scalingo.com/platform/app/domain)). Leave the canonical domain of the app unset: Scalingo would redirect the deck address to it. The studio redirects any other address, such as `<app>.osc-fr1.scalingo.io`, to `NUXT_STUDIO_URL`.
- `NUXT_PUBLIC_WELCOME`: the sentence under the title of the home page for a visitor without an account, what the instance publishes and for whom.

Scalingo gives a container the variables of the app when it starts it ([environment](https://doc.scalingo.com/platform/app/environment)), and a running container keeps the values it started with. After changing a variable on a running app, restart it so that new containers read the values:

```sh
sc restart
```

## Deploy

With git, from a checkout of the repository ([deploy with git](https://doc.scalingo.com/platform/deployment/deploy-with-git)):

```sh
sc git-setup
git push scalingo main:main
```

Or deploy an archive of a commit with the CLI ([deploy from an archive](https://doc.scalingo.com/platform/deployment/deploy-from-archive)). The archive goes through the Scalingo API, so use it when `git push` stops at the host key of `ssh.osc-fr1.scalingo.com`, whose fingerprint Scalingo does not publish. The archive holds the code in a subdirectory, which `--prefix` creates, and the second argument names the version:

```sh
git archive --format=tar.gz --prefix=vignettes/ -o "${TMPDIR:-/tmp}/vignettes.tar.gz" main
sc deploy "${TMPDIR:-/tmp}/vignettes.tar.gz" "$(git rev-parse --short main)"
```

Or link the GitHub repository, so that each push to `main` deploys:

```sh
scalingo integrations-add github
sc integration-link-create --branch main --auto-deploy https://github.com/ShallowRed/vignettes
```

Then keep one `web` container: the server process keeps the collaboration sessions in its memory.

```sh
sc scale web:1
```

## Publish themes and decks

The tasks run from a checkout of the repository, with the settings of the instance in a [mise environment](https://mise.jdx.dev/configuration/environments.html): `MISE_ENV=<env>` loads `mise.<env>.local.toml`, which git ignores. Its variables replace those of `mise.local.toml` and of the shell; the other variables of `mise.local.toml` still apply. Create it with the address of the instance:

```toml
# mise.<env>.local.toml
[env]
VIGNETTES_REMOTE = "https://<app>.osc-fr1.scalingo.io"
```

With `INFISICAL_DISABLE=1`, `scripts/with-secrets.sh` runs each task on the environment of the shell, where the commands below put the content token and the bucket keys of the instance.

`theme:push` uploads a tenant theme of the content space to the bucket, and the instance reads it within a minute:

```sh
INFISICAL_DISABLE=1 \
NUXT_FROZEN_S3_BUCKET="$(sc env-get NUXT_FROZEN_S3_BUCKET)" \
NUXT_FROZEN_S3_ACCESS_KEY_ID="$(sc env-get NUXT_FROZEN_S3_ACCESS_KEY_ID)" \
NUXT_FROZEN_S3_SECRET_ACCESS_KEY="$(sc env-get NUXT_FROZEN_S3_SECRET_ACCESS_KEY)" \
MISE_ENV=<env> mise run theme:push -- <theme> --apply
```

`MISE_ENV=<env> mise run assets:push -- --apply`, with the same variables, uploads the images of `presentations/assets` that the decks reference.

`content:push` sends deck stubs of the content space to the instance through its content routes. Without `--apply`, it prints what it would do:

```sh
INFISICAL_DISABLE=1 \
NUXT_CONTENT_TOKEN="$(sc env-get NUXT_CONTENT_TOKEN)" \
MISE_ENV=<env> mise run content:push -- <slug>[,<slug>] --apply
```

For a republished deck, the output says `brouillon mis à jour` when its draft held the text of the replaced version and takes the text of the new one, and `brouillon gardé` when its draft holds changes not published, which stay in the editor.

A new deck goes to the folder that the `project` key of its frontmatter names. `--folder <slug>` creates it in that folder of the instance and sets its `project` key to it. The instance refuses a folder it lacks, which you create in the studio first, and a known deck filed in another folder, which you move from the studio.

## Check the instance

- `sc logs --lines 200` shows `Listening on` and the data migrations that ran.
- `curl -s https://$APP.osc-fr1.scalingo.io/api/auth/providers` answers `{"github":true,"google":false}`.
- Sign in with GitHub at `/login` with a handle of `NUXT_OWNER_LOGINS`: the header shows the owner menu.
- Open a deck in the editor in two browsers: a change typed in one appears in the other.
- Upload an image in a deck, restart with `sc restart`, and reload the deck: the image is still there.

# syntax=docker/dockerfile:1
#
# Image de l'app Nuxt (SSR / Nitro node-server), déployée en conteneur sur le VPS.
# Build multi-stage :
#   deps    -> `pnpm install` isolé (couche mise en cache tant que le lockfile ne bouge pas)
#   build   -> `pnpm build:server` -> .output/ auto-suffisant (Nitro trace/bundle ses deps)
#   output  -> le contenu de .output/, à la racine de l'étape
#   packages -> the .deb files of Infisical and Litestream, checked by SHA-256
#   runtime -> node:22-slim + .output/ uniquement. Pas de node_modules, pas de git.
#
# La CI passe le .output/ sur lequel ses tests e2e ont tourné comme contexte
# nommé `output`, qui remplace l'étape du même nom : deps et build ne tournent pas.
#
# L'image ne contient aucun deck : le contenu est dans la base et le bucket.

FROM node:22-slim@sha256:a6385bc33f0f9d6a08482c87f52baee537a9184e2b47dea1ed97caac62f8960c AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ---- deps : install isolé pour maximiser le cache de couche ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/theme-kit/package.json packages/theme-kit/
COPY packages/theme-dsfr/package.json packages/theme-dsfr/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build : nuxt build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NUXT_TELEMETRY_DISABLED=1
# build:server raises the Node heap: the Nitro build needs more than the default.
RUN pnpm build:server

# ---- output : le serveur construit, remplacé en CI par le build testé ----
FROM scratch AS output
COPY --from=build /app/.output /

# ---- packages : when you change a version, copy its SHA-256 from the checksums.txt of the release ----
FROM scratch AS packages-amd64
ADD --checksum=sha256:6576b8680966af45787c48b071d49c021802c444d9a48e87e5feb491c187b0d5 \
    https://github.com/Infisical/cli/releases/download/v0.43.104/infisical_0.43.104_linux_amd64.deb /infisical.deb
ADD --checksum=sha256:2039868cd4b8a95e1d674bbb6546a4db3ea7a014d0c3bd1ff98db01f03efb788 \
    https://github.com/benbjohnson/litestream/releases/download/v0.5.14/litestream-0.5.14-linux-x86_64.deb /litestream.deb

FROM scratch AS packages-arm64
ADD --checksum=sha256:0c0a580b38502997fba2af0972e59ff38882f12cb13fc6a07c5958c99810fed3 \
    https://github.com/Infisical/cli/releases/download/v0.43.104/infisical_0.43.104_linux_arm64.deb /infisical.deb
ADD --checksum=sha256:998acfc8724b0de5a23e9dde7fe16276adba5ad2a7acd44a8e2901861d4b7784 \
    https://github.com/benbjohnson/litestream/releases/download/v0.5.14/litestream-0.5.14-linux-arm64.deb /litestream.deb

FROM packages-${TARGETARCH} AS packages

# ---- runtime : minimal + CLI Infisical pour l'injection des secrets ----
FROM node:22-slim@sha256:a6385bc33f0f9d6a08482c87f52baee537a9184e2b47dea1ed97caac62f8960c AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NUXT_TELEMETRY_DISABLED=1
ENV INFISICAL_DISABLE_UPDATE_CHECK=true

# The entrypoint fetches the secrets with the Infisical CLI at start (machine
# identity, then `infisical run`). ca-certificates is for the TLS of the public
# URL of the Infisical API.
RUN --mount=type=bind,from=packages,target=/packages \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && dpkg -i /packages/infisical.deb /packages/litestream.deb \
    && rm -rf /var/lib/apt/lists/*

COPY --from=output / ./.output
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh run-app.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh /usr/local/bin/run-app.sh \
    && mkdir -p /app/.data && chown node:node /app/.data

EXPOSE 3000
USER node
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["/usr/local/bin/run-app.sh"]

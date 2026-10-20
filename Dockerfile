# syntax=docker/dockerfile:1
#
# Image de l'app Nuxt (SSR / Nitro node-server), déployée en conteneur sur le VPS.
# Build multi-stage :
#   deps    -> `pnpm install` isolé (couche mise en cache tant que le lockfile ne bouge pas)
#   build   -> `pnpm build:server` -> .output/ auto-suffisant (Nitro trace/bundle ses deps)
#   output  -> le contenu de .output/, à la racine de l'étape
#   runtime -> node:22-slim + .output/ uniquement. Pas de node_modules, pas de git.
#
# La CI passe le .output/ sur lequel ses tests e2e ont tourné comme contexte
# nommé `output`, qui remplace l'étape du même nom : deps et build ne tournent pas.
#
# L'image ne contient aucun deck : le contenu est dans la base et le bucket.

FROM node:22-slim AS base
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

# ---- runtime : minimal + CLI Infisical pour l'injection des secrets ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV NUXT_TELEMETRY_DISABLED=1
ENV INFISICAL_DISABLE_UPDATE_CHECK=true

# CLI Infisical épinglé : l'entrypoint l'utilise pour récupérer les secrets au
# démarrage (machine identity -> `infisical run`). ca-certificates conservé pour
# le TLS si l'API Infisical est jointe via son URL publique.
ARG INFISICAL_CLI_VERSION=0.43.104
ARG LITESTREAM_VERSION=0.5.14
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
    && apt-get update \
    && apt-get install -y --no-install-recommends "infisical=${INFISICAL_CLI_VERSION}" \
    && ARCH="$(dpkg --print-architecture | sed 's/amd64/x86_64/')" \
    && curl -fsSL -o /tmp/litestream.deb \
       "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-${ARCH}.deb" \
    && dpkg -i /tmp/litestream.deb && rm /tmp/litestream.deb \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
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

# syntax=docker/dockerfile:1
#
# Image de l'app Nuxt (SSR / Nitro node-server), déployée en conteneur sur le VPS.
# Build multi-stage :
#   deps    -> `pnpm install` isolé (couche mise en cache tant que le lockfile ne bouge pas)
#   build   -> clone le contenu privé (submodule `presentations/`) via un build-secret,
#              puis `pnpm build` -> .output/ auto-suffisant (Nitro trace/bundle ses deps)
#   runtime -> node:22-slim + .output/ uniquement. Pas de node_modules, pas de git.
#
# Le contenu privé est BAKÉ dans l'image au build (le build CI clone depuis Git) :
# l'image GHCR doit donc rester PRIVÉE, et un changement de contenu = un rebuild.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ---- deps : install isolé pour maximiser le cache de couche ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---- build : fetch contenu privé + nuxt build ----
FROM base AS build
# git : nécessaire à scripts/fetch-presentations.js pour cloner le repo de contenu.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NITRO_PRESET explicite (sinon Nitro autodétecte selon l'environnement).
# CI=1 (défaut) -> readContentSourceConfig passe en fail-closed : un token
# manquant/expiré fait échouer le build au lieu de livrer un site sans decks.
# Build local sans token : `--build-arg CI=` -> mode submodule, utilise le
# contenu déjà présent dans le contexte (pas de clone).
ARG CI=1
ENV NITRO_PRESET=node_server
ENV CI=${CI}
ENV NUXT_TELEMETRY_DISABLED=1
# Le token n'est jamais écrit dans une couche : monté en secret le temps du build.
RUN --mount=type=secret,id=presentations_token \
    PRESENTATIONS_REPO_TOKEN="$(cat /run/secrets/presentations_token)" \
    pnpm build

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
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash \
    && apt-get update \
    && apt-get install -y --no-install-recommends "infisical=${INFISICAL_CLI_VERSION}" \
    && apt-get purge -y curl \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/.output ./.output
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
USER node
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]

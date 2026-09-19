#!/bin/sh
# App runner (receives the Infisical-injected environment from the entrypoint).
# With bucket credentials: restore the SQLite database if the volume is empty,
# then run the app under Litestream replication. Without them: plain start.
set -e

DB_PATH="${NUXT_DB_PATH:-/app/.data/slides.db}"
export NUXT_DB_PATH="$DB_PATH"

if [ -z "${NUXT_FROZEN_S3_ACCESS_KEY_ID:-}" ] || [ -z "${NUXT_FROZEN_S3_SECRET_ACCESS_KEY:-}" ]; then
  echo "[run-app] Pas de credentials bucket — démarrage sans réplication."
  exec node .output/server/index.mjs
fi

if [ -z "${NUXT_FROZEN_S3_BUCKET:-}" ]; then
  echo "[run-app] Credentials bucket présents mais NUXT_FROZEN_S3_BUCKET vide : arrêt, la base ne serait ni restaurée ni répliquée." >&2
  exit 1
fi

# Same defaults as the server code.
export NUXT_FROZEN_S3_ENDPOINT="${NUXT_FROZEN_S3_ENDPOINT:-https://s3.fr-par.scw.cloud}"
export NUXT_FROZEN_S3_REGION="${NUXT_FROZEN_S3_REGION:-fr-par}"

echo "[run-app] Restore Litestream si base absente…"
litestream restore -if-db-not-exists -if-replica-exists -config /etc/litestream.yml "$DB_PATH"

echo "[run-app] Démarrage sous réplication Litestream."
exec litestream replicate -config /etc/litestream.yml -exec "node .output/server/index.mjs"

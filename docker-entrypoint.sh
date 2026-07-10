#!/bin/sh
# Entrypoint : récupère les secrets applicatifs depuis Infisical au démarrage
# (machine identity / Universal Auth) et les injecte dans le process via
# `infisical run`. Les secrets ne touchent jamais le disque : seul le couple
# client-id/client-secret (le « secret zéro ») est fourni au conteneur.
set -e

# Bypass explicite (debug / tests) : on lance l'app avec l'environnement courant.
if [ "${INFISICAL_DISABLE:-0}" = "1" ] || [ -z "${INFISICAL_CLIENT_ID:-}" ]; then
  echo "[entrypoint] Infisical désactivé — démarrage direct (env courant)."
  exec "$@"
fi

: "${INFISICAL_API_URL:?INFISICAL_API_URL required}"
: "${INFISICAL_PROJECT_ID:?INFISICAL_PROJECT_ID required}"
: "${INFISICAL_ENV:?INFISICAL_ENV required}"
: "${INFISICAL_CLIENT_SECRET:?INFISICAL_CLIENT_SECRET required}"

echo "[entrypoint] Authentification Infisical (machine identity) sur ${INFISICAL_API_URL}…"
# Retry : Infisical (même hôte) peut redémarrer après nous ; restart policy + boucle.
i=0
until INFISICAL_TOKEN="$(infisical login --method=universal-auth \
        --client-id="$INFISICAL_CLIENT_ID" \
        --client-secret="$INFISICAL_CLIENT_SECRET" \
        --domain="$INFISICAL_API_URL" --plain 2>/dev/null)" \
      && [ -n "$INFISICAL_TOKEN" ]; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] Échec d'authentification Infisical après $i tentatives." >&2
    exit 1
  fi
  echo "[entrypoint] Infisical injoignable, nouvelle tentative ($i)…" >&2
  sleep 2
done
export INFISICAL_TOKEN

echo "[entrypoint] Injection des secrets (${INFISICAL_ENV}) + démarrage de l'app."
exec infisical run \
  --projectId="$INFISICAL_PROJECT_ID" \
  --env="$INFISICAL_ENV" \
  --domain="$INFISICAL_API_URL" \
  --recursive \
  -- "$@"

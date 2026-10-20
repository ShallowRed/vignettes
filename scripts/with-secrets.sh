#!/bin/sh
# Runs a command with the secrets of Infisical (`INFISICAL_ENV`, prod by default).
# With `INFISICAL_DISABLE=1`, no `infisical` on PATH or no `.infisical.json`, the
# command runs on the current environment.
set -e

env="${INFISICAL_ENV:-prod}"

if [ "${INFISICAL_DISABLE:-0}" = "1" ] || ! command -v infisical >/dev/null 2>&1 || [ ! -f .infisical.json ]; then
  exec "$@"
fi

# With INFISICAL_SECRETS (names separated by spaces), only these secrets reach
# the command, which keeps its local settings: database, content directory.
if [ -n "${INFISICAL_SECRETS:-}" ]; then
  for name in $INFISICAL_SECRETS; do
    value="$(infisical secrets get "$name" --env="$env" --plain --silent)"
    export "$name=$value"
  done
  exec "$@"
fi

exec infisical run --env="$env" -- "$@"

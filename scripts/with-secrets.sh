#!/bin/sh
# Runs a command with the secrets of Infisical (`INFISICAL_ENV`, prod by default).
# With `INFISICAL_DISABLE=1`, no `infisical` on PATH or no `.infisical.json`, the
# command runs on the current environment.
set -e

env="${INFISICAL_ENV:-prod}"

if [ "${INFISICAL_DISABLE:-0}" = "1" ] || ! command -v infisical >/dev/null 2>&1 || [ ! -f .infisical.json ]; then
  exec "$@"
fi

exec infisical run --env="$env" -- "$@"

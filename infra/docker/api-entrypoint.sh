#!/bin/sh
set -eu

node /app/apps/api/scripts/init-sqlite.cjs

exec "$@"

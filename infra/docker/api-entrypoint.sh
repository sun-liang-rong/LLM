#!/bin/sh
set -eu

pnpm --dir /app/apps/api prisma:generate
pnpm --dir /app/apps/api sqlite:init

exec "$@"

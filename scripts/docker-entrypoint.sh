#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
export DATA_DIR

if [ -z "${DATABASE_URL:-}" ]; then
	export DATABASE_URL="file:${DATA_DIR}/wielermanager.db"
fi

mkdir -p "$DATA_DIR"

bunx --bun prisma migrate deploy

exec bun ./build/index.js

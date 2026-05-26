#!/bin/sh
set -e

# Apply any pending SQL migrations before the server boots. Idempotent —
# already-applied migrations are skipped via the journal table.
echo "[stickertrade] running migrations..."
node --import remix/node-tsx scripts/migrate.ts

# Optionally seed the database on first boot. Controlled by an env flag so
# we don't accidentally re-create the admin user in production.
if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[stickertrade] seeding database..."
  node --import remix/node-tsx scripts/seed.ts
fi

echo "[stickertrade] starting server..."
exec "$@"

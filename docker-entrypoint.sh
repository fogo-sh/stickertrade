#!/bin/sh
set -e

# We start as root so bind-mounted volume dirs can be chowned to the app user
# even when they come up owned by root (the default for compose bind mounts).
# After fixing ownership we drop to the `app` user via runuser.
if [ "$(id -u)" = "0" ]; then
  chown -R "${APP_UID:-1001}:${APP_GID:-1001}" /app/db /app/tmp /app/tmp/uploads /app/tmp/sessions
  exec runuser -u app -- "$0" "$@"
fi

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

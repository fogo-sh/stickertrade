# syntax=docker/dockerfile:1.7

# Debian-slim base — glibc-compatible so sharp's prebuilt libvips bindings
# install cleanly. Pin to a specific minor version for reproducibility.
ARG NODE_VERSION=24.10.0
FROM node:${NODE_VERSION}-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# ---------- deps: install production dependencies only ----------
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts && \
    npm rebuild sharp

# ---------- runtime ----------
FROM base AS runtime

# Create a non-root user that owns the app dir and runtime data dirs.
RUN groupadd --system --gid 1001 app && \
    useradd --system --uid 1001 --gid app --create-home --shell /bin/sh app

# App code. Remix 3 runs TypeScript directly via `node --import remix/node-tsx`,
# so there is no separate compile step — the source IS the build.
COPY --chown=app:app package.json package-lock.json ./
COPY --chown=app:app --from=deps /app/node_modules ./node_modules
COPY --chown=app:app server.ts ./server.ts
COPY --chown=app:app tsconfig.json ./tsconfig.json
COPY --chown=app:app app ./app
COPY --chown=app:app migrations ./migrations
COPY --chown=app:app dev-logs ./dev-logs
COPY --chown=app:app public ./public
COPY --chown=app:app scripts ./scripts
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

# Runtime data dirs (sqlite file, uploads, sessions). These are also exposed
# as volumes in compose.yml so they survive container recreation. The entrypoint
# re-chowns these at boot in case they are bind-mounted from a host dir owned
# by a different uid.
RUN install -d -o app -g app -m 0755 /app/db /app/tmp /app/tmp/uploads /app/tmp/sessions && \
    chmod +x /app/docker-entrypoint.sh

ENV DATABASE_URL=/app/db/stickertrade.sqlite \
    PORT=44100 \
    NODE_ENV=production \
    APP_UID=1001 \
    APP_GID=1001

# Start as root so the entrypoint can fix bind-mount ownership, then runuser
# drops to the unprivileged `app` user before exec'ing the server.
EXPOSE 44100

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "--import", "remix/node-tsx", "server.ts"]

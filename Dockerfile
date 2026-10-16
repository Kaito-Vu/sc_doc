ARG NODE_VERSION=26
ARG PNPM_VERSION=11.28.2

# ---------------------------------------------------------------------------
# base: shared Node runtime + package manager.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS base

LABEL org.opencontainers.image.source="https://github.com/docmost/docmost" \
      org.opencontainers.image.title="Docmost" \
      org.opencontainers.image.description="Docmost is an open-source collaborative wiki and documentation software." \
      org.opencontainers.image.licenses="AGPL-3.0"

RUN npm install -g pnpm@${PNPM_VERSION} \
  && pnpm --version

# ---------------------------------------------------------------------------
# deps: install dependencies for the whole workspace.
# Only manifest files (package.json/lockfile/patches) are copied here, so
# this stage's cache is invalidated ONLY when a dependency actually changes —
# editing application source code never busts it.
# ---------------------------------------------------------------------------
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY packages/editor-ext/package.json ./packages/editor-ext/package.json
COPY packages/base-formula/package.json ./packages/base-formula/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked,uid=1000,gid=1000 \
  pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# builder: bring in the full source and build.
# Extends `deps`, so node_modules from the cached install above is reused;
# only the COPY + build steps re-run on a source-only change.
# ---------------------------------------------------------------------------
FROM deps AS builder

WORKDIR /app

COPY . .

RUN pnpm build

# ---------------------------------------------------------------------------
# prod: assemble /app (built output + production-only node_modules).
# Runs on the full base image because it needs pnpm; nothing from this stage
# except /app reaches the final image.
# ---------------------------------------------------------------------------
FROM base AS prod

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/client/package.json ./apps/client/package.json
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

COPY --from=builder /app/packages/editor-ext/dist ./packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json ./packages/editor-ext/package.json
COPY --from=builder /app/packages/base-formula/dist ./packages/base-formula/dist
COPY --from=builder /app/packages/base-formula/package.json ./packages/base-formula/package.json

COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/patches /app/patches

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked,uid=1000,gid=1000   pnpm --filter "./apps/server..." install --frozen-lockfile --prod --store-dir=/pnpm-store   && mkdir -p /app/data/storage   && chown -R 1000:1000 /app

# ---------------------------------------------------------------------------
# installer: distroless runtime (no shell, no package manager, no apt/curl).
# Must stay on the same Node major as `base` — native addons are built there.
# uid 1000 matches the old `node` user, so existing storage volumes keep
# working. Run with `init: true` (compose) for PID 1 signal/zombie handling.
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs${NODE_VERSION}-debian13 AS installer

ENV NODE_ENV=production

# Deploy marker: BUILD_VERSION=$(git describe --tags --always --dirty) docker compose build
ARG BUILD_VERSION=dev
ENV BUILD_VERSION=${BUILD_VERSION}
LABEL org.opencontainers.image.version=${BUILD_VERSION}

COPY --from=prod --chown=1000:1000 /app /app

USER 1000:1000

VOLUME ["/app/data/storage"]

EXPOSE 3000

# Set CWD to apps/server so relative storage resolves correctly (/app/data/storage)
WORKDIR /app/apps/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5   CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Image entrypoint is already `node`.
CMD ["dist/main"]

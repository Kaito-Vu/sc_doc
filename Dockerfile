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
# installer: production runtime image.
# ---------------------------------------------------------------------------
FROM base AS installer

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built apps
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json

# Copy built workspace packages
COPY --from=builder /app/packages/editor-ext/dist ./packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json ./packages/editor-ext/package.json
COPY --from=builder /app/packages/base-formula/dist ./packages/base-formula/dist
COPY --from=builder /app/packages/base-formula/package.json ./packages/base-formula/package.json

# Copy root workspace manifests + patches required by the filtered prod install
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml /app/pnpm-workspace.yaml
COPY --from=builder /app/patches /app/patches

# Install production deps for the server (and its workspace deps) as root,
# then drop the global package manager and hand the tree to the node user.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,sharing=locked,uid=1000,gid=1000 \
  pnpm --filter "./apps/server..." install --frozen-lockfile --prod --store-dir=/pnpm-store \
  && mkdir -p /app/data/storage \
  && npm uninstall -g pnpm \
  && chown -R node:node /app

USER node

VOLUME ["/app/data/storage"]

EXPOSE 3000

# Set CWD to apps/server so relative storage resolves correctly (/app/data/storage)
WORKDIR /app/apps/server

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# tini as PID 1 reaps zombies and forwards signals to Node.
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["node", "dist/main"]

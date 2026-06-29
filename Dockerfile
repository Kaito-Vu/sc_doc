# syntax=docker/dockerfile:1.7
FROM node:22-slim AS base
LABEL org.opencontainers.image.source="https://github.com/docmost/docmost"

RUN npm install -g pnpm@10.34.4

# ---------------------------------------------------------------------------
# deps: install dependencies for the whole workspace.
# Only manifest files (package.json/lockfile/patches) are copied here, so
# this stage's cache is invalidated ONLY when a dependency actually changes —
# editing application source code never busts it.
# ---------------------------------------------------------------------------
FROM base AS deps

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY apps/server/package.json ./apps/server/package.json
COPY apps/client/package.json ./apps/client/package.json
COPY packages/editor-ext/package.json ./packages/editor-ext/package.json
COPY packages/base-formula/package.json ./packages/base-formula/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,uid=1000,gid=1000 \
  pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ---------------------------------------------------------------------------
# builder: bring in the full source and build.
# Extends `deps`, so node_modules from the cached install above is reused as
# long as no manifest changed; only the COPY + build steps re-run on a
# source-only change.
# ---------------------------------------------------------------------------
FROM deps AS builder

COPY . .

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,uid=1000,gid=1000 \
  pnpm install --frozen-lockfile --store-dir=/pnpm-store
RUN pnpm build

# ---------------------------------------------------------------------------
# installer: production runtime image.
# ---------------------------------------------------------------------------
FROM base AS installer

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl bash \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy apps
COPY --from=builder /app/apps/server/dist /app/apps/server/dist
COPY --from=builder /app/apps/client/dist /app/apps/client/dist
COPY --from=builder /app/apps/server/package.json /app/apps/server/package.json

# Copy packages
COPY --from=builder /app/packages/editor-ext/dist /app/packages/editor-ext/dist
COPY --from=builder /app/packages/editor-ext/package.json /app/packages/editor-ext/package.json
COPY --from=builder /app/packages/base-formula/dist /app/packages/base-formula/dist
COPY --from=builder /app/packages/base-formula/package.json /app/packages/base-formula/package.json

# Copy root package files
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/pnpm*.yaml /app/
COPY --from=builder /app/.npmrc /app/.npmrc

# Copy patches
COPY --from=builder /app/patches /app/patches

RUN chown -R node:node /app

USER node

RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store,uid=1000,gid=1000 \
  pnpm install --frozen-lockfile --prod --store-dir=/pnpm-store \
  && mkdir -p /app/data/storage

VOLUME ["/app/data/storage"]

EXPOSE 3000

CMD ["pnpm", "start"]

# SeaweedFS Storage Integration — Design

## Context

The MinIO-based attachment storage plugin (`apps/server/src/ee/plugins/minio/**`, plus its client UI and docs under `docs/minio/`) has just been removed from this repo. We want to replace it with **SeaweedFS** as the object storage backend for attachments, but this time configured **entirely through environment variables**, not through an app-level plugin/module like the old MinIO integration.

## Goal

Stand up SeaweedFS as a self-hosted, S3-compatible object store for Docmost attachments, wired in purely via `docker-compose.yml` and `.env`, with zero new application code.

## Key finding

Docmost core already ships a generic, S3-compatible storage driver:

- `apps/server/src/integrations/storage/drivers/s3.driver.ts` — uses `@aws-sdk/client-s3`, supports custom `endpoint`, `forcePathStyle`, and explicit `credentials`.
- `apps/server/src/integrations/storage/providers/storage.provider.ts` — builds the S3 driver config from `AWS_S3_*` env vars via `EnvironmentService`, selected by `STORAGE_DRIVER=s3`.

SeaweedFS's `weed server -s3` mode exposes a standard S3-compatible API. Because the existing driver is already generic (not AWS-specific), **no new driver, no `ee/` module, and no core code changes are required** — this is a stronger form of the repo's "minimize diff against upstream" rule than usual: the diff is zero application code, confined to infra config (`docker-compose.yml`, `.env.example`).

## Architecture

```
docmost (app) --AWS S3 SDK (S3Driver)--> seaweedfs (weed server -s3, port 8333)
                                                |
                                                v
                                 bind mount ./seaweedfs_data
                                 (master + volume + filer + identity data, all-in-one)
```

- **Deployment mode**: SeaweedFS all-in-one (`weed server -s3`) — single container running master, volume, filer, and S3 gateway together. Chosen for simplicity and low operational risk over a multi-service (separate master/volume/filer) topology, appropriate for an internal document-management use case at moderate scale.
- **Persistence**: bind mount (`./seaweedfs_data:/data`) rather than a Docker named volume, so the data directory can be backed up directly with host-level tools (rsync/restic/tar) without going through Docker.
- **Auth**: SeaweedFS S3 gateway configured with an identity (access key/secret) via its S3 config JSON, rendered at container start from `SEAWEEDFS_ACCESS_KEY` / `SEAWEEDFS_SECRET_KEY` env vars. Anonymous access is not used, since this is internal document data.
- **Bucket provisioning**: auto-created idempotently on startup (via `weed shell -c "s3.bucket.create -name <bucket>"` run once against the local gateway, tolerating "already exists"), so no manual step is needed after `docker compose up`.
- **App wiring** — `.env` / `docker-compose.yml` env for the `docmost` service:
  ```
  STORAGE_DRIVER=s3
  AWS_S3_ENDPOINT=http://seaweedfs:8333
  AWS_S3_BUCKET=docmost
  AWS_S3_REGION=us-east-1        # required by AWS SDK; SeaweedFS ignores the actual value
  AWS_S3_FORCE_PATH_STYLE=true   # required: SeaweedFS does not support virtual-hosted-style addressing
  AWS_S3_ACCESS_KEY_ID=<same as SEAWEEDFS_ACCESS_KEY>
  AWS_S3_SECRET_ACCESS_KEY=<same as SEAWEEDFS_SECRET_KEY>
  ```

## Backup / Recovery

Backing up `./seaweedfs_data` (host bind mount) via standard file backup tooling backs up all SeaweedFS state (master, volume data, filer metadata) in one place — no separate database or metadata store to coordinate. Recovery is restoring that directory and restarting the container.

## Risks & mitigations

- **`AWS_S3_FORCE_PATH_STYLE=true` is mandatory.** If omitted, the AWS SDK will attempt virtual-hosted-style addressing (`bucket.seaweedfs:8333`), which SeaweedFS does not support, and uploads will fail with DNS/connection errors. Documented prominently in `.env.example`.
- **Filer metadata store**: all-in-one mode uses SeaweedFS's built-in embedded metadata store, which lives under the same `/data` bind mount — no separate Postgres/etcd dependency to add, keeping the docker-compose diff minimal.
- **Credential leakage**: access key/secret are sourced from `.env` (not committed), matching the existing pattern for other secrets in this repo (e.g. `APP_SECRET`, DB password).

## Non-goals

- No UI for managing SeaweedFS settings (the old MinIO settings page under `apps/client/src/pages/settings/workspace/integrations/minio.tsx` is not being replaced — configuration is env-only, per the user's explicit requirement).
- No migration tooling for existing attachments (out of scope for this design; can be a follow-up if needed).
- No multi-node/scaled SeaweedFS topology (separate master/volume/filer services) — explicitly deferred in favor of the simpler all-in-one mode.

## Scope of implementation

Changes confined to:
- `docker-compose.yml` — add `seaweedfs` service, bucket-init step, remove any leftover MinIO references (already removed on this branch).
- `.env.example` — add `SEAWEEDFS_*` and `AWS_S3_*` variables with comments.

No changes to `apps/server/src` or `apps/client/src`.

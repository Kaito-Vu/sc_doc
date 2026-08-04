# SeaweedFS Storage Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire SeaweedFS in as the attachment storage backend, configured entirely through `docker-compose.yml`/env vars, using the existing generic S3 storage driver with zero application code changes.

**Architecture:** Add a `seaweedfs` service (all-in-one `weed server -s3`) and a one-shot `seaweedfs-init` service to `docker-compose.yml`. Point the `docmost` service's existing `AWS_S3_*` env vars at SeaweedFS's S3 gateway (`STORAGE_DRIVER=s3`). Persist SeaweedFS state to a host bind mount for easy backup/recovery. No changes under `apps/server/src` or `apps/client/src`.

**Tech Stack:** Docker Compose, SeaweedFS (`chrislusf/seaweedfs` image), existing Docmost S3 storage driver (`@aws-sdk/client-s3`, already in core).

## Global Constraints

- Zero changes to application code (`apps/server/src`, `apps/client/src`) — spec explicitly scopes this to `docker-compose.yml` and `.env.example` only.
- `AWS_S3_FORCE_PATH_STYLE` must be `'true'` — SeaweedFS does not support virtual-hosted-style addressing.
- SeaweedFS data must persist to a host bind mount (not a Docker named volume) so it can be backed up with host tools (rsync/restic/tar) independent of Docker. Per repo `.gitignore` line 4 (`data`), any path segment literally named `data` is already git-ignored — use `./data/seaweedfs` as the bind mount path to get this for free without editing `.gitignore`.
- SeaweedFS S3 API must require authentication (access key/secret) — no anonymous access, since this stores internal documents.
- Bucket must be auto-created on startup — no manual step required after `docker compose up`.
- All-in-one SeaweedFS deployment mode only (`weed server -s3`) — no separate master/volume/filer services (explicitly deferred per spec).

---

### Task 1: Add SeaweedFS services to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: a `seaweedfs` service reachable at `http://seaweedfs:8333` (S3 API) and `seaweedfs:9333` (master, internal only) on the compose network; a `seaweedfs-init` one-shot service that creates the `docmost` bucket; the `docmost` service gains `AWS_S3_*` / `STORAGE_DRIVER` env vars and a `depends_on: seaweedfs`.
- Consumes: nothing from other tasks (this is the only task).

- [ ] **Step 1: Add the `seaweedfs` service definition**

Edit `docker-compose.yml`. Insert a new `seaweedfs` service after the `redis` service (before the `volumes:` section):

```yaml
  seaweedfs:
    image: chrislusf/seaweedfs:latest
    container_name: docmost-seaweedfs
    restart: unless-stopped
    entrypoint: ["sh", "-c"]
    command:
      - |
        mkdir -p /etc/seaweedfs
        cat > /etc/seaweedfs/s3.json <<'EOF'
        {
          "identities": [
            {
              "name": "docmost",
              "credentials": [
                {
                  "accessKey": "docmost_seaweedfs_access_key",
                  "secretKey": "CHANGE_ME_STRONG_SEAWEEDFS_SECRET"
                }
              ],
              "actions": ["Read", "Write", "List", "Tagging", "Admin"]
            }
          ]
        }
        EOF
        exec weed server -dir=/data -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json -ip=seaweedfs -master.volumeSizeLimitMB=1024
    volumes:
      - ./data/seaweedfs:/data
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:9333/cluster/status"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 10s

  seaweedfs-init:
    image: chrislusf/seaweedfs:latest
    container_name: docmost-seaweedfs-init
    restart: "no"
    depends_on:
      seaweedfs:
        condition: service_healthy
    entrypoint: ["sh", "-c"]
    command:
      - |
        weed shell -master=seaweedfs:9333 -c "s3.bucket.create -name docmost" || true
```

- [ ] **Step 2: Wire the `docmost` service to use SeaweedFS**

In `docker-compose.yml`, update the `docmost` service's `depends_on` and `environment` blocks:

```yaml
  docmost:
    build: .
    depends_on:
      - db
      - redis
      - seaweedfs
    environment:
      APP_URL: 'https://doc.etc.vn'
      APP_SECRET: '4cb43dc7af32d3171aa2c542c6627df986c4151cff48365e4fac62c25d87741a'
      DATABASE_URL: 'postgresql://docmost:STRONG_DB_PASSWORD@db:5432/docmost'
      REDIS_URL: 'redis://redis:6379'
      STORAGE_DRIVER: 's3'
      AWS_S3_ENDPOINT: 'http://seaweedfs:8333'
      AWS_S3_BUCKET: 'docmost'
      AWS_S3_REGION: 'us-east-1'
      AWS_S3_FORCE_PATH_STYLE: 'true'
      AWS_S3_ACCESS_KEY_ID: 'docmost_seaweedfs_access_key'
      AWS_S3_SECRET_ACCESS_KEY: 'CHANGE_ME_STRONG_SEAWEEDFS_SECRET'
    ports:
      - "8888:3000"
    restart: unless-stopped
    volumes:
      - docmost:/app/data/storage
```

Note: `docmost:/app/data/storage` stays — it holds non-attachment local app data (e.g. import/export temp files), unrelated to the S3-backed attachment storage.

- [ ] **Step 3: Validate the compose file parses correctly**

Run: `docker compose config --quiet`
Expected: no output, exit code 0 (confirms YAML is valid and service references resolve).

- [ ] **Step 4: Bring up db, redis, seaweedfs, and seaweedfs-init and verify the bucket gets created**

Run:
```bash
docker compose up -d db redis seaweedfs seaweedfs-init
docker compose logs seaweedfs-init
```
Expected: `seaweedfs-init` log output does not contain a fatal error; either shows successful bucket creation or (on reruns) an "already exists"-style message, both acceptable since the command is wrapped with `|| true`.

Run: `docker compose ps seaweedfs`
Expected: STATUS column shows `healthy` (may take up to ~30s after `start_period`).

- [ ] **Step 5: Verify the S3 API is reachable and authenticates**

Run (from host, using the AWS CLI against the mapped network — since no host port is published for `seaweedfs`, exec into the `docmost` build context isn't available yet, so verify via a throwaway container on the same compose network):
```bash
docker run --rm --network sc_doc_default amazon/aws-cli --endpoint-url http://seaweedfs:8333 --region us-east-1 s3 ls s3://docmost --no-sign-request 2>&1 | head -5
```
Expected: an `AccessDenied` or `InvalidAccessKeyId`-style error (proves the S3 API is up and enforcing auth — the `--no-sign-request` flag intentionally omits credentials). If instead you get a connection error, the service isn't reachable yet — re-check Step 4.

Then verify with real credentials:
```bash
docker run --rm --network sc_doc_default \
  -e AWS_ACCESS_KEY_ID=docmost_seaweedfs_access_key \
  -e AWS_SECRET_ACCESS_KEY=CHANGE_ME_STRONG_SEAWEEDFS_SECRET \
  amazon/aws-cli --endpoint-url http://seaweedfs:8333 --region us-east-1 s3 ls s3://docmost
```
Expected: exit code 0, empty output (bucket exists and is empty) — no `NoSuchBucket` or `AccessDenied` error.

(If the network name differs, find it with `docker network ls | grep sc_doc`.)

- [ ] **Step 6: Tear down the throwaway verification containers**

Run: `docker compose down` (leaves `./data/seaweedfs` and other bind-mounted/volume data intact for the next task).

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(storage): wire SeaweedFS as S3-compatible attachment storage"
```

---

### Task 2: Document SeaweedFS env vars in .env.example

**Files:**
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing from Task 1 (independent file).
- Produces: documented `AWS_S3_*` example values for developers running the server outside `docker-compose.yml` (e.g. `pnpm dev` against a manually-started SeaweedFS).

- [ ] **Step 1: Update the S3 driver config section**

In `.env.example`, replace:

```
# options: local | s3 | azure
STORAGE_DRIVER=local

# S3 driver config
AWS_S3_ACCESS_KEY_ID=
AWS_S3_SECRET_ACCESS_KEY=
AWS_S3_REGION=
AWS_S3_BUCKET=
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=
```

with:

```
# options: local | s3 | azure
STORAGE_DRIVER=local

# S3 driver config — also used for SeaweedFS, since SeaweedFS's S3 gateway
# is S3-API-compatible. To point at the SeaweedFS service from
# docker-compose.yml, use:
#   STORAGE_DRIVER=s3
#   AWS_S3_ENDPOINT=http://seaweedfs:8333
#   AWS_S3_BUCKET=docmost
#   AWS_S3_REGION=us-east-1        (SeaweedFS ignores the value but the AWS SDK requires one)
#   AWS_S3_FORCE_PATH_STYLE=true   (required: SeaweedFS does not support virtual-hosted-style addressing)
#   AWS_S3_ACCESS_KEY_ID=<value from seaweedfs service's s3.json identity>
#   AWS_S3_SECRET_ACCESS_KEY=<value from seaweedfs service's s3.json identity>
AWS_S3_ACCESS_KEY_ID=
AWS_S3_SECRET_ACCESS_KEY=
AWS_S3_REGION=
AWS_S3_BUCKET=
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=
```

- [ ] **Step 2: Verify the file is still well-formed shell-env syntax**

Run: `grep -c '^[A-Z_]*=' .env.example`
Expected: a count greater than 0 and no shell errors if sourced, e.g. `set -a; source .env.example; set +a` run in a throwaway shell should not error (comments are ignored by `source`).

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(env): document SeaweedFS S3-compatible config in .env.example"
```

---

## Post-plan manual verification (not automated)

After both tasks are merged, do a full end-to-end check locally:

1. `cp .env.example .env` and fill in `APP_SECRET`, `DATABASE_URL`, etc. as usual.
2. `docker compose up -d`
3. Open the app, create a page, upload an image attachment.
4. Confirm the image renders (proves upload + read round-trip through SeaweedFS).
5. Run the Step 5 AWS CLI check from Task 1 again — the bucket should now contain an object under a path matching the attachment's storage key.
6. Simulate recovery: `docker compose down`, `docker compose up -d`, re-open the page — the previously uploaded image should still render (proves the bind mount at `./data/seaweedfs` persists across restarts).

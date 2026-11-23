# PostHog (self-hosted, separate stack)

PostHog's hobby stack (~35 services, built/pulled by PostHog's own scripts) is
deliberately NOT merged into `docker-compose*.yml`. It runs from this folder
with its own compose project; Docmost only needs `POSTHOG_HOST` / `POSTHOG_KEY`.

Requirements: Ubuntu server, >= 8GB RAM (16GB recommended), internet access,
ports 80/443 free (PostHog's Caddy proxy binds them; Docmost gateway uses
`DOCMOST_PORT`, default 8888, so no clash unless your TLS proxy uses 80/443
on the same host -> then run PostHog on another host).

## Install (run INSIDE this folder, on the server)

    cd posthog
    curl -fsSL -o deploy-hobby https://raw.githubusercontent.com/posthog/posthog/HEAD/bin/deploy-hobby
    chmod +x deploy-hobby
    ./deploy-hobby latest posthog.example.com

Note: the script sends install start/complete events to PostHog's cloud
(us.i.posthog.com) with your domain. Read it first if that matters.

It clones the PostHog repo, writes `.env` (secrets, chmod 600) and its own
`docker-compose.yml`, then starts the stack. Wait for http://localhost/_health.
Do not commit anything generated here (see `.gitignore`).

## Operate / upgrade

    docker compose stop|start        # from this folder
    curl -fsSL https://raw.githubusercontent.com/posthog/posthog/HEAD/bin/upgrade-hobby | bash

## Connect Docmost

1. Open https://posthog.example.com, create the org/project, copy the project API key (`phc_...`).
2. In Docmost's `.env`:

       POSTHOG_HOST=https://posthog.example.com
       POSTHOG_KEY=phc_xxx

3. `docker compose up -d docmost` (or `-f docker-compose.run.yml`).

Client only initialises PostHog when `isCloud()` is true
(`apps/client/src/main.tsx`), so self-host needs that gate changed via an
`ee/` hook before events flow.

## Offline servers

deploy-hobby needs internet (git clone, image pulls). For air-gapped hosts,
pull/save the images on a connected machine and `docker load` them; the Rust
services are built from source in the upstream compose, so build them there too.

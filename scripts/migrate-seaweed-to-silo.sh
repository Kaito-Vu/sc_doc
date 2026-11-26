#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Migrate Docmost files from SeaweedFS to Silo (same bucket, same object keys).
# Runs on the prod server, from the repo root, with docker-compose.run.yml.
# Uses the mcli client shipped in the Silo image: no internet / extra image.
#
#   ./scripts/migrate-seaweed-to-silo.sh copy      # bulk copy, app keeps running
#   ./scripts/migrate-seaweed-to-silo.sh verify    # diff buckets + check DB keys
#   ./scripts/migrate-seaweed-to-silo.sh cutover   # stop app, final sync, switch, start
#   ./scripts/migrate-seaweed-to-silo.sh rollback  # copy new files back, switch back
#
# Prereqs: `.env` has SILO_ROOT_USER/PASSWORD, and
#   docker compose -f docker-compose.run.yml up -d silo silo-init   has run.
# SeaweedFS is never written to except by `rollback`; keep it 2-4 weeks.
# ---------------------------------------------------------------------------
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.run.yml)
ENV_FILE=.env
SILO_ENDPOINT=http://silo:9000
APP_SERVICES=(docmost)   # add the collab service here if it runs separately

[[ -f $ENV_FILE ]] || { echo "Run from the repo root ($ENV_FILE not found)"; exit 1; }
set -a; . "./$ENV_FILE"; set +a
BUCKET=${AWS_S3_BUCKET:-docmost}
: "${SEAWEEDFS_ACCESS_KEY:?missing in .env}" "${SEAWEEDFS_SECRET_KEY:?missing in .env}"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }

# Runs mcli in a throwaway Silo container on the compose network, with
# aliases `sw` (SeaweedFS) and `silo` set up. Docmost's keys work on both.
s3() {
  "${COMPOSE[@]}" run --rm -T --no-deps --entrypoint sh \
    -e K="$SEAWEEDFS_ACCESS_KEY" -e S="$SEAWEEDFS_SECRET_KEY" silo-init -c '
      mcli alias set sw http://seaweedfs:8333 "$K" "$S" --api s3v4 --path on >/dev/null
      mcli alias set silo '"$SILO_ENDPOINT"' "$K" "$S" --api s3v4 --path on >/dev/null
      '"$1"
}

# Mirror src -> dst; --remove also deletes on dst what no longer exists on src.
mirror() { s3 "mcli mirror --overwrite $3 $1/$BUCKET $2/$BUCKET"; }

verify() {
  local tmp; tmp=$(mktemp -d)
  log "Comparing buckets (empty = identical)"
  s3 "mcli diff sw/$BUCKET silo/$BUCKET" | tee "$tmp/diff.txt"

  log "Checking every attachments.file_path exists on Silo"
  "${COMPOSE[@]}" exec -T db psql -U "${POSTGRES_USER:-docmost}" -d "${POSTGRES_DB:-docmost}" \
    -Atc "select file_path from attachments" | LC_ALL=C sort -u > "$tmp/db.txt"
  for side in sw silo; do
    s3 "mcli find $side/$BUCKET" | sed "s#^$side/$BUCKET/##" | LC_ALL=C sort -u > "$tmp/$side.txt"
  done
  LC_ALL=C comm -23 "$tmp/db.txt" "$tmp/silo.txt" > "$tmp/missing-on-silo.txt"
  LC_ALL=C comm -23 "$tmp/db.txt" "$tmp/sw.txt" > "$tmp/missing-on-sw.txt"
  # files the DB expects, present on SeaweedFS but not on Silo = copy problem
  LC_ALL=C comm -23 "$tmp/missing-on-silo.txt" "$tmp/missing-on-sw.txt" > "$tmp/lost-in-copy.txt"

  echo "DB keys:              $(wc -l < "$tmp/db.txt")"
  echo "Objects on SeaweedFS: $(wc -l < "$tmp/sw.txt")"
  echo "Objects on Silo:      $(wc -l < "$tmp/silo.txt")"
  echo "Already missing on SeaweedFS (lost before migration): $(wc -l < "$tmp/missing-on-sw.txt")"
  echo "Lost in copy (must be 0):                            $(wc -l < "$tmp/lost-in-copy.txt")"
  echo "Details in $tmp"
  [[ ! -s $tmp/lost-in-copy.txt && ! -s $tmp/diff.txt ]]
}

set_endpoint() {   # $1 = endpoint, or empty to fall back to SeaweedFS (compose default)
  cp "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
  sed -i '/^AWS_S3_ENDPOINT=/d' "$ENV_FILE"
  [[ -n $1 ]] && echo "AWS_S3_ENDPOINT=$1" >> "$ENV_FILE"
  return 0
}

case "${1:-}" in
  copy)
    log "Bulk copy SeaweedFS -> Silo (app stays online; safe to re-run)"
    mirror sw silo ""
    log "Done. Run: $0 verify"
    ;;
  verify)
    verify && log "OK" || { log "Differences found, see above"; exit 1; }
    ;;
  cutover)
    log "Stopping app: ${APP_SERVICES[*]}"
    "${COMPOSE[@]}" stop "${APP_SERVICES[@]}"
    trap 'log "FAILED: app is stopped and still on SeaweedFS. Fix, then re-run cutover or: ${COMPOSE[*]} start ${APP_SERVICES[*]}"' ERR
    log "Final sync (only changes since last copy, incl. deletions)"
    mirror sw silo --remove
    verify
    trap - ERR
    log "Switching AWS_S3_ENDPOINT to $SILO_ENDPOINT"
    set_endpoint "$SILO_ENDPOINT"
    "${COMPOSE[@]}" up -d "${APP_SERVICES[@]}"
    log "Done. Smoke test: open a page with images, upload, delete, export PDF/DOCX, change avatar."
    ;;
  rollback)
    log "Stopping app: ${APP_SERVICES[*]}"
    "${COMPOSE[@]}" stop "${APP_SERVICES[@]}"
    log "Copying files created on Silo back to SeaweedFS (no deletions)"
    mirror silo sw ""
    set_endpoint ""
    "${COMPOSE[@]}" up -d "${APP_SERVICES[@]}"
    log "Back on SeaweedFS. Files deleted while on Silo still exist on SeaweedFS."
    ;;
  *)
    sed -n '2,15p' "$0"; exit 1
    ;;
esac

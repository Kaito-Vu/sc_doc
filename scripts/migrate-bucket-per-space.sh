#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Silo: move from ONE bucket (current AWS_S3_BUCKET, e.g. "docmost") to
#   - a "system" bucket: files of no page (avatars, logos, exports, templates, chat)
#   - one bucket per space, named after its slug (table space_buckets,
#     assigned once by space_bucket_name(); renaming a slug keeps the bucket)
# Object keys never change; the app routes by key (AWS_S3_BUCKET_PER_SPACE).
# Runs on the prod server, from the repo root, with docker-compose.run.yml.
# Needs the new app image deployed first: it runs the DB migrations on boot.
#
#   ./scripts/migrate-bucket-per-space.sh copy      # bulk copy, app stays online
#   ./scripts/migrate-bucket-per-space.sh cutover   # stop app, final sync, switch, start
#   ./scripts/migrate-bucket-per-space.sh finish    # after "Relocation finished" in logs
#   ./scripts/migrate-bucket-per-space.sh verify    # every DB file exists in its bucket
#   ./scripts/migrate-bucket-per-space.sh ensure-buckets  # create missing buckets for existing spaces
#   ./scripts/migrate-bucket-per-space.sh buckets   # list space -> bucket
#   ./scripts/migrate-bucket-per-space.sh relocate  # page files with an old key -> space folder
#   ./scripts/migrate-bucket-per-space.sh cleanup   # page files left in system -> space bucket
#   ./scripts/migrate-bucket-per-space.sh rollback  # copy everything back, switch back
#
# SYSTEM_BUCKET (default "system") can be overridden: SYSTEM_BUCKET=x ./... copy
# The old bucket is never written to except by `rollback`; keep it until verified.
# Any error stops the script (nothing half-done is reported as "Done").
# ---------------------------------------------------------------------------
set -euo pipefail

COMPOSE=(docker compose -f docker-compose.run.yml)
ENV_FILE=.env
APP_SERVICES=(docmost)
REQUIRED_MIGRATION=20261125T120000-space-buckets-deleted-space

[[ -f $ENV_FILE ]] || { echo "Run from the repo root ($ENV_FILE not found)"; exit 1; }
set -a; . "./$ENV_FILE"; set +a
: "${SEAWEEDFS_ACCESS_KEY:?missing in .env}" "${SEAWEEDFS_SECRET_KEY:?missing in .env}"
SYSTEM=${SYSTEM_BUCKET:-system}
# before cutover AWS_S3_BUCKET is the old single bucket; cutover saves it as OLD_BUCKET
OLD=${OLD_BUCKET:-${AWS_S3_BUCKET:-docmost}}
UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
die() { log "ERROR: $*"; exit 1; }
trap 'log "FAILED at line $LINENO (see error above). Nothing after that step was done."' ERR

psql() {
  "${COMPOSE[@]}" exec -T db psql -U "${POSTGRES_USER:-docmost}" -d "${POSTGRES_DB:-docmost}" \
    -v ON_ERROR_STOP=1 -At "$@"
}

require_migrations() {
  [[ $(psql -c "select count(*) from kysely_migration where name = '$REQUIRED_MIGRATION'") == 1 ]] \
    || die "DB migration $REQUIRED_MIGRATION is not applied. Deploy the new app image first
       (docker compose -f docker-compose.run.yml up -d docmost runs the migrations), then retry."
}

# "workspaceId spaceId bucket" for every space, plus spaces that only still
# appear in file keys (deleted spaces); assigns a bucket where missing
space_map() {
  psql -F ' ' -c "select ws, sp, space_bucket_name(sp, array['$SYSTEM', '$OLD']) from (
                    select workspace_id as ws, id as sp from spaces
                    union
                    select split_part(file_path, '/', 1)::uuid, split_part(file_path, '/', 2)::uuid
                    from attachments where file_path ~ '^$UUID/$UUID/'
                  ) x order by 1, 2"
}

# Page files whose key is not in their page's space folder (=> wrong bucket).
# Fixed by the app's relocation: $0 relocate
misplaced_sql="select a.id, p.space_id, a.file_path from attachments a
               join pages p on p.id = a.page_id
               where a.file_path not like a.workspace_id || '/' || p.space_id || '/%'"

# mcli in a throwaway Silo container; alias `silo` with Docmost's keys.
# The Silo image is minimal (no awk/grep/sed): helpers below use plain sh.
# $2 is passed in as $MAP.
s3() {
  "${COMPOSE[@]}" run --rm -T --no-deps --entrypoint sh \
    -e K="$SEAWEEDFS_ACCESS_KEY" -e S="$SEAWEEDFS_SECRET_KEY" -e MAP="${2:-}" \
    -e OLD="$OLD" -e SYSTEM="$SYSTEM" silo-init -c '
      set -e
      (set -o pipefail) 2>/dev/null && set -o pipefail
      mcli alias set silo http://silo:9000 "$K" "$S" --api s3v4 --path on >/dev/null
      # names of the entries directly under a prefix (last column of mcli ls)
      names() { mcli ls "$1" > /tmp/ls; while IFS= read -r l; do echo "${l##* }"; done < /tmp/ls; }
      is_uuid_dir() {
        case "$1" in ????????-????-????-????-????????????/) return 0 ;; esac
        return 1
      }
      nonempty() { [ -n "$(mcli ls "$1" 2>/dev/null)" ]; }
      printf "%s\n" "$MAP" > /tmp/map
      '"$1"
}

# Old bucket -> system: everything EXCEPT page files ({ws}/{space}/...);
# {ws}/{space}/ prefixes -> that space's bucket.
split() {   # $1 = "" or --remove
  ensure_buckets
  local map; map=$(space_map)
  s3 '
    mcli mb --ignore-existing "silo/$SYSTEM"
    copy_system() {   # $1 = relative path (prefix ends with /)
      case "$1" in
        */) mcli mirror --overwrite '"$1"' "silo/$OLD/$1" "silo/$SYSTEM/$1" ;;
        *)  mcli cp "silo/$OLD/$1" "silo/$SYSTEM/$1" ;;
      esac
    }
    names "silo/$OLD/" > /tmp/top
    while read -r top <&3; do
      if is_uuid_dir "$top"; then
        names "silo/$OLD/$top" > /tmp/sub
        while read -r sub <&4; do
          is_uuid_dir "$sub" && continue   # page files: space bucket
          copy_system "$top$sub"
        done 4< /tmp/sub
      else
        copy_system "$top"
      fi
    done 3< /tmp/top
    while read -r ws sp b <&3; do
      [ -n "$b" ] || continue
      if nonempty "silo/$OLD/$ws/$sp/"; then
        mcli mirror --overwrite '"$1"' "silo/$OLD/$ws/$sp" "silo/$b/$ws/$sp"
      fi
    done 3< /tmp/map' "$map"
}

# Every space in the DB gets its bucket in Silo (created if missing), plus
# the system bucket. Idempotent.
ensure_buckets() {
  local map; map=$(space_map)
  log "Ensuring buckets: $SYSTEM + $(printf '%s
' "$map" | grep -c .) spaces"
  s3 '
    mcli mb --ignore-existing "silo/$SYSTEM" >/dev/null
    created=0
    while read -r ws sp b <&3; do
      [ -n "$b" ] || continue
      if ! mcli ls "silo/$b" >/dev/null 2>&1; then
        mcli mb "silo/$b" >/dev/null
        echo "created bucket $b (space $sp)"
        created=$((created + 1))
      fi
    done 3< /tmp/map
    echo "$created bucket(s) created"' "$map"
}

set_env() {   # set_env KEY VALUE ... (empty VALUE removes the key)
  cp "$ENV_FILE" "$ENV_FILE.bak-$(date +%Y%m%d%H%M%S)"
  while (($#)); do
    sed -i "/^$1=/d" "$ENV_FILE"
    if [[ -n $2 ]]; then echo "$1=$2" >> "$ENV_FILE"; fi
    shift 2
  done
}

restart_app() { "${COMPOSE[@]}" up -d "${APP_SERVICES[@]}"; }

# Prints the report; returns 1 if anything is off. Any command error aborts.
verify() {
  local tmp; tmp=$(mktemp -d)
  log "Listing objects in all buckets"
  s3 'names silo/ > /tmp/b
      while read -r b <&3; do mcli find "silo/${b%/}"; done 3< /tmp/b' \
    | sed 's#^silo/##' | LC_ALL=C sort -u > "$tmp/objects.txt"
  log "Expected location of every attachments.file_path"
  psql -c "select coalesce(sb.bucket, '$SYSTEM') || '/' || a.file_path
           from attachments a
           left join space_buckets sb
             on a.file_path ~ '^$UUID/'
            and sb.space_id::text = split_part(a.file_path, '/', 2)" \
    | LC_ALL=C sort -u > "$tmp/expected.txt"
  LC_ALL=C comm -23 "$tmp/expected.txt" "$tmp/objects.txt" > "$tmp/missing.txt"
  psql -c "$misplaced_sql" > "$tmp/misplaced.txt"
  { grep -E "^$SYSTEM/$UUID/$UUID/" "$tmp/objects.txt" || true; } > "$tmp/page-files-in-system.txt"
  echo "Objects in Silo:                         $(wc -l < "$tmp/objects.txt")"
  echo "DB files:                                $(wc -l < "$tmp/expected.txt")"
  echo "Missing in their bucket (must be 0):     $(wc -l < "$tmp/missing.txt")"
  echo "Page files not in their space (must be 0, fix: $0 relocate): $(wc -l < "$tmp/misplaced.txt")"
  echo "Page files left in $SYSTEM (must be 0, fix: $0 cleanup):  $(wc -l < "$tmp/page-files-in-system.txt")"
  echo "Details in $tmp. Files already lost before the migration also count as missing."
  if [[ -s $tmp/missing.txt || -s $tmp/misplaced.txt || -s $tmp/page-files-in-system.txt ]]; then
    log "NOT OK, see above"; return 1
  fi
  log "OK"
}

# Removes page files from the system bucket, after making sure each one is in
# its space bucket (copies it there first if not).
cleanup() {
  local map; map=$(space_map)
  s3 '
    while read -r ws sp b <&3; do
      [ -n "$b" ] || continue
      nonempty "silo/$SYSTEM/$ws/$sp/" || continue
      mcli mb --ignore-existing "silo/$b"
      # no --overwrite: the space bucket copy wins; on conflicts keep both, report
      if ! mcli mirror "silo/$SYSTEM/$ws/$sp" "silo/$b/$ws/$sp"; then
        echo "SKIPPED $ws/$sp: some files differ between $SYSTEM and $b, check by hand"
        continue
      fi
      mcli rm --recursive --force "silo/$SYSTEM/$ws/$sp/"
      echo "moved $ws/$sp -> $b"
    done 3< /tmp/map' "$map"
}

cmd=${1:-}
case "$cmd" in copy|cutover|finish|verify|buckets|ensure-buckets|relocate|cleanup|rollback) require_migrations ;; esac

case "$cmd" in
  cleanup)
    log "Moving page files out of $SYSTEM into their space buckets"
    cleanup
    log "Done"
    ;;
  relocate)
    log "Moving page files into their space folder/bucket (runs in the app, background)"
    set_env AWS_S3_RELOCATE_ON_BOOT true
    restart_app
    log "Watch: ${COMPOSE[*]} logs -f docmost | grep RelocateAllOnBoot   then run: $0 finish"
    ;;
  ensure-buckets)
    ensure_buckets
    log "Done"
    ;;
  buckets)
    psql -c "select s.slug, sb.bucket from space_buckets sb left join spaces s on s.id = sb.space_id order by 2"
    ;;
  copy)
    log "Copy $OLD -> $SYSTEM + one bucket per space (app online; safe to re-run)"
    split ""
    log "Done. Check names with: $0 buckets   then: $0 cutover"
    ;;
  cutover)
    log "Stopping app"
    "${COMPOSE[@]}" stop "${APP_SERVICES[@]}"
    trap 'log "FAILED at line $LINENO: app is STOPPED, .env unchanged. Fix and re-run, or: ${COMPOSE[*]} start ${APP_SERVICES[*]}"' ERR
    log "Final sync"
    split --remove
    set_env AWS_S3_BUCKET "$SYSTEM" AWS_S3_BUCKET_PER_SPACE true AWS_S3_RELOCATE_ON_BOOT true OLD_BUCKET "$OLD"
    restart_app
    log "App started on bucket-per-space. Legacy page files are being moved in the background."
    log "Watch: ${COMPOSE[*]} logs -f docmost | grep RelocateAllOnBoot   then run: $0 finish"
    ;;
  finish)
    set_env AWS_S3_RELOCATE_ON_BOOT ""
    restart_app
    verify
    ;;
  verify)
    verify
    ;;
  rollback)
    log "Stopping app"
    "${COMPOSE[@]}" stop "${APP_SERVICES[@]}"
    log "Copying $SYSTEM and space buckets back into $OLD (no deletions)"
    buckets=$(psql -c "select bucket from space_buckets")
    s3 '
      mcli mirror --overwrite "silo/$SYSTEM" "silo/$OLD"
      while read -r b <&3; do
        [ -n "$b" ] || continue
        mcli mirror --overwrite "silo/$b" "silo/$OLD"
      done 3< /tmp/map' "$buckets"
    set_env AWS_S3_BUCKET "$OLD" AWS_S3_BUCKET_PER_SPACE "" AWS_S3_RELOCATE_ON_BOOT "" OLD_BUCKET ""
    restart_app
    log "Back on single bucket $OLD."
    ;;
  *)
    trap - ERR
    sed -n '2,23p' "$0"; exit 1
    ;;
esac

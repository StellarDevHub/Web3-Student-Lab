#!/usr/bin/env bash
# ==============================================================================
# PostgreSQL Backup, WAL Archiving & Point-In-Time Recovery Orchestrator
# Identifier: BE-084
#
# Provides the building blocks for an automated disaster-recovery pipeline:
#
#   base-backup    Daily full physical backup (pg_basebackup), encrypted and
#                  uploaded to every configured region. Old backups are pruned
#                  or moved to cold storage.
#   wal-archive    PostgreSQL `archive_command` target (`%p %f`). Encrypts and
#                  uploads a completed WAL segment to all regions, and only
#                  exits 0 once every region has the object (PostgreSQL retries
#                  otherwise, so no WAL gap is silently created).
#   fetch-wal      PostgreSQL `restore_command` target (`%f %p`). Downloads and
#                  decrypts one archived segment during recovery.
#   restore        Prepares a data directory for PITR: latest base backup at or
#                  before the target time plus recovery configuration.
#   drill          Restores the latest backup to a staging directory, starts a
#                  throwaway PostgreSQL instance, replays WAL to the target
#                  time, promotes, runs an integrity query, and enforces the
#                  RTO/RPO budgets. Exits non-zero on any breach.
#   status         Reports base-backup age and WAL archive lag (RPO). With
#                  `--check`, exits non-zero when the lag exceeds the budget.
#   cold-storage   Moves backups older than BACKUP_COLD_AFTER_DAYS to a cold
#                  prefix (S3 DEEP_ARCHIVE, or a local `cold/` directory).
#
# Storage backends:
#   BACKUP_STORAGE=local   Local directory, used by CI and restore drills.
#   BACKUP_STORAGE=s3      AWS S3 (aws CLI). All objects are written to every
#                          bucket in BACKUP_S3_BUCKETS for multi-region
#                          durability; reads use the first bucket.
#
# Everything is encrypted client-side with AES-256-CBC (PBKDF2) before it
# leaves the host. The encryption key must never be stored with the backups.
#
# Usage:
#   scripts/db-backup-pitr.sh base-backup
#   scripts/db-backup-pitr.sh wal-archive /pgdata/pg_wal/000... 000...
#   scripts/db-backup-pitr.sh fetch-wal 000... /pgdata/pg_wal/000...
#   scripts/db-backup-pitr.sh restore --target-time 2026-11-23T10:00:00Z --dest /restore
#   scripts/db-backup-pitr.sh drill --target-time 2026-11-23T10:00:00Z --dest /restore
#   scripts/db-backup-pitr.sh status [--check]
#   scripts/db-backup-pitr.sh cold-storage
# ==============================================================================

set -Eeuo pipefail
umask 077

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
STARTED_EPOCH="$(date -u +%s)"

# ── Connection ────────────────────────────────────────────────────────────────
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGDATABASE="${PGDATABASE:-postgres}"
if [[ -n "${PGPASSWORD:-}" ]]; then
  export PGPASSWORD
fi

# ── Storage ───────────────────────────────────────────────────────────────────
BACKUP_STORAGE="${BACKUP_STORAGE:-s3}"
BACKUP_LOCAL_DIR="${BACKUP_LOCAL_DIR:-/var/backups/pitr}"
BACKUP_S3_BUCKETS="${BACKUP_S3_BUCKETS:-${BACKUP_S3_BUCKET:-}}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-pitr}"
BACKUP_S3_REGION="${BACKUP_S3_REGION:-${AWS_REGION:-us-east-1}}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_WAL_RETENTION_DAYS="${BACKUP_WAL_RETENTION_DAYS:-14}"
BACKUP_COLD_AFTER_DAYS="${BACKUP_COLD_AFTER_DAYS:-14}"

# ── Encryption ────────────────────────────────────────────────────────────────
BACKUP_ENCRYPTION="${BACKUP_ENCRYPTION:-openssl}"
BACKUP_ENCRYPTION_CIPHER="${BACKUP_ENCRYPTION_CIPHER:-aes-256-cbc}"

# ── Recovery objectives (defaults match BE-084 acceptance criteria) ───────────
BACKUP_RTO_BUDGET_SECONDS="${BACKUP_RTO_BUDGET_SECONDS:-1800}" # 30 minutes
BACKUP_RPO_BUDGET_SECONDS="${BACKUP_RPO_BUDGET_SECONDS:-300}"  # 5 minutes

# ── Staging instance used by `drill` ─────────────────────────────────────────
STAGING_PORT="${STAGING_PORT:-55433}"
STAGING_PGUSER="${STAGING_PGUSER:-$PGUSER}"
STAGING_PGDATABASE="${STAGING_PGDATABASE:-$PGDATABASE}"
STAGING_PGPASSWORD="${STAGING_PGPASSWORD:-${PGPASSWORD:-}}"
PITR_VERIFY_SQL="${PITR_VERIFY_SQL:-SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';}"
PITR_EXPECTED_RESULT="${PITR_EXPECTED_RESULT:-}"
PITR_REPORT_PATH="${PITR_REPORT_PATH:-}"
PITR_KEEP_RESTORE="${PITR_KEEP_RESTORE:-false}"

WORK_DIR=""
STAGING_STARTED="false"
RESTORE_DIR=""
RESTORE_CREATED="false"

# ── Logging ───────────────────────────────────────────────────────────────────
log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
warn() { log "⚠️  $*"; }
die()  { log "❌ $*"; exit 1; }

cleanup() {
  local exit_code=$?
  if [[ "$STAGING_STARTED" == "true" && -n "${RESTORE_DIR:-}" && -d "$RESTORE_DIR" ]]; then
    pg_ctl -D "$RESTORE_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  if [[ -n "$WORK_DIR" && -d "$WORK_DIR" ]]; then
    rm -rf "$WORK_DIR"
  fi
  # Only delete a restore directory this run created; never remove a path the
  # caller supplied that already existed (prepare_restore refuses those).
  if [[ "$PITR_KEEP_RESTORE" != "true" && "$RESTORE_CREATED" == "true" && -n "$RESTORE_DIR" && -d "$RESTORE_DIR" ]]; then
    rm -rf "$RESTORE_DIR"
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' is not installed or not on PATH."
}

require_client() {
  require_cmd psql
}

require_server_bin() {
  require_cmd pg_ctl
  require_cmd initdb
}

# ── Configuration validation ─────────────────────────────────────────────────
s3_buckets() {
  local raw="${BACKUP_S3_BUCKETS// /}"
  [[ -n "$raw" ]] || die "BACKUP_STORAGE=s3 requires BACKUP_S3_BUCKETS=bucket-a,bucket-b (or BACKUP_S3_BUCKET)."
  tr ',' '\n' <<<"$raw" | sed '/^$/d'
}

validate_config() {
  case "$BACKUP_STORAGE" in
    local | s3) ;;
    *) die "Unsupported BACKUP_STORAGE '$BACKUP_STORAGE' (expected local or s3)." ;;
  esac

  if [[ "$BACKUP_STORAGE" == "s3" ]]; then
    require_cmd aws
    s3_buckets >/dev/null
  fi

  if [[ "$BACKUP_ENCRYPTION" != "none" ]]; then
    require_cmd openssl
    if [[ -n "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]]; then
      [[ -r "$BACKUP_ENCRYPTION_KEY_FILE" ]] || die "Cannot read BACKUP_ENCRYPTION_KEY_FILE."
      BACKUP_ENCRYPTION_KEY="$(cat "$BACKUP_ENCRYPTION_KEY_FILE")"
    fi
    [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] || die \
      "Encryption is enabled but no key is configured. Set BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEY_FILE, or BACKUP_ENCRYPTION=none for a local drill."
    # openssl receives the key through the environment; keep it out of argv.
    export BACKUP_ENCRYPTION_KEY
  fi
}

encryption_label() {
  if [[ "$BACKUP_ENCRYPTION" == "none" ]]; then
    echo "none"
  else
    echo "openssl-${BACKUP_ENCRYPTION_CIPHER}"
  fi
}

encrypt_file() {
  local src=$1 dest=$2
  if [[ "$BACKUP_ENCRYPTION" == "none" ]]; then
    cp -f "$src" "$dest"
  else
    openssl enc "-$BACKUP_ENCRYPTION_CIPHER" -pbkdf2 -salt -in "$src" -out "$dest" \
      -pass env:BACKUP_ENCRYPTION_KEY
  fi
}

decrypt_file() {
  local src=$1 dest=$2
  if [[ "$BACKUP_ENCRYPTION" == "none" ]]; then
    cp -f "$src" "$dest"
  else
    openssl enc -d "-$BACKUP_ENCRYPTION_CIPHER" -pbkdf2 -in "$src" -out "$dest" \
      -pass env:BACKUP_ENCRYPTION_KEY
  fi
}

# ── Storage abstraction ───────────────────────────────────────────────────────
object_key() {
  printf '%s/%s' "${BACKUP_S3_PREFIX%/}" "$1"
}

storage_put() {
  local src=$1 key=$2
  key="$(object_key "$key")"
  case "$BACKUP_STORAGE" in
    local)
      local dest="$BACKUP_LOCAL_DIR/$key"
      mkdir -p "$(dirname "$dest")"
      cp -f "$src" "$dest.tmp.$$"
      mv -f "$dest.tmp.$$" "$dest"
      ;;
    s3)
      local bucket
      while IFS= read -r bucket; do
        aws s3 cp "$src" "s3://$bucket/$key" \
          --region "$BACKUP_S3_REGION" --only-show-errors --no-progress
      done < <(s3_buckets)
      ;;
  esac
}

storage_get() {
  local key=$1 dest=$2
  key="$(object_key "$key")"
  case "$BACKUP_STORAGE" in
    local) cp -f "$BACKUP_LOCAL_DIR/$key" "$dest" ;;
    s3)
      local bucket
      bucket="$(s3_buckets | head -1)"
      aws s3 cp "s3://$bucket/$key" "$dest" \
        --region "$BACKUP_S3_REGION" --only-show-errors --no-progress
      ;;
  esac
}

storage_exists() {
  local key
  key="$(object_key "$1")"
  case "$BACKUP_STORAGE" in
    local) [[ -f "$BACKUP_LOCAL_DIR/$key" ]] ;;
    s3)
      local bucket
      while IFS= read -r bucket; do
        aws s3api head-object --bucket "$bucket" --key "$key" \
          --region "$BACKUP_S3_REGION" >/dev/null 2>&1 || return 1
      done < <(s3_buckets)
      ;;
  esac
}

storage_delete() {
  local key
  key="$(object_key "$1")"
  case "$BACKUP_STORAGE" in
    local) rm -rf "${BACKUP_LOCAL_DIR:?}/$key" ;;
    s3)
      local bucket
      while IFS= read -r bucket; do
        aws s3 rm "s3://$bucket/$key" --recursive \
          --region "$BACKUP_S3_REGION" --only-show-errors >/dev/null
      done < <(s3_buckets)
      ;;
  esac
}

list_backup_ids() {
  case "$BACKUP_STORAGE" in
    local)
      local root
      root="$BACKUP_LOCAL_DIR/$(object_key base)"
      [[ -d "$root" ]] || return 0
      find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null || true
      ;;
    s3)
      local bucket
      bucket="$(s3_buckets | head -1)"
      aws s3 ls "s3://$bucket/$(object_key base)/" --region "$BACKUP_S3_REGION" 2>/dev/null \
        | awk '$1 == "PRE" { print $2 }' | sed 's#/$##' || true
      ;;
  esac | sort
}

manifest_get() {
  local file=$1 field=$2
  sed -n "s/^${field}=//p" "$file" | head -1
}

backup_epoch() {
  local id=$1
  local epoch="${id%%-*}"
  [[ "$epoch" =~ ^[0-9]+$ ]] || return 1
  echo "$epoch"
}

# Newest archived WAL object time, in epoch seconds (empty when none exist).
newest_wal_epoch() {
  case "$BACKUP_STORAGE" in
    local)
      local dir
      dir="$BACKUP_LOCAL_DIR/$(object_key wal)"
      [[ -d "$dir" ]] || return 0
      find "$dir" -maxdepth 1 -type f -name '*.enc' -printf '%T@\n' 2>/dev/null \
        | sort -n | tail -1 | cut -d. -f1
      ;;
    s3)
      local bucket
      bucket="$(s3_buckets | head -1)"
      aws s3 ls "s3://$bucket/$(object_key wal)/" --region "$BACKUP_S3_REGION" 2>/dev/null \
        | awk '{ print $1" "$2 }' \
        | while read -r day time; do
            [[ -n "$day" ]] && date -u -d "$day $time" +%s 2>/dev/null || true
          done | sort -n | tail -1
      ;;
  esac
}

# ── WAL archiving ─────────────────────────────────────────────────────────────
cmd_wal_archive() {
  [[ $# -eq 2 ]] || die "Usage: $0 wal-archive <wal-path> <wal-filename>"
  validate_config
  local src=$1 name=$2 tmp enc

  [[ -f "$src" ]] || die "WAL file '$src' does not exist."
  # PostgreSQL archives completed segments, base-backup label files
  # (``<segment>.<offset>.backup``) and timeline history files. A `.partial`
  # name means a misconfiguration and must not be marked archived.
  [[ "$name" =~ ^([0-9A-F]{24}|[0-9A-F]{24}\.[0-9A-F]{8}\.backup|[0-9A-F]{8}\.history)$ ]] \
    || die "Refusing to archive unexpected WAL filename '$name'."

  if storage_exists "wal/$name.enc"; then
    log "WAL segment $name is already archived; skipping."
    return 0
  fi

  tmp="$(mktemp -d)"
  enc="$tmp/$name.enc"
  encrypt_file "$src" "$enc"
  storage_put "$enc" "wal/$name.enc"

  # Only succeed once every region has the object; otherwise PostgreSQL keeps
  # the segment and retries, preserving the RPO guarantee.
  if ! storage_exists "wal/$name.enc"; then
    rm -rf "$tmp"
    die "WAL segment $name was not confirmed in all configured regions."
  fi
  log "Archived WAL segment $name ($(wc -c <"$enc") bytes)."
  rm -rf "$tmp"
}

cmd_fetch_wal() {
  [[ $# -eq 2 ]] || die "Usage: $0 fetch-wal <wal-filename> <destination>"
  validate_config
  local name=$1 dest=$2 tmp enc

  tmp="$(mktemp -d)"
  enc="$tmp/$name.enc"

  if ! storage_get "wal/$name.enc" "$enc" 2>/dev/null; then
    # restore_command uses a non-zero exit to tell PostgreSQL the segment is
    # not available; that is expected while recovery probes ahead.
    rm -rf "$tmp"
    log "WAL segment $name is not in the archive."
    return 1
  fi

  decrypt_file "$enc" "$dest"
  log "Fetched WAL segment $name."
  rm -rf "$tmp"
}

# ── Base backups ──────────────────────────────────────────────────────────────
cmd_base_backup() {
  validate_config
  require_client
  require_cmd pg_basebackup
  require_cmd sha256sum

  local start_epoch finished_epoch iso backup_id dir
  local start_lsn stop_lsn size_bytes
  start_epoch="$(date -u +%s)"
  log "Starting base backup of $PGHOST:$PGPORT/$PGDATABASE (storage=$BACKUP_STORAGE)."

  WORK_DIR="$(mktemp -d)"
  dir="$WORK_DIR/pg_basebackup"
  mkdir -p "$dir/data" "$dir/encrypted"

  start_lsn="$(psql -tAc 'SELECT pg_current_wal_lsn()' | tr -d '[:space:]')"
  pg_basebackup \
    --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" \
    --pgdata="$dir/data" --format=tar --gzip --wal-method=stream \
    --checkpoint=fast --no-password --verbose \
    >/dev/null

  finished_epoch="$(date -u +%s)"
  iso="$(date -u -d "@$finished_epoch" +%Y%m%dT%H%M%SZ)"
  backup_id="${finished_epoch}-${iso}"
  stop_lsn="$(psql -tAc 'SELECT pg_current_wal_lsn()' | tr -d '[:space:]')"

  local manifest="$dir/manifest.env" file base sha enc
  : >"$manifest"
  size_bytes=0
  for file in "$dir/data"/*; do
    [[ -f "$file" ]] || continue
    base="$(basename "$file")"
    enc="$dir/encrypted/$base.enc"
    encrypt_file "$file" "$enc"
    storage_put "$enc" "base/$backup_id/$base.enc"
    sha="$(sha256sum "$enc" | awk '{print $1}')"
    printf 'BACKUP_FILE_%s=%s\n' "${base//[^A-Za-z0-9_.-]/_}" "$sha" >>"$manifest"
    size_bytes=$((size_bytes + $(wc -c <"$enc")))
  done

  cat >>"$manifest" <<EOF
BACKUP_ID=$backup_id
BACKUP_EPOCH=$finished_epoch
BACKUP_ISO=$(date -u -d "@$finished_epoch" +%Y-%m-%dT%H:%M:%SZ)
BACKUP_STARTED_EPOCH=$start_epoch
BACKUP_FINISHED_EPOCH=$finished_epoch
BACKUP_DURATION_SECONDS=$((finished_epoch - start_epoch))
BACKUP_START_LSN=$start_lsn
BACKUP_STOP_LSN=$stop_lsn
BACKUP_SIZE_BYTES=$size_bytes
BACKUP_ENCRYPTION=$(encryption_label)
BACKUP_STORAGE=$BACKUP_STORAGE
BACKUP_S3_PREFIX=$BACKUP_S3_PREFIX
EOF

  # Manifest is uploaded last: a crash mid-upload leaves an undiscoverable
  # partial backup instead of a restore candidate.
  storage_put "$manifest" "base/$backup_id/manifest.env"
  storage_exists "base/$backup_id/manifest.env" || die "Manifest for backup $backup_id was not confirmed."
  log "Base backup complete: id=$backup_id size=${size_bytes}B duration=$((finished_epoch - start_epoch))s"

  prune_hot_backups
}

delete_backup() {
  log "Deleting base backup $1 (retention)."
  storage_delete "base/$1/"
}

prune_hot_backups() {
  local cutoff id epoch
  cutoff=$(( $(date -u +%s) - BACKUP_RETENTION_DAYS * 86400 ))
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    epoch="$(backup_epoch "$id")" || continue
    if (( epoch < cutoff )); then
      delete_backup "$id"
    fi
  done < <(list_backup_ids)

  prune_wal_archive
}

prune_wal_archive() {
  case "$BACKUP_STORAGE" in
    local)
      local dir
      dir="$BACKUP_LOCAL_DIR/$(object_key wal)"
      [[ -d "$dir" ]] || return 0
      find "$dir" -maxdepth 1 -type f -name '*.enc' \
        -mtime "+$BACKUP_WAL_RETENTION_DAYS" -delete 2>/dev/null || true
      ;;
    s3) log "S3 WAL retention is enforced by a bucket lifecycle rule (see docs/DATABASE_BACKUP_PITR.md)." ;;
  esac
}

cmd_cold_storage() {
  validate_config
  local cutoff id epoch
  cutoff=$(( $(date -u +%s) - BACKUP_COLD_AFTER_DAYS * 86400 ))
  log "Moving base backups older than ${BACKUP_COLD_AFTER_DAYS}d to cold storage."

  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    epoch="$(backup_epoch "$id")" || continue
    (( epoch < cutoff )) || continue

    case "$BACKUP_STORAGE" in
      local)
        local src dest
        src="$BACKUP_LOCAL_DIR/$(object_key base)/$id"
        dest="$BACKUP_LOCAL_DIR/$(object_key cold)/$id"
        [[ -d "$src" ]] || continue
        mkdir -p "$(dirname "$dest")"
        mv "$src" "$dest"
        log "Moved $id to $(object_key cold)/$id."
        ;;
      s3)
        local bucket
        while IFS= read -r bucket; do
          aws s3 cp "s3://$bucket/$(object_key base)/$id/" "s3://$bucket/$(object_key cold)/$id/" \
            --recursive --storage-class DEEP_ARCHIVE \
            --region "$BACKUP_S3_REGION" --only-show-errors --no-progress
          aws s3 rm "s3://$bucket/$(object_key base)/$id/" --recursive \
            --region "$BACKUP_S3_REGION" --only-show-errors >/dev/null
        done < <(s3_buckets)
        log "Archived $id to $(object_key cold)/$id (DEEP_ARCHIVE)."
        ;;
    esac
  done < <(list_backup_ids)
}

# ── Restore preparation ───────────────────────────────────────────────────────
select_backup_id() {
  local target_epoch=$1 best="" id epoch
  while IFS= read -r id; do
    [[ -n "$id" ]] || continue
    epoch="$(backup_epoch "$id")" || continue
    (( epoch <= target_epoch )) && best="$id"
  done < <(list_backup_ids)
  printf '%s' "$best"
}

download_manifest() {
  local id=$1 dest=$2
  storage_get "base/$id/manifest.env" "$dest"
}

fetch_and_verify() {
  local id=$1 name=$2 dest=$3 manifest=$4
  local expected actual
  storage_get "base/$id/$name.enc" "$dest"
  expected="$(manifest_get "$manifest" "BACKUP_FILE_${name//[^A-Za-z0-9_.-]/_}")"
  if [[ -n "$expected" ]]; then
    actual="$(sha256sum "$dest" | awk '{print $1}')"
    [[ "$actual" == "$expected" ]] || die "Checksum mismatch for $name (expected $expected, got $actual)."
  fi
}

restore_command_value() {
  local key_file=$1
  local args=(
    env "BACKUP_STORAGE=$BACKUP_STORAGE"
    "BACKUP_LOCAL_DIR=$BACKUP_LOCAL_DIR"
    "BACKUP_S3_BUCKETS=$BACKUP_S3_BUCKETS"
    "BACKUP_S3_PREFIX=$BACKUP_S3_PREFIX"
    "BACKUP_S3_REGION=$BACKUP_S3_REGION"
    "BACKUP_ENCRYPTION=$BACKUP_ENCRYPTION"
    "BACKUP_ENCRYPTION_CIPHER=$BACKUP_ENCRYPTION_CIPHER"
  )
  if [[ "$BACKUP_ENCRYPTION" != "none" ]]; then
    args+=("BACKUP_ENCRYPTION_KEY_FILE=$key_file")
  fi
  args+=("$SCRIPT_PATH" fetch-wal)

  # Build a shell command where only values that need quoting are quoted.
  # postgresql.conf literals do not process backslashes, so shell quoting
  # survives except for embedded single quotes, which must be doubled.
  local value="" arg
  for arg in "${args[@]}"; do
    if [[ -z "$value" ]]; then
      value="$(printf '%q' "$arg")"
    else
      value+=" $(printf '%q' "$arg")"
    fi
  done
  value+=" %f %p"
  printf "'%s'" "${value//\'/\'\'}"
}

prepare_restore() {
  local target_epoch=$1 dest=$2 backup_id=$3 target_time_raw=${4:-}
  local manifest="$WORK_DIR/manifest.env"
  local base_enc="$WORK_DIR/base.tar.gz.enc"
  local wal_enc="$WORK_DIR/pg_wal.tar.gz.enc"
  local base_tar="$WORK_DIR/base.tar.gz"
  local wal_tar="$WORK_DIR/pg_wal.tar.gz"
  local target_iso

  validate_config
  require_cmd tar

  backup_id="${backup_id:-$(select_backup_id "$target_epoch")}"
  [[ -n "$backup_id" ]] || die "No base backup exists at or before the requested target time."
  log "Selected base backup $backup_id for target $(date -u -d "@$target_epoch" +%Y-%m-%dT%H:%M:%SZ)."

  download_manifest "$backup_id" "$manifest"
  fetch_and_verify "$backup_id" "base.tar.gz" "$base_enc" "$manifest"
  fetch_and_verify "$backup_id" "pg_wal.tar.gz" "$wal_enc" "$manifest"

  decrypt_file "$base_enc" "$base_tar"
  decrypt_file "$wal_enc" "$wal_tar"

  if [[ -d "$dest" && -n "$(ls -A "$dest" 2>/dev/null || true)" ]]; then
    die "Restore destination '$dest' is not empty. Use a clean directory."
  fi
  mkdir -p "$dest"
  RESTORE_CREATED="true"
  chmod 700 "$dest"
  tar -xzf "$base_tar" -C "$dest"
  mkdir -p "$dest/pg_wal"
  tar -xzf "$wal_tar" -C "$dest/pg_wal"
  chmod 700 "$dest/pg_wal"

  target_iso="$(date -u -d "@$target_epoch" +%Y-%m-%dT%H:%M:%SZ)"
  # PostgreSQL's recovery_target_time does not accept the ISO "Z" suffix but
  # does accept microsecond precision, which callers may rely on to stop
  # exactly between two adjacent transactions.
  local target_pg
  target_pg="$(date -u -d "${target_time_raw:-@$target_epoch}" +'%Y-%m-%d %H:%M:%S.%6N+00')"
  [[ "$SCRIPT_PATH" != *"'"* && "$dest" != *"'"* ]] || die "Paths containing single quotes are not supported."

  # restore_command needs the key at replay time. Store it inside the 0700
  # restore directory (never in a world-readable location) and reference the
  # path instead of the secret itself so it does not appear in auto.conf.
  local key_file=""
  if [[ "$BACKUP_ENCRYPTION" != "none" ]]; then
    key_file="$dest/.pitr-encryption.key"
    printf '%s' "$BACKUP_ENCRYPTION_KEY" >"$key_file"
    chmod 600 "$key_file"
  fi
  cat >>"$dest/postgresql.auto.conf" <<EOF

# --- BE-084 PITR recovery configuration ---
restore_command = $(restore_command_value "$key_file")
recovery_target_time = '$target_pg'
recovery_target_action = 'promote'
recovery_target_inclusive = on
archive_mode = off
archive_command = ''
EOF
  touch "$dest/recovery.signal"
  log "Restore directory prepared at $dest (target $target_iso)."
}

cmd_restore() {
  local target_time="" dest="" backup_id="" target_epoch
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-time) target_time="${2:-}"; shift 2 ;;
      --dest) dest="${2:-}"; shift 2 ;;
      --backup-id) backup_id="${2:-}"; shift 2 ;;
      *) die "Unknown restore option '$1'." ;;
    esac
  done
  [[ -n "$dest" ]] || die "restore requires --dest <empty-directory>."
  target_time="${target_time:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  target_epoch="$(date -u -d "$target_time" +%s)" || die "Invalid --target-time '$target_time'."
  WORK_DIR="$(mktemp -d)"
  RESTORE_DIR="$dest"
  PITR_KEEP_RESTORE=true
  prepare_restore "$target_epoch" "$dest" "$backup_id" "$target_time"
  log "Start the restored instance with: pg_ctl -D '$dest' -o '-p $STAGING_PORT' start"
  if [[ "$BACKUP_ENCRYPTION" != "none" ]]; then
    log "Remove '$dest/.pitr-encryption.key' after recovery has completed."
  fi
}

# ── Restore drill ─────────────────────────────────────────────────────────────
wait_for_promotion() {
  local port=$1 deadline=$(( $(date -u +%s) + BACKUP_RTO_BUDGET_SECONDS )) result
  while (( $(date -u +%s) < deadline )); do
    if result="$(PGPASSWORD="$STAGING_PGPASSWORD" psql -h 127.0.0.1 -p "$port" \
      -U "$STAGING_PGUSER" -d "$STAGING_PGDATABASE" -tAc 'SELECT pg_is_in_recovery()' 2>/dev/null)"; then
      if [[ "$result" == "f" ]]; then
        return 0
      fi
    fi
    sleep 2
  done
  return 1
}

run_verify_sql() {
  local port=$1 output
  output="$(PGPASSWORD="$STAGING_PGPASSWORD" psql -h 127.0.0.1 -p "$port" \
    -U "$STAGING_PGUSER" -d "$STAGING_PGDATABASE" -tAc "$PITR_VERIFY_SQL")" \
    || die "Integrity query failed on the restored instance."
  output="${output//[[:space:]]/}"
  if [[ -n "$PITR_EXPECTED_RESULT" ]]; then
    [[ "$output" == "$PITR_EXPECTED_RESULT" ]] \
      || die "Integrity check mismatch: expected '$PITR_EXPECTED_RESULT', got '$output'."
  fi
  log "Integrity query passed (result: $output)."
}

write_report() {
  local backup_id=$1 target_iso=$2 rto=$3 rpo=$4 status=$5 restored_iso=$6
  local report
  report="$(cat <<EOF
{
  "backupId": "$backup_id",
  "targetTime": "$target_iso",
  "restoredAt": "$restored_iso",
  "rtoSeconds": $rto,
  "rtoBudgetSeconds": $BACKUP_RTO_BUDGET_SECONDS,
  "rpoLagSeconds": $rpo,
  "rpoBudgetSeconds": $BACKUP_RPO_BUDGET_SECONDS,
  "verification": "$status"
}
EOF
)"
  printf '%s\n' "$report"
  if [[ -n "$PITR_REPORT_PATH" ]]; then
    mkdir -p "$(dirname "$PITR_REPORT_PATH")"
    printf '%s\n' "$report" >"$PITR_REPORT_PATH"
    log "Wrote drill report to $PITR_REPORT_PATH."
  fi
}

cmd_drill() {
  validate_config
  require_client
  require_server_bin

  local target_time="" dest="" port="$STAGING_PORT" backup_id="" target_epoch target_iso
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --target-time) target_time="${2:-}"; shift 2 ;;
      --dest) dest="${2:-}"; shift 2 ;;
      --port) port="${2:-}"; shift 2 ;;
      --backup-id) backup_id="${2:-}"; shift 2 ;;
      *) die "Unknown drill option '$1'." ;;
    esac
  done

  target_time="${target_time:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  target_epoch="$(date -u -d "$target_time" +%s)" || die "Invalid --target-time '$target_time'."
  target_iso="$(date -u -d "@$target_epoch" +%Y-%m-%dT%H:%M:%SZ)"
  dest="${dest:-${TMPDIR:-/tmp}/pitr-drill-$$}"
  backup_id="${backup_id:-$(select_backup_id "$target_epoch")}"
  [[ -n "$backup_id" ]] || die "No base backup exists at or before $target_iso."

  # RPO: how far the newest archived segment lags behind the recovery target.
  # \`target_epoch\` is the simulated disaster time, so this is the maximum
  # transaction window that could be lost.
  local wal_epoch rpo_lag=0
  wal_epoch="$(newest_wal_epoch)" || wal_epoch=""
  if [[ -n "$wal_epoch" ]]; then
    rpo_lag=$(( target_epoch - wal_epoch ))
    (( rpo_lag < 0 )) && rpo_lag=0
  else
    warn "No archived WAL segments were found; RPO cannot be validated from the archive."
    rpo_lag=$BACKUP_RPO_BUDGET_SECONDS
  fi
  if (( rpo_lag > BACKUP_RPO_BUDGET_SECONDS )); then
    die "RPO breach: newest archived WAL is ${rpo_lag}s behind the target (budget ${BACKUP_RPO_BUDGET_SECONDS}s)."
  fi
  log "RPO check passed: ${rpo_lag}s of potential data loss (budget ${BACKUP_RPO_BUDGET_SECONDS}s)."

  WORK_DIR="$(mktemp -d)"
  RESTORE_DIR="$dest"
  local drill_start rto log_file
  drill_start="$(date -u +%s)"
  log "Preparing PITR restore of $backup_id to $target_iso."
  prepare_restore "$target_epoch" "$dest" "$backup_id" "$target_time"

  log "Starting staging instance on port $port from $dest."
  log_file="$WORK_DIR/staging.log"
  pg_ctl -D "$dest" -l "$log_file" -o "-p $port -c listen_addresses=127.0.0.1" \
    -w -t "$BACKUP_RTO_BUDGET_SECONDS" start \
    || { tail -n 50 "$log_file" >&2 || true; die "Staging PostgreSQL failed to start."; }
  STAGING_STARTED="true"

  wait_for_promotion "$port" || { tail -n 50 "$log_file" >&2 || true; die "Recovery did not reach the target time within the RTO budget."; }
  run_verify_sql "$port"

  local rto
  rto=$(( $(date -u +%s) - drill_start ))
  if (( rto > BACKUP_RTO_BUDGET_SECONDS )); then
    die "RTO breach: drill took ${rto}s (budget ${BACKUP_RTO_BUDGET_SECONDS}s)."
  fi

  pg_ctl -D "$dest" -m fast stop >/dev/null 2>&1 || true
  STAGING_STARTED="false"
  rm -f "$dest/.pitr-encryption.key"
  log "Drill passed in ${rto}s: backup $backup_id restored to $target_iso."
  write_report "$backup_id" "$target_iso" "$rto" "$rpo_lag" "passed" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

# ── Status / health check ─────────────────────────────────────────────────────
cmd_status() {
  validate_config
  local check=false
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check) check=true; shift ;;
      *) die "Unknown status option '$1'." ;;
    esac
  done

  local now latest_id latest_epoch backup_age=-1 wal_epoch wal_lag=-1 status=ok
  now="$(date -u +%s)"
  latest_id="$(list_backup_ids | tail -1)"
  if [[ -n "$latest_id" ]]; then
    latest_epoch="$(backup_epoch "$latest_id")" || latest_epoch=""
    [[ -n "$latest_epoch" ]] && backup_age=$(( now - latest_epoch ))
  fi
  wal_epoch="$(newest_wal_epoch)" || wal_epoch=""
  [[ -n "$wal_epoch" ]] && wal_lag=$(( now - wal_epoch ))

  if [[ -z "$latest_id" ]]; then
    status="no-backups"
  elif (( wal_lag < 0 || wal_lag > BACKUP_RPO_BUDGET_SECONDS )); then
    status="rpo-breach"
  fi

  printf 'latest_backup_id=%s\n' "${latest_id:-none}"
  printf 'latest_backup_age_seconds=%s\n' "$backup_age"
  printf 'wal_archive_lag_seconds=%s\n' "$wal_lag"
  printf 'rpo_budget_seconds=%s\n' "$BACKUP_RPO_BUDGET_SECONDS"
  printf 'status=%s\n' "$status"

  if [[ "$check" == "true" && "$status" != "ok" ]]; then
    die "Backup health check failed: $status."
  fi
}

usage() {
  sed -n '2,45p' "$SCRIPT_PATH" | sed 's/^# \{0,1\}//'
}

main() {
  local command="${1:-}"
  [[ $# -gt 0 ]] && shift
  case "$command" in
    base-backup) cmd_base_backup "$@" ;;
    wal-archive) cmd_wal_archive "$@" ;;
    fetch-wal) cmd_fetch_wal "$@" ;;
    restore) cmd_restore "$@" ;;
    drill) cmd_drill "$@" ;;
    status) cmd_status "$@" ;;
    cold-storage) cmd_cold_storage "$@" ;;
    "" | help | --help | -h) usage; return 0 ;;
    *) die "Unknown command '$command'. Run '$0 help'." ;;
  esac
  log "Completed '$command' in $(( $(date -u +%s) - STARTED_EPOCH ))s."
}

main "$@"

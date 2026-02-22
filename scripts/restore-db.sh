#!/bin/bash
# =============================================================================
# WindparkManager - PostgreSQL Restore Script
#
# Usage:
#   ./scripts/restore-db.sh <backup-file>
#   ./scripts/restore-db.sh --list                    # List available backups
#   ./scripts/restore-db.sh --latest [daily|weekly]   # Restore latest of type
#   ./scripts/restore-db.sh --from-s3 <s3-key>        # Download and restore from S3
#
# Environment Variables:
#   PGHOST          - PostgreSQL host (default: postgres)
#   PGUSER          - PostgreSQL user (default: wpm)
#   PGPASSWORD      - PostgreSQL password (required)
#   PGDATABASE      - PostgreSQL database (default: windparkmanager)
#   PGPORT          - PostgreSQL port (default: 5432)
#
#   BACKUP_DIR      - Local backup directory (default: /backups)
#   BACKUP_S3_BUCKET    - S3 bucket name (default: wpm-backups)
#   BACKUP_S3_ENDPOINT  - S3/MinIO endpoint URL
#   BACKUP_S3_ACCESS_KEY - S3 access key
#   BACKUP_S3_SECRET_KEY - S3 secret key
#
# WARNING: This script will DROP and recreate database objects!
#          Always verify you have a recent backup before restoring.
# =============================================================================

set -euo pipefail

# ---- Configuration ----------------------------------------------------------

PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-wpm}"
PGDATABASE="${PGDATABASE:-windparkmanager}"
PGPORT="${PGPORT:-5432}"
export PGHOST PGUSER PGDATABASE PGPORT

BACKUP_DIR="${BACKUP_DIR:-/backups}"

S3_BUCKET="${BACKUP_S3_BUCKET:-wpm-backups}"
S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"

# ---- Helpers ----------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RESTORE] $*"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RESTORE] [ERROR] $*" >&2
}

die() {
  log_error "$*"
  exit 1
}

# ---- List Backups -----------------------------------------------------------

list_backups() {
  log "Available local backups:"
  echo ""

  for btype in daily weekly monthly; do
    local dir="${BACKUP_DIR}/${btype}"
    if [ -d "$dir" ]; then
      local count
      count=$(find "$dir" -maxdepth 1 -name "*.dump" -type f 2>/dev/null | wc -l)
      echo "=== ${btype} (${count} backups) ==="

      if [ "$count" -gt 0 ]; then
        find "$dir" -maxdepth 1 -name "*.dump" -type f -printf '%T@ %s %p\n' 2>/dev/null \
          | sort -rn \
          | while IFS= read -r line; do
              local size path
              size=$(echo "$line" | awk '{printf "%.1f MB", $2/1024/1024}')
              path=$(echo "$line" | cut -d' ' -f3-)
              local filename
              filename=$(basename "$path")
              local mod_date
              mod_date=$(stat -c '%y' "$path" 2>/dev/null | cut -d'.' -f1)
              echo "  $filename  ($size)  $mod_date"
            done
      else
        echo "  (no backups)"
      fi
      echo ""
    fi
  done

  # List S3 backups if configured
  if [ -n "$S3_ENDPOINT" ]; then
    echo "=== S3 Backups (s3://${S3_BUCKET}) ==="
    if command -v mc &>/dev/null; then
      mc alias set wpm-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" --api S3v4 2>/dev/null
      mc ls --recursive "wpm-backup/${S3_BUCKET}/" 2>/dev/null | grep '\.dump$' || echo "  (no backups or not accessible)"
    elif command -v aws &>/dev/null; then
      export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
      export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
      aws s3 ls "s3://${S3_BUCKET}/" --recursive --endpoint-url "$S3_ENDPOINT" 2>/dev/null | grep '\.dump$' || echo "  (no backups or not accessible)"
    else
      echo "  (S3 configured but no CLI tool available)"
    fi
    echo ""
  fi
}

# ---- Find Latest Backup ----------------------------------------------------

find_latest_backup() {
  local btype="${1:-daily}"
  local dir="${BACKUP_DIR}/${btype}"

  if [ ! -d "$dir" ]; then
    die "Backup directory not found: $dir"
  fi

  local latest
  latest=$(find "$dir" -maxdepth 1 -name "*.dump" -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn \
    | head -1 \
    | cut -d' ' -f2-)

  if [ -z "$latest" ]; then
    die "No $btype backups found in $dir"
  fi

  echo "$latest"
}

# ---- Download from S3 ------------------------------------------------------

download_from_s3() {
  local s3_key="$1"
  local local_path="${BACKUP_DIR}/s3_restore_$(basename "$s3_key")"

  log "Downloading from S3: s3://${S3_BUCKET}/${s3_key}"

  if command -v mc &>/dev/null; then
    mc alias set wpm-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" --api S3v4 2>/dev/null
    mc cp "wpm-backup/${S3_BUCKET}/${s3_key}" "$local_path"
  elif command -v aws &>/dev/null; then
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"
    aws s3 cp "s3://${S3_BUCKET}/${s3_key}" "$local_path" --endpoint-url "$S3_ENDPOINT"
  else
    die "Neither 'mc' nor 'aws' CLI found. Cannot download from S3."
  fi

  if [ ! -s "$local_path" ]; then
    die "Downloaded file is empty: $local_path"
  fi

  log "Downloaded to $local_path ($(du -h "$local_path" | cut -f1))"
  echo "$local_path"
}

# ---- Restore ----------------------------------------------------------------

do_restore() {
  local backup_file="$1"

  # Resolve relative paths
  if [ ! -f "$backup_file" ]; then
    # Try to find the file in backup subdirectories
    for btype in daily weekly monthly; do
      local candidate="${BACKUP_DIR}/${btype}/${backup_file}"
      if [ -f "$candidate" ]; then
        backup_file="$candidate"
        break
      fi
    done
  fi

  if [ ! -f "$backup_file" ]; then
    die "Backup file not found: $backup_file"
  fi

  if [ ! -s "$backup_file" ]; then
    die "Backup file is empty: $backup_file"
  fi

  local file_size
  file_size=$(du -h "$backup_file" | cut -f1)

  log "============================================"
  log "DATABASE RESTORE"
  log "============================================"
  log "  Backup file: $(basename "$backup_file")"
  log "  File size:   $file_size"
  log "  Database:    $PGDATABASE"
  log "  Host:        $PGHOST:$PGPORT"
  log "  User:        $PGUSER"
  log "============================================"

  # Show metadata if available
  if [ -f "${backup_file}.meta" ]; then
    log "Backup metadata:"
    cat "${backup_file}.meta" | while IFS= read -r line; do log "  $line"; done
  fi

  echo ""

  # Confirmation prompt (skip if RESTORE_NO_CONFIRM is set)
  if [ "${RESTORE_NO_CONFIRM:-}" != "true" ]; then
    echo "WARNING: This will DROP and recreate all database objects in '$PGDATABASE'!"
    echo "         All current data will be replaced with the backup data."
    echo ""
    read -p "Are you sure you want to proceed? Type 'yes' to confirm: " confirm

    if [ "$confirm" != "yes" ]; then
      log "Restore cancelled by user"
      exit 0
    fi
  fi

  echo ""
  log "Starting database restore..."

  # Verify PostgreSQL is reachable
  if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q 2>/dev/null; then
    die "PostgreSQL is not reachable at $PGHOST:$PGPORT"
  fi

  # Terminate existing connections to the database (except our own)
  log "Terminating existing connections to $PGDATABASE..."
  psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$PGDATABASE' AND pid <> pg_backend_pid();" \
    2>/dev/null || true

  RESTORE_START=$(date +%s)

  # Restore using pg_restore with --clean --if-exists
  # This drops existing objects before recreating them
  pg_restore \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose \
    "$backup_file" \
    2>&1 | while IFS= read -r line; do log "  pg_restore: $line"; done

  RESTORE_END=$(date +%s)
  RESTORE_DURATION=$((RESTORE_END - RESTORE_START))

  log "============================================"
  log "Restore completed successfully!"
  log "  Duration: ${RESTORE_DURATION}s"
  log "  Database: $PGDATABASE"
  log "============================================"

  # Verify restore by checking table count
  TABLE_COUNT=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

  log "Verification: $TABLE_COUNT tables found in public schema"

  # Clean up S3 download if applicable
  if [[ "$backup_file" == *"/s3_restore_"* ]]; then
    log "Cleaning up temporary S3 download..."
    rm -f "$backup_file"
  fi
}

# ---- Main -------------------------------------------------------------------

if [ $# -eq 0 ]; then
  echo "Usage:"
  echo "  $0 <backup-file>                  Restore from a specific backup file"
  echo "  $0 --list                         List available backups"
  echo "  $0 --latest [daily|weekly|monthly] Restore latest backup of given type"
  echo "  $0 --from-s3 <s3-key>             Download from S3 and restore"
  echo ""
  echo "Examples:"
  echo "  $0 /backups/daily/wpm_backup_2026-02-12_02-00-00_daily.dump"
  echo "  $0 wpm_backup_2026-02-12_02-00-00_daily.dump    # searches in backup dirs"
  echo "  $0 --latest daily"
  echo "  $0 --from-s3 daily/wpm_backup_2026-02-12_02-00-00_daily.dump"
  echo ""
  echo "Environment: RESTORE_NO_CONFIRM=true to skip confirmation prompt"
  exit 1
fi

case "$1" in
  --list)
    list_backups
    ;;

  --latest)
    BTYPE="${2:-daily}"
    LATEST=$(find_latest_backup "$BTYPE")
    log "Latest $BTYPE backup: $(basename "$LATEST")"
    do_restore "$LATEST"
    ;;

  --from-s3)
    if [ -z "${2:-}" ]; then
      die "S3 key is required. Usage: $0 --from-s3 <s3-key>"
    fi
    if [ -z "$S3_ENDPOINT" ]; then
      die "BACKUP_S3_ENDPOINT is not set. Cannot download from S3."
    fi
    LOCAL_FILE=$(download_from_s3 "$2")
    do_restore "$LOCAL_FILE"
    ;;

  *)
    do_restore "$1"
    ;;
esac

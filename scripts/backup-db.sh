#!/bin/bash
# =============================================================================
# WindparkManager - PostgreSQL Backup Script with Retention Policy
#
# Usage: ./scripts/backup-db.sh [daily|weekly|monthly]
#
# Environment Variables:
#   PGHOST          - PostgreSQL host (default: postgres)
#   PGUSER          - PostgreSQL user (default: wpm)
#   PGPASSWORD      - PostgreSQL password (required)
#   PGDATABASE      - PostgreSQL database (default: windparkmanager)
#   PGPORT          - PostgreSQL port (default: 5432)
#
#   BACKUP_DIR      - Local backup directory (default: /backups)
#   BACKUP_RETENTION_DAILY   - Number of daily backups to keep (default: 7)
#   BACKUP_RETENTION_WEEKLY  - Number of weekly backups to keep (default: 4)
#   BACKUP_RETENTION_MONTHLY - Number of monthly backups to keep (default: 3)
#
#   BACKUP_S3_ENABLED   - Enable S3/MinIO upload (default: false)
#   BACKUP_S3_BUCKET    - S3 bucket name (default: wpm-backups)
#   BACKUP_S3_ENDPOINT  - S3/MinIO endpoint URL
#   BACKUP_S3_ACCESS_KEY - S3 access key
#   BACKUP_S3_SECRET_KEY - S3 secret key
# =============================================================================

set -euo pipefail

# ---- Configuration ----------------------------------------------------------

BACKUP_TYPE="${1:-daily}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
DATE_ONLY=$(date +%Y-%m-%d)

# PostgreSQL connection (defaults match docker-compose)
PGHOST="${PGHOST:-postgres}"
PGUSER="${PGUSER:-wpm}"
PGDATABASE="${PGDATABASE:-windparkmanager}"
PGPORT="${PGPORT:-5432}"
export PGHOST PGUSER PGDATABASE PGPORT

# Backup directory
BACKUP_DIR="${BACKUP_DIR:-/backups}"

# Retention policy
RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-3}"

# S3/MinIO settings
S3_ENABLED="${BACKUP_S3_ENABLED:-false}"
S3_BUCKET="${BACKUP_S3_BUCKET:-wpm-backups}"
S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
S3_ACCESS_KEY="${BACKUP_S3_ACCESS_KEY:-}"
S3_SECRET_KEY="${BACKUP_S3_SECRET_KEY:-}"

# ---- Helpers ----------------------------------------------------------------

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BACKUP] $*"
}

log_error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BACKUP] [ERROR] $*" >&2
}

die() {
  log_error "$*"
  exit 1
}

# Validate backup type
case "$BACKUP_TYPE" in
  daily|weekly|monthly) ;;
  *) die "Invalid backup type: $BACKUP_TYPE. Use: daily, weekly, or monthly" ;;
esac

# ---- Directory Setup --------------------------------------------------------

BACKUP_SUBDIR="${BACKUP_DIR}/${BACKUP_TYPE}"
mkdir -p "$BACKUP_SUBDIR"

BACKUP_FILE="wpm_backup_${TIMESTAMP}_${BACKUP_TYPE}.dump"
BACKUP_PATH="${BACKUP_SUBDIR}/${BACKUP_FILE}"

# ---- Pre-flight Checks -----------------------------------------------------

log "Starting $BACKUP_TYPE backup of database '$PGDATABASE' on $PGHOST:$PGPORT"

# Verify PostgreSQL is reachable
if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -q 2>/dev/null; then
  die "PostgreSQL is not reachable at $PGHOST:$PGPORT"
fi

log "PostgreSQL connection verified"

# ---- Create Backup ---------------------------------------------------------

log "Dumping database to $BACKUP_PATH ..."

DUMP_START=$(date +%s)

pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  -Fc \
  --no-owner \
  --no-acl \
  --verbose \
  -f "$BACKUP_PATH" \
  2>&1 | while IFS= read -r line; do log "  pg_dump: $line"; done

DUMP_END=$(date +%s)
DUMP_DURATION=$((DUMP_END - DUMP_START))

# Verify the dump file exists and is not empty
if [ ! -s "$BACKUP_PATH" ]; then
  die "Backup file is empty or was not created: $BACKUP_PATH"
fi

BACKUP_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)
BACKUP_SIZE_BYTES=$(stat -c%s "$BACKUP_PATH" 2>/dev/null || stat -f%z "$BACKUP_PATH" 2>/dev/null || echo "0")

log "Backup created successfully:"
log "  File: $BACKUP_FILE"
log "  Size: $BACKUP_SIZE ($BACKUP_SIZE_BYTES bytes)"
log "  Duration: ${DUMP_DURATION}s"
log "  Type: $BACKUP_TYPE"

# ---- Write Metadata --------------------------------------------------------

cat > "${BACKUP_PATH}.meta" <<EOF
{
  "fileName": "${BACKUP_FILE}",
  "type": "${BACKUP_TYPE}",
  "database": "${PGDATABASE}",
  "host": "${PGHOST}",
  "createdAt": "$(date -Iseconds)",
  "sizeBytes": ${BACKUP_SIZE_BYTES},
  "durationSeconds": ${DUMP_DURATION},
  "pgVersion": "$(pg_dump --version | head -1)"
}
EOF

log "Metadata written to ${BACKUP_FILE}.meta"

# ---- Upload to S3/MinIO (optional) -----------------------------------------

if [ "$S3_ENABLED" = "true" ] && [ -n "$S3_ENDPOINT" ]; then
  log "Uploading backup to S3: s3://${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}"

  # Configure MinIO client (mc) if available
  if command -v mc &>/dev/null; then
    mc alias set wpm-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" --api S3v4 2>/dev/null

    # Ensure bucket exists
    mc mb --ignore-existing "wpm-backup/${S3_BUCKET}" 2>/dev/null || true

    # Upload backup
    mc cp "$BACKUP_PATH" "wpm-backup/${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}"
    mc cp "${BACKUP_PATH}.meta" "wpm-backup/${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}.meta"

    log "S3 upload completed (via mc)"

  # Fall back to aws cli
  elif command -v aws &>/dev/null; then
    export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY"
    export AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"

    AWS_ARGS="--endpoint-url $S3_ENDPOINT"

    # Ensure bucket exists
    aws s3 mb "s3://${S3_BUCKET}" $AWS_ARGS 2>/dev/null || true

    # Upload backup
    aws s3 cp "$BACKUP_PATH" "s3://${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}" $AWS_ARGS
    aws s3 cp "${BACKUP_PATH}.meta" "s3://${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}.meta" $AWS_ARGS

    log "S3 upload completed (via aws cli)"

  else
    log_error "S3 upload enabled but neither 'mc' nor 'aws' CLI found. Skipping upload."
  fi
fi

# ---- Retention Policy -------------------------------------------------------

apply_retention() {
  local dir="$1"
  local keep="$2"
  local type_name="$3"

  if [ ! -d "$dir" ]; then
    return
  fi

  # Count existing backups (only .dump files, sorted oldest first)
  local count
  count=$(find "$dir" -maxdepth 1 -name "*.dump" -type f | wc -l)

  if [ "$count" -le "$keep" ]; then
    log "Retention ($type_name): $count/$keep backups - nothing to clean up"
    return
  fi

  local to_delete=$((count - keep))
  log "Retention ($type_name): $count backups found, keeping $keep, deleting $to_delete"

  # Delete oldest backups (and their metadata files)
  find "$dir" -maxdepth 1 -name "*.dump" -type f -printf '%T@ %p\n' \
    | sort -n \
    | head -n "$to_delete" \
    | cut -d' ' -f2- \
    | while IFS= read -r old_backup; do
        log "  Deleting: $(basename "$old_backup")"
        rm -f "$old_backup"
        rm -f "${old_backup}.meta"

        # Also delete from S3 if enabled
        if [ "$S3_ENABLED" = "true" ] && [ -n "$S3_ENDPOINT" ]; then
          local s3_key="${type_name}/$(basename "$old_backup")"
          if command -v mc &>/dev/null; then
            mc rm "wpm-backup/${S3_BUCKET}/${s3_key}" 2>/dev/null || true
            mc rm "wpm-backup/${S3_BUCKET}/${s3_key}.meta" 2>/dev/null || true
          elif command -v aws &>/dev/null; then
            aws s3 rm "s3://${S3_BUCKET}/${s3_key}" --endpoint-url "$S3_ENDPOINT" 2>/dev/null || true
            aws s3 rm "s3://${S3_BUCKET}/${s3_key}.meta" --endpoint-url "$S3_ENDPOINT" 2>/dev/null || true
          fi
        fi
      done
}

log "Applying retention policy..."
apply_retention "${BACKUP_DIR}/daily"   "$RETENTION_DAILY"   "daily"
apply_retention "${BACKUP_DIR}/weekly"  "$RETENTION_WEEKLY"  "weekly"
apply_retention "${BACKUP_DIR}/monthly" "$RETENTION_MONTHLY" "monthly"

# ---- Summary ----------------------------------------------------------------

log "============================================"
log "Backup Summary"
log "============================================"
log "  Type:     $BACKUP_TYPE"
log "  File:     $BACKUP_FILE"
log "  Size:     $BACKUP_SIZE"
log "  Duration: ${DUMP_DURATION}s"
log "  Location: $BACKUP_PATH"

if [ "$S3_ENABLED" = "true" ] && [ -n "$S3_ENDPOINT" ]; then
  log "  S3:       s3://${S3_BUCKET}/${BACKUP_TYPE}/${BACKUP_FILE}"
fi

# Show current backup counts
for btype in daily weekly monthly; do
  dir="${BACKUP_DIR}/${btype}"
  if [ -d "$dir" ]; then
    cnt=$(find "$dir" -maxdepth 1 -name "*.dump" -type f | wc -l)
    log "  ${btype}: ${cnt} backup(s)"
  fi
done

log "============================================"
log "Backup completed successfully!"

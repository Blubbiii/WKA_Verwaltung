#!/bin/bash
# =============================================================================
# WindparkManager — Backup Verification Script
# Restores the latest backup into a temporary database and validates it.
# Usage: ./scripts/verify-backup.sh [backup-dir]
# =============================================================================

set -euo pipefail

BACKUP_DIR="${1:-./backups/daily}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-wpm}"
DB_NAME="wpm_backup_verify_$(date +%s)"

# Require POSTGRES_PASSWORD explicitly — no insecure fallback
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "ERROR: POSTGRES_PASSWORD environment variable must be set" >&2
  exit 1
fi
export PGPASSWORD="$POSTGRES_PASSWORD"

echo "=== WindparkManager Backup Verification ==="
echo "Backup directory: $BACKUP_DIR"
echo "Test database: $DB_NAME"
echo ""

# Find latest backup file
LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.dump "$BACKUP_DIR"/*.sql.gz "$BACKUP_DIR"/*.sql 2>/dev/null | head -1)
if [ -z "$LATEST_BACKUP" ]; then
  echo "ERROR: No backup files found in $BACKUP_DIR"
  exit 1
fi
echo "Latest backup: $LATEST_BACKUP"
echo "Size: $(du -h "$LATEST_BACKUP" | cut -f1)"
echo ""

# Create temporary database
echo "Creating temporary database..."
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || {
  echo "ERROR: Failed to create temporary database"
  exit 1
}

# Restore backup
echo "Restoring backup..."
RESTORE_OK=true
if [[ "$LATEST_BACKUP" == *.dump ]]; then
  pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner "$LATEST_BACKUP" 2>/dev/null || RESTORE_OK=false
elif [[ "$LATEST_BACKUP" == *.sql.gz ]]; then
  gunzip -c "$LATEST_BACKUP" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q 2>/dev/null || RESTORE_OK=false
else
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q -f "$LATEST_BACKUP" 2>/dev/null || RESTORE_OK=false
fi

if [ "$RESTORE_OK" = false ]; then
  echo "WARNING: Restore had errors (partial restore may have succeeded)"
fi

# Validate data
echo ""
echo "Validating restored data..."
VALID=true

check_table() {
  local table=$1
  local count
  count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM $table;" 2>/dev/null | tr -d ' ')
  if [ -z "$count" ] || [ "$count" = "" ]; then
    echo "  FAIL: Table '$table' not found or empty"
    VALID=false
  else
    echo "  OK: $table — $count rows"
  fi
}

check_table "tenants"
check_table "users"
check_table "parks"
check_table "invoices"
check_table "funds"
check_table "contracts"

# Cleanup
echo ""
echo "Cleaning up temporary database..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || echo "WARNING: Failed to drop test database"

# Result
echo ""
if [ "$VALID" = true ] && [ "$RESTORE_OK" = true ]; then
  echo "=== BACKUP VERIFICATION: PASSED ==="
  exit 0
else
  echo "=== BACKUP VERIFICATION: FAILED ==="
  exit 1
fi

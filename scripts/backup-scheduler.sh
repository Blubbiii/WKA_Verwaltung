#!/bin/sh
# =============================================================================
# WindparkManager - Backup scheduler for the wpm-backup container
#
# Replaces the fixed crontab. Every 5 minutes it
#   1. reads the schedule set in the UI from system_configs (psql),
#   2. decides which backups are due (daily / weekly / monthly),
#   3. runs /scripts/backup-db.sh for them with the configured retention,
#   4. writes status and a heartbeat back, so the UI can tell
#      "last backup", "failed" and "service not running" apart.
#
# Without a reachable database it falls back to the previous fixed plan
# (daily 02:00, weekly on Sunday, monthly on the 1st) — pg_dump needs the
# database anyway, but the decision does not hang on it.
#
# A run that was missed (container down at 02:00) is caught up the next time
# the loop sees the time has passed and no run of that type happened today.
#
# POSIX sh on purpose: runs on Alpine (busybox) and Debian images alike, no
# cron package needed.
#
# Test mode (no database, no backup):
#   BS_JETZT=0215 BS_HEUTE=2026-09-27 BS_WOCHENTAG=7 BS_TAG=27 \
#   BS_AKTIV=true BS_RHYTHMUS=daily BS_UHRZEIT=02:00 BS_MARKER_DIR=/tmp/x \
#   sh backup-scheduler.sh --entscheide
#   → prints the due types, one per line
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVALL_SEKUNDEN="${BACKUP_SCHEDULER_INTERVAL:-300}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SCHEDULER] $*"
}

# ---- Decision (pure; used by the loop and by --entscheide) ------------------

# $1 = HH:MM → HHMM as a plain number (leading zeros removed)
als_zahl() {
  echo "$1" | tr -d ':' | sed 's/^0*//; s/^$/0/'
}

# Is type $1 active in rhythm $BS_RHYTHMUS on this day?
typ_an_diesem_tag() {
  case "$1" in
    daily)   [ "$BS_RHYTHMUS" = "daily" ] ;;
    weekly)  [ "$BS_RHYTHMUS" != "monthly" ] && [ "$BS_WOCHENTAG" = "7" ] ;;
    monthly) [ "$BS_TAG" = "01" ] || [ "$BS_TAG" = "1" ] ;;
    *) return 1 ;;
  esac
}

faellige_typen() {
  [ "$BS_AKTIV" = "true" ] || return 0
  jetzt=$(als_zahl "$BS_JETZT")
  soll=$(als_zahl "$BS_UHRZEIT")
  [ "$jetzt" -ge "$soll" ] || return 0
  for typ in daily weekly monthly; do
    typ_an_diesem_tag "$typ" || continue
    # One attempt per type and day — a failed run is not retried every
    # 5 minutes; it shows up as "failed" in the UI instead.
    [ "$(cat "$BS_MARKER_DIR/.last_$typ" 2>/dev/null)" = "$BS_HEUTE" ] && continue
    echo "$typ"
  done
}

if [ "${1:-}" = "--entscheide" ]; then
  faellige_typen
  exit 0
fi

# ---- Database access --------------------------------------------------------

psql_q() {
  psql -h "${PGHOST:-postgres}" -p "${PGPORT:-5432}" -U "${PGUSER:-wpm}" -d "${PGDATABASE:-windparkmanager}" \
    -Atq -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null
}

# Global config value; single quotes in values are doubled for SQL.
schreibe() {
  wert=$(printf '%s' "$2" | sed "s/'/''/g")
  psql_q "update system_configs set value='$wert', \"updatedAt\"=now() where key='$1' and \"tenantId\" is null;
          insert into system_configs (id, key, value, category, encrypted, \"createdAt\", \"updatedAt\")
          select gen_random_uuid(), '$1', '$wert', 'backup', false, now(), now()
          where not exists (select 1 from system_configs where key='$1' and \"tenantId\" is null);" >/dev/null
}

lade_zeitplan() {
  # Fallback = the previous fixed plan and the container's env retention.
  BS_AKTIV=true
  BS_RHYTHMUS=daily
  BS_UHRZEIT=02:00
  R_DAILY="${BACKUP_RETENTION_DAILY:-7}"
  R_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
  R_MONTHLY="${BACKUP_RETENTION_MONTHLY:-3}"
  S3="${BACKUP_S3_ENABLED:-false}"
  DB_OK=false

  zeilen=$(psql_q "select key || '=' || value from system_configs where \"tenantId\" is null and key like 'backup.schedule.%'") || return 0
  DB_OK=true
  for zeile in $zeilen; do
    wert="${zeile#*=}"
    case "${zeile%%=*}" in
      backup.schedule.enabled)          BS_AKTIV="$wert" ;;
      backup.schedule.interval)         case "$wert" in daily|weekly|monthly) BS_RHYTHMUS="$wert" ;; esac ;;
      backup.schedule.time)             case "$wert" in [0-2][0-9]:[0-5][0-9]) BS_UHRZEIT="$wert" ;; esac ;;
      backup.schedule.retentionDaily)   R_DAILY="$wert" ;;
      backup.schedule.retentionWeekly)  R_WEEKLY="$wert" ;;
      backup.schedule.retentionMonthly) R_MONTHLY="$wert" ;;
      backup.schedule.s3)               S3="$wert" ;;
    esac
  done
}

lade_uhrzeit() {
  # Berlin time from Postgres — the container itself usually runs in UTC and
  # busybox date knows no zone names.
  jetzt=$(psql_q "select to_char(now() at time zone 'Europe/Berlin', 'HH24:MI YYYY-MM-DD ID DD')")
  [ -n "$jetzt" ] || jetzt=$(date '+%H:%M %Y-%m-%d %u %d')
  set -- $jetzt
  BS_JETZT="$1"; BS_HEUTE="$2"; BS_WOCHENTAG="$3"; BS_TAG="$4"
}

# ---- Main loop --------------------------------------------------------------

BS_MARKER_DIR="$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
log "Gestartet — prüft alle ${INTERVALL_SEKUNDEN}s den Zeitplan aus der Datenbank"

while true; do
  lade_zeitplan
  lade_uhrzeit
  [ "$DB_OK" = "true" ] || log "Datenbank nicht erreichbar — fester Plan (täglich 02:00)"

  for typ in $(faellige_typen); do
    echo "$BS_HEUTE" > "$BS_MARKER_DIR/.last_$typ"
    log "Starte $typ-Backup (Rhythmus $BS_RHYTHMUS, $BS_UHRZEIT)"
    ausgabe=$(BACKUP_RETENTION_DAILY="$R_DAILY" BACKUP_RETENTION_WEEKLY="$R_WEEKLY" \
      BACKUP_RETENTION_MONTHLY="$R_MONTHLY" BACKUP_S3_ENABLED="$S3" \
      /scripts/backup-db.sh "$typ" 2>&1)
    code=$?
    echo "$ausgabe" >> /var/log/backup.log 2>/dev/null
    if [ $code -eq 0 ]; then
      datei=$(ls -t "$BACKUP_DIR/$typ"/*.dump 2>/dev/null | head -1)
      groesse=$(stat -c%s "$datei" 2>/dev/null || echo 0)
      schreibe backup.status.lastSuccessAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      schreibe backup.status.lastType "$typ"
      schreibe backup.status.lastSizeBytes "$groesse"
      log "$typ-Backup fertig ($groesse Bytes)"
    else
      schreibe backup.status.lastErrorAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      schreibe backup.status.lastError "$(echo "$ausgabe" | grep -i error | tail -3 | cut -c1-500)"
      log "$typ-Backup FEHLGESCHLAGEN (Code $code)"
    fi
  done

  schreibe backup.status.heartbeatAt "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  sleep "$INTERVALL_SEKUNDEN"
done

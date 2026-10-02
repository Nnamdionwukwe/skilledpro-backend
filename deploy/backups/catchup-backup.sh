#!/usr/bin/env bash
# catchup-backup.sh — runs a backup if the last one is > 12 hours old
# Meant to be run on Mac wake, on login, and every 6 hours via launchd.
set -euo pipefail

BACKUP_ROOT="$HOME/backups/skilledproz-backups"
LOG_FILE="$BACKUP_ROOT/logs/catchup.log"
STAMP_FILE="$BACKUP_ROOT/.last-backup-timestamp"

mkdir -p "$BACKUP_ROOT/logs"

log() {
  echo "[$(date +%F-%H:%M:%S)] $*" >> "$LOG_FILE"
}

# ── Determine when the last backup ran ─────────────────────────────────────
LAST_BACKUP_EPOCH=0

# Prefer the timestamp file (written by backup-all.sh)
if [ -f "$STAMP_FILE" ]; then
  LAST_BACKUP_EPOCH=$(cat "$STAMP_FILE")
else
  # Fallback: check mtime of the latest daily DB file
  LATEST_DB=$(ls -t "$BACKUP_ROOT/database/daily/"*.sql.gz 2>/dev/null | head -1 || echo "")
  if [ -n "$LATEST_DB" ] && [ -f "$LATEST_DB" ]; then
    LAST_BACKUP_EPOCH=$(stat -f %m "$LATEST_DB")
  fi
fi

NOW_EPOCH=$(date +%s)
if [ "$LAST_BACKUP_EPOCH" = "0" ]; then
  AGE_HOURS="never"
else
  AGE_SECONDS=$(( NOW_EPOCH - LAST_BACKUP_EPOCH ))
  AGE_HOURS=$(( AGE_SECONDS / 3600 ))
fi

log "Catch-up check: last backup was ${AGE_HOURS} hours ago"

# ── Run a backup if stale (> 12 hours) ─────────────────────────────────────
THRESHOLD_HOURS=12

if [ "$LAST_BACKUP_EPOCH" = "0" ] || [ "$AGE_HOURS" -ge "$THRESHOLD_HOURS" ]; then
  log "→ Stale — running backup-all.sh"

  # Run the main backup
  if "$BACKUP_ROOT/scripts/backup-all.sh" >> "$LOG_FILE" 2>&1; then
    log "✅ Catch-up backup completed"
  else
    log "❌ Catch-up backup failed"
  fi
else
  log "✅ Fresh (${AGE_HOURS}h < ${THRESHOLD_HOURS}h) — skipping"
fi

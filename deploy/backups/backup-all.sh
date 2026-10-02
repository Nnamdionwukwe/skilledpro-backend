#!/usr/bin/env bash
# backup-all.sh — backs up code, DB, .env, and uploads from the SkilledProz server
# Runs daily on Mac via launchd. No external services needed.
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
SERVER="root@174.138.44.155"
REMOTE_ROOT="/var/www/skilledpro-backend"
LOCAL_ROOT="/Users/onwukwennamdi/Desktop/skilledpro-backend"
BACKUP_ROOT="$HOME/backups/skilledproz-backups"
LOG_FILE="$BACKUP_ROOT/logs/backup.log"

DATE_SHORT=$(date +%F)
DATE_LONG=$(date +%F-%H%M%S)
DOW=$(date +%u)     # 1=Mon, 7=Sun
DOM=$(date +%d)     # 01-31

mkdir -p "$BACKUP_ROOT"/{code/{daily,weekly,monthly},database/{daily,weekly,monthly,on-demand},env,logs}

log() {
  echo "[$(date +%F-%H:%M:%S)] $*" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════"
log "Starting backup: $DATE_LONG"
log "═══════════════════════════════════════════"

# ── Step 1: SSH check ──────────────────────────────────────────────────────
if ! ssh -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" "echo OK" >/dev/null 2>&1; then
  log "❌ Server unreachable. Aborting."
  exit 1
fi
log "✅ Server reachable"

# ── Step 2: Database dump (full: schema + data) ────────────────────────────
log "→ Dumping database..."

DB_FILE="$BACKUP_ROOT/database/daily/skilledproz-$DATE_SHORT.sql.gz"

ssh "$SERVER" "sudo -u postgres pg_dump --clean --if-exists --no-owner --no-privileges skilledproz | gzip -9" > "$DB_FILE"

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
log "✅ Database dumped ($DB_SIZE): $DB_FILE"

# ── Step 3: .env backup ────────────────────────────────────────────────────
log "→ Backing up .env..."
scp -q "$SERVER:$REMOTE_ROOT/.env" "$BACKUP_ROOT/env/.env-$DATE_SHORT"

ENV_COUNT=$(ls "$BACKUP_ROOT/env/" 2>/dev/null | wc -l | tr -d ' ')
log "✅ .env backed up ($ENV_COUNT versions total)"

# ── Step 4: Uploads (if any) ───────────────────────────────────────────────
log "→ Checking for uploads folder..."
UPLOADS_EXIST=$(ssh "$SERVER" "[ -d $REMOTE_ROOT/uploads ] && echo yes || echo no")

if [ "$UPLOADS_EXIST" = "yes" ]; then
  log "→ Syncing uploads folder..."
  rsync -az --delete "$SERVER:$REMOTE_ROOT/uploads/" "$BACKUP_ROOT/uploads/"
  UP_SIZE=$(du -sh "$BACKUP_ROOT/uploads/" | cut -f1)
  log "✅ Uploads synced ($UP_SIZE)"
else
  log "ℹ️  No uploads folder on server (using Cloudinary, likely)"
fi

# ── Step 5: Code snapshot (git archive) ────────────────────────────────────
log "→ Archiving code..."
CODE_FILE="$BACKUP_ROOT/code/daily/code-$DATE_SHORT.tar.gz"

# Pull latest from server and archive
ssh "$SERVER" "cd $REMOTE_ROOT && git archive HEAD --format=tar.gz" > "$CODE_FILE" 2>/dev/null || {
  # Fallback: tar the src/ folder if git archive fails
  log "  (git archive failed, using tar of src/)"
  ssh "$SERVER" "cd $REMOTE_ROOT && tar -czf - --exclude=node_modules --exclude=.git src prisma package.json package-lock.json" > "$CODE_FILE"
}

CODE_SIZE=$(du -h "$CODE_FILE" | cut -f1)
log "✅ Code archived ($CODE_SIZE): $CODE_FILE"

# ── Step 6: Promote to weekly (Sundays) ────────────────────────────────────
if [ "$DOW" = "7" ]; then
  log "→ Sunday: promoting to weekly..."
  cp "$DB_FILE" "$BACKUP_ROOT/database/weekly/skilledproz-$DATE_SHORT.sql.gz"
  cp "$CODE_FILE" "$BACKUP_ROOT/code/weekly/code-$DATE_SHORT.tar.gz"
  log "✅ Weekly backups created"
fi

# ── Step 7: Promote to monthly (1st of month) ──────#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# backup-all.sh — SkilledProz daily backup script
#
# Pulls a full Postgres dump from the Coolify-managed container on Hetzner,
# archives the codebase from the local repo, and applies retention policies.
#
# Runs daily at 3 AM via com.skilledproz.backup.plist.
# On Mac wake, catchup-backup.sh triggers this if the last run is >12h old.
#
# Target: Hetzner 157.90.20.7 (Coolify). Replaces the old DigitalOcean setup.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
SERVER="root@157.90.20.7"
SSH_KEY="$HOME/.ssh/id_ed25519"
PG_CONTAINER="vl4bcqsmw3nohmfwwkitijej"

LOCAL_ROOT="/Users/onwukwennamdi/Desktop/skilledpro-backend"
BACKUP_ROOT="$HOME/backups/skilledproz-backups"
LOG_FILE="$BACKUP_ROOT/logs/backup.log"

DATE_SHORT=$(date +%F)
DATE_LONG=$(date +%F-%H%M%S)
DOW=$(date +%u)     # 1=Mon ... 7=Sun
DOM=$(date +%d)     # 01-31

mkdir -p "$BACKUP_ROOT"/{code/{daily,weekly,monthly},database/{daily,weekly,monthly,on-demand},env,logs}

log() {
  echo "[$(date +%F-%H:%M:%S)] $*" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════"
log "Starting backup: $DATE_LONG"
log "═══════════════════════════════════════════"

# ── Step 1: SSH check ──────────────────────────────────────────────────────
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes "$SERVER" "echo OK" >/dev/null 2>&1; then
  log "❌ Server unreachable. Aborting."
  exit 1
fi
log "✅ Server reachable (Hetzner)"

# ── Step 2: Database dump (Postgres in Coolify container) ─────────────────
log "→ Dumping database..."

DB_FILE="$BACKUP_ROOT/database/daily/skilledproz-$DATE_SHORT.sql.gz"

ssh -i "$SSH_KEY" "$SERVER" \
  "docker exec $PG_CONTAINER pg_dump -U postgres -d postgres --clean --if-exists --no-owner --no-privileges | gzip -9" \
  > "$DB_FILE"

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
log "✅ Database dumped ($DB_SIZE): $DB_FILE"

# ── Step 3: .env backup — SKIPPED (Coolify manages env vars) ──────────────
log "ℹ️  .env backup skipped — Coolify manages env vars in its own store"

# ── Step 4: Uploads — SKIPPED (Cloudinary hosts all media) ────────────────
log "ℹ️  Uploads skipped — files are on Cloudinary"

# ── Step 5: Code archive from the local repo ──────────────────────────────
log "→ Archiving code (from local repo)..."
CODE_FILE="$BACKUP_ROOT/code/daily/code-$DATE_SHORT.tar.gz"

if [ -d "$LOCAL_ROOT" ]; then
  (cd "$LOCAL_ROOT" && tar -czf "$CODE_FILE" \
    --exclude=node_modules --exclude=.git --exclude=dist --exclude=coverage \
    src prisma package.json package-lock.json 2>/dev/null) || {
    log "  ⚠️  src/ archive failed — falling back to whole folder"
    (cd "$LOCAL_ROOT" && tar -czf "$CODE_FILE" \
      --exclude=node_modules --exclude=.git --exclude=dist \
      . 2>/dev/null) || true
  }
else
  log "  ⚠️  Local repo not found at $LOCAL_ROOT — skipping code archive"
fi

if [ -f "$CODE_FILE" ]; then
  CODE_SIZE=$(du -h "$CODE_FILE" | cut -f1)
  log "✅ Code archived ($CODE_SIZE): $CODE_FILE"
else
  log "⚠️  Code archive not created"
fi

# ── Step 6: Promote to weekly (Sundays) ───────────────────────────────────
if [ "$DOW" = "7" ]; then
  log "→ Sunday: promoting to weekly..."
  cp "$DB_FILE" "$BACKUP_ROOT/database/weekly/skilledproz-$DATE_SHORT.sql.gz" 2>/dev/null || true
  if [ -f "$CODE_FILE" ]; then
    cp "$CODE_FILE" "$BACKUP_ROOT/code/weekly/code-$DATE_SHORT.tar.gz" 2>/dev/null || true
  fi
  log "✅ Weekly backups created"
fi

# ── Step 7: Promote to monthly (1st of month) ─────────────────────────────
if [ "$DOM" = "01" ]; then
  log "→ 1st of month: promoting to monthly..."
  cp "$DB_FILE" "$BACKUP_ROOT/database/monthly/skilledproz-$DATE_SHORT.sql.gz" 2>/dev/null || true
  if [ -f "$CODE_FILE" ]; then
    cp "$CODE_FILE" "$BACKUP_ROOT/code/monthly/code-$DATE_SHORT.tar.gz" 2>/dev/null || true
  fi
  log "✅ Monthly backups created"
fi

# ── Step 8: Retention policy ──────────────────────────────────────────────
log "→ Applying retention policy..."

# Daily: 14 days
find "$BACKUP_ROOT/database/daily" -name "*.sql.gz" -mtime +14 -delete 2>/dev/null || true
find "$BACKUP_ROOT/code/daily" -name "*.tar.gz" -mtime +14 -delete 2>/dev/null || true

# Weekly: 8 weeks
find "$BACKUP_ROOT/database/weekly" -name "*.sql.gz" -mtime +56 -delete 2>/dev/null || true
find "$BACKUP_ROOT/code/weekly" -name "*.tar.gz" -mtime +56 -delete 2>/dev/null || true

# Monthly: 12 months
find "$BACKUP_ROOT/database/monthly" -name "*.sql.gz" -mtime +365 -delete 2>/dev/null || true
find "$BACKUP_ROOT/code/monthly" -name "*.tar.gz" -mtime +365 -delete 2>/dev/null || true

# Env: 30 days
find "$BACKUP_ROOT/env" -name ".env-*" -mtime +30 -delete 2>/dev/null || true

log "✅ Retention applied"

# ── Step 9: Summary ───────────────────────────────────────────────────────
DAILY_DB_COUNT=$(find "$BACKUP_ROOT/database/daily" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
WEEKLY_DB_COUNT=$(find "$BACKUP_ROOT/database/weekly" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
MONTHLY_DB_COUNT=$(find "$BACKUP_ROOT/database/monthly" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
TOTAL_SIZE=$(du -sh "$BACKUP_ROOT" | cut -f1)

log ""
log "═══════════════════════════════════════════"
log "  BACKUP COMPLETE"
log "═══════════════════════════════════════════"
log "  Daily DBs:    $DAILY_DB_COUNT (14 days retained)"
log "  Weekly DBs:   $WEEKLY_DB_COUNT (8 weeks retained)"
log "  Monthly DBs:  $MONTHLY_DB_COUNT (12 months retained)"
log "  Total size:   $TOTAL_SIZE"
log "  Location:     $BACKUP_ROOT"
log "═══════════════════════════════════════════"

# ── macOS notification ────────────────────────────────────────────────────
osascript -e "display notification \"Database: $DB_SIZE | Total: $TOTAL_SIZE\" with title \"SkilledProz Backup Complete\" sound name \"Glass\"" 2>/dev/null || true

# ── Write timestamp for catch-up job ──────────────────────────────────────
date +%s > "$BACKUP_ROOT/.last-backup-timestamp" || true────────────────────────
if [ "$DOM" = "01" ]; then
  log "→ 1st of month: promoting to monthly..."
  cp "$DB_FILE" "$BACKUP_ROOT/database/monthly/skilledproz-$DATE_SHORT.sql.gz"
  cp "$CODE_FILE" "$BACKUP_ROOT/code/monthly/code-$DATE_SHORT.tar.gz"
  log "✅ Monthly backups created"
fi

# ── Step 8: Retention policy ───────────────────────────────────────────────
log "→ Applying retention policy..."

# Daily: keep 14 days
find "$BACKUP_ROOT/database/daily" -name "*.sql.gz" -mtime +14 -delete
find "$BACKUP_ROOT/code/daily" -name "*.tar.gz" -mtime +14 -delete

# Weekly: keep 8 weeks
find "$BACKUP_ROOT/database/weekly" -name "*.sql.gz" -mtime +56 -delete
find "$BACKUP_ROOT/code/weekly" -name "*.tar.gz" -mtime +56 -delete

# Monthly: keep 12 months
find "$BACKUP_ROOT/database/monthly" -name "*.sql.gz" -mtime +365 -delete
find "$BACKUP_ROOT/code/monthly" -name "*.tar.gz" -mtime +365 -delete

# Env: keep 30 days
find "$BACKUP_ROOT/env" -name ".env-*" -mtime +30 -delete

log "✅ Retention applied"

# ── Step 9: Summary ────────────────────────────────────────────────────────
DAILY_DB_COUNT=$(find "$BACKUP_ROOT/database/daily" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
WEEKLY_DB_COUNT=$(find "$BACKUP_ROOT/database/weekly" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
MONTHLY_DB_COUNT=$(find "$BACKUP_ROOT/database/monthly" -name "*.sql.gz" 2>/dev/null | wc -l | tr -d " ")
TOTAL_SIZE=$(du -sh "$BACKUP_ROOT" | cut -f1)

log ""
log "═══════════════════════════════════════════"
log "  BACKUP COMPLETE"
log "═══════════════════════════════════════════"
log "  Daily DBs:    $DAILY_DB_COUNT (14 days retained)"
log "  Weekly DBs:   $WEEKLY_DB_COUNT (8 weeks retained)"
log "  Monthly DBs:  $MONTHLY_DB_COUNT (12 months retained)"
log "  Total size:   $TOTAL_SIZE"
log "  Location:     $BACKUP_ROOT"
log "═══════════════════════════════════════════"
log ""

# ── macOS notification ─────────────────────────────────────────────────────
osascript -e "display notification \"Database: $DB_SIZE | Total: $TOTAL_SIZE\" with title \"SkilledProz Backup Complete\" sound name \"Glass\"" 2>/dev/null || true

# ── Write timestamp for catch-up job ───────────────────────────────────────
date +%s > "$BACKUP_ROOT/.last-backup-timestamp" || true


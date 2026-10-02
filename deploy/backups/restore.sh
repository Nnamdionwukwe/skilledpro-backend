#!/usr/bin/env bash
# restore.sh — restores SkilledProz to a fresh server from Mac backups
set -euo pipefail

BACKUP_ROOT="$HOME/backups/skilledproz-backups"
TARGET_SERVER="${1:-}"

if [ -z "$TARGET_SERVER" ]; then
  echo "Usage: ./restore.sh user@new-server-ip"
  exit 1
fi

# Find latest backup
LATEST_DB=$(ls -t "$BACKUP_ROOT/database/daily/"*.sql.gz | head -1)
LATEST_CODE=$(ls -t "$BACKUP_ROOT/code/daily/"*.tar.gz | head -1)
LATEST_ENV=$(ls -t "$BACKUP_ROOT/env/".env-* | head -1)

if [ -z "$LATEST_DB" ] || [ -z "$LATEST_ENV" ]; then
  echo "❌ Missing backups. Run backup-all.sh first."
  exit 1
fi

echo "═══════════════════════════════════════════"
echo "  RESTORE TO: $TARGET_SERVER"
echo "═══════════════════════════════════════════"
echo "  Code:  $LATEST_CODE"
echo "  DB:    $LATEST_DB"
echo "  Env:   $LATEST_ENV"
echo ""
read -p "Continue? (yes/no): " confirm
[ "$confirm" != "yes" ] && echo "Aborted." && exit 1

# 1. Copy files to server
echo "→ Copying backups to server..."
scp "$LATEST_DB" "$TARGET_SERVER:/tmp/skilledproz-db.sql.gz"
scp "$LATEST_CODE" "$TARGET_SERVER:/tmp/skilledproz-code.tar.gz"
scp "$LATEST_ENV" "$TARGET_SERVER:/tmp/skilledproz.env"

# 2. Extract code
echo "→ Extracting code..."
ssh "$TARGET_SERVER" "mkdir -p /var/www/skilledpro-backend && tar -xzf /tmp/skilledproz-code.tar.gz -C /var/www/skilledpro-backend"

# 3. Restore .env
echo "→ Restoring .env..."
ssh "$TARGET_SERVER" "cp /tmp/skilledproz.env /var/www/skilledpro-backend/.env"

# 4. Create DB
echo "→ Creating database..."
ssh "$TARGET_SERVER" "sudo -u postgres dropdb --if-exists skilledproz && sudo -u postgres createdb -O prisma skilledproz"

# 5. Restore data
echo "→ Restoring data..."
ssh "$TARGET_SERVER" "gunzip -c /tmp/skilledproz-db.sql.gz | sudo -u postgres psql skilledproz"

# 6. Install deps
echo "→ Installing dependencies..."
ssh "$TARGET_SERVER" "cd /var/www/skilledpro-backend && npm install"

# 7. Start app
echo "→ Starting app..."
ssh "$TARGET_SERVER" "cd /var/www/skilledpro-backend && pm2 start npm --name skilledproz-api -- start && pm2 save"

echo ""
echo "✅ RESTORE COMPLETE"
echo ""
echo "Next steps:"
echo "  1. Setup Nginx + SSL (certbot --nginx -d api.skilledproz.com)"
echo "  2. Update DNS if IP changed"

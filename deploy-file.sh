#!/usr/bin/env bash
set -euo pipefail
SERVER="root@174.138.44.155"
REMOTE_ROOT="/var/www/skilledpro-backend"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"
PM2_APP="skilledproz-api"

[ $# -lt 1 ] && { echo "Usage: ./deploy-file.sh <file> [more...]"; exit 1; }

echo "→ Backing up on server..."
ssh "$SERVER" "cd $REMOTE_ROOT && mkdir -p ~/backups && tar -czf ~/backups/src-\$(date +%F-%H%M%S).tar.gz src"

echo "→ Uploading..."
for f in "$@"; do
  [ -f "$LOCAL_ROOT/$f" ] || { echo "✗ Missing locally: $f"; exit 1; }
  echo "  → $f"
  scp "$LOCAL_ROOT/$f" "$SERVER:$REMOTE_ROOT/$f"
done

echo "→ Restarting PM2..."
ssh "$SERVER" "pm2 restart $PM2_APP && sleep 2"

echo "→ Recent logs:"
ssh "$SERVER" "pm2 logs $PM2_APP --lines 30 --nostream"

echo "✅ Done."

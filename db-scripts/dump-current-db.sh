#!/usr/bin/env bash
# Dumps the live skilledproz database (schema + data) to a timestamped SQL file
set -e

SERVER="root@174.138.44.155"
DB_NAME="skilledproz"
DB_USER="postgres"
OUT_DIR="$(cd "$(dirname "$0")" && pwd)/dumps"
TIMESTAMP=$(date +%F-%H%M%S)
OUT_FILE="$OUT_DIR/skilledproz-full-$TIMESTAMP.sql.gz"

mkdir -p "$OUT_DIR"

echo "→ Dumping $DB_NAME from $SERVER..."
echo "→ Output: $OUT_FILE"

ssh "$SERVER" "sudo -u $DB_USER pg_dump --clean --if-exists --no-owner --no-privileges $DB_NAME | gzip -9" > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo ""
echo "✅ Dump complete: $OUT_FILE ($SIZE)"
echo ""
echo "Recent dumps:"
ls -lht "$OUT_DIR" | head -6

cat > /Users/onwukwennamdi/Desktop/skilledpro-backend/diff-server.sh << 'DIFF_EOF'
#!/usr/bin/env bash
# diff-server.sh — compare local src/ against server src/
set -e

SERVER="root@174.138.44.155"
REMOTE="/var/www/skilledpro-backend"
LOCAL="$(cd "$(dirname "$0")" && pwd)"

echo "→ Fetching file list from server..."
ssh "$SERVER" "cd $REMOTE && find src prisma -type f \( -name '*.js' -o -name '*.prisma' -o -name '*.json' \) 2>/dev/null | sort" > /tmp/server-files.txt

echo "→ Generating local file list..."
cd "$LOCAL"
find src prisma -type f \( -name '*.js' -o -name '*.prisma' -o -name '*.json' \) 2>/dev/null | sort > /tmp/local-files.txt

echo ""
echo "── Files ONLY on server (missing locally) ────────────────────────"
comm -23 /tmp/server-files.txt /tmp/local-files.txt

echo ""
echo "── Files ONLY locally (not on server) ────────────────────────────"
comm -13 /tmp/server-files.txt /tmp/local-files.txt

echo ""
echo "── Files that DIFFER (both exist, content different) ─────────────"
while read -r f; do
  if ! ssh "$SERVER" "test -f $REMOTE/$f" 2>/dev/null; then continue; fi
  LOCAL_HASH=$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)
  SERVER_HASH=$(ssh "$SERVER" "md5sum $REMOTE/$f | cut -d' ' -f1" 2>/dev/null | tr -d ' ')
  if [ "$LOCAL_HASH" != "$SERVER_HASH" ]; then
    echo "  ✗ $f"
  fi
done < /tmp/local-files.txt

echo ""
echo "── Same files (identical content) ────────────────────────────────"
count_same=0
while read -r f; do
  if ! ssh "$SERVER" "test -f $REMOTE/$f" 2>/dev/null; then continue; fi
  LOCAL_HASH=$(md5 -q "$f" 2>/dev/null || md5sum "$f" | cut -d' ' -f1)
  SERVER_HASH=$(ssh "$SERVER" "md5sum $REMOTE/$f | cut -d' ' -f1" 2>/dev/null | tr -d ' ')
  if [ "$LOCAL_HASH" == "$SERVER_HASH" ]; then
    count_same=$((count_same + 1))
  fi
done < /tmp/local-files.txt
echo "  ✅ $count_same files are identical"

echo ""
echo "Done."
DIFF_EOF

chmod +x /Users/onwukwennamdi/Desktop/skilledpro-backend/diff-server.sh
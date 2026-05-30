#!/bin/bash
# cleanup-and-env.sh
# ─────────────────────────────────────────────────────────────────────────────
# 1. Removes all .bak files from src/controllers/
# 2. Prints missing .env vars to add
# ─────────────────────────────────────────────────────────────────────────────

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo " SkilledProz — Cleanup & Env Check"
echo "────────────────────────────────────────────────────────────────────────"

# ── 1. Remove .bak files ──────────────────────────────────────────────────────
echo ""
echo "[1/2] Removing .bak backup files from src/…"
BAK_COUNT=0
while IFS= read -r -d '' f; do
  echo "  removed: $f"
  rm "$f"
  ((BAK_COUNT++))
done < <(find src -name "*.bak" -print0 2>/dev/null)

if [ "$BAK_COUNT" -eq 0 ]; then
  echo "  ✅  No .bak files found."
else
  echo "  ✅  Removed $BAK_COUNT .bak file(s)."
fi

# ── 2. Check .env for missing vars ────────────────────────────────────────────
echo ""
echo "[2/2] Checking .env for missing variables…"

MISSING=()
check_env() {
  local key="$1"
  if ! grep -q "^${key}=" .env 2>/dev/null; then
    MISSING+=("$key")
  fi
}

check_env "APP_BASE_URL"
check_env "FACEBOOK_URL"
check_env "INSTAGRAM_URL"
check_env "TIKTOK_URL"

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "  ✅  All expected .env vars are present."
else
  echo "  ⚠️  Missing variables. Add these to your .env:"
  echo ""
  for key in "${MISSING[@]}"; do
    case "$key" in
      APP_BASE_URL)   echo "  ${key}=https://skilledproz-backend.up.railway.app" ;;
      FACEBOOK_URL)   echo "  ${key}=https://facebook.com/skilledproz" ;;
      INSTAGRAM_URL)  echo "  ${key}=https://instagram.com/skilledproz" ;;
      TIKTOK_URL)     echo "  ${key}=https://tiktok.com/@skilledproz" ;;
    esac
  done
fi

echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo " Done."
echo "────────────────────────────────────────────────────────────────────────"
echo ""
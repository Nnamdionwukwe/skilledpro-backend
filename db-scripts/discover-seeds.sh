#!/usr/bin/env bash
# Discovers all seed-related files and checks what's actually in the DB
set -e
cd "$(dirname "$0")/.."

OUT="seed-audit-$(date +%F-%H%M).txt"

{
  echo "════════════════════════════════════════════════════════════════════"
  echo "  SkilledProz — Seed Discovery Audit"
  echo "  Generated: $(date)"
  echo "════════════════════════════════════════════════════════════════════"
  echo ""

  # ── 1. Root-level seed files ──────────────────────────────────────
  echo "── 1. ROOT-LEVEL SEED FILES ──────────────────────────────────────"
  ls -la seed*.js 2>/dev/null || echo "  (none)"
  echo ""

  # ── 2. Any file with "seed" in the name (whole project) ────────────
  echo "── 2. ANY FILE WITH 'seed' IN NAME ───────────────────────────────"
  find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.cjs" -o -name "*.mjs" -o -name "*.json" -o -name "*.sql" \) \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -iname "*seed*" 2>/dev/null | sort
  echo ""

  # ── 3. Any file with "categor" in the name ─────────────────────────
  echo "── 3. ANY FILE WITH 'categor' IN NAME ────────────────────────────"
  find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.cjs" -o -name "*.mjs" \) \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" \
    -iname "*categor*" 2>/dev/null | sort
  echo ""

  # ── 4. Files that call prisma.category.create / createMany ────────
  echo "── 4. FILES THAT INSERT INTO 'Category' TABLE ────────────────────"
  grep -rl "prisma\.category\.create\|prisma\.category\.upsert\|prisma\.category\.createMany" \
    --include="*.js" --include="*.mjs" --include="*.cjs" \
    --exclude-dir=node_modules --exclude-dir=.git \
    . 2>/dev/null | sort
  echo ""

  # ── 5. Files that insert into any table (bulk seed candidates) ─────
  echo "── 5. FILES WITH BULK INSERTS (createMany) ───────────────────────"
  grep -rl "createMany\|upsert\|\.create(" \
    --include="*.js" --include="*.mjs" --include="*.cjs" \
    --exclude-dir=node_modules --exclude-dir=.git \
    ./scripts ./seed*.js ./seed_categories*.js ./seed_*.js 2>/dev/null | sort
  echo ""

  # ── 6. Root-level utility files (potential cleanup) ────────────────
  echo "── 6. ROOT-LEVEL UTILITY/CLEANUP FILES ───────────────────────────"
  ls -la *.js *.sh *.txt *.md 2>/dev/null | grep -vE "package|^d" || echo "  (none)"
  echo ""

  # ── 7. Files that reference 'categories' via import ────────────────
  echo "── 7. FILES IMPORTING FROM categories.js ─────────────────────────"
  grep -rn "from.*categories" --include="*.js" --exclude-dir=node_modules . 2>/dev/null | sort
  echo ""

  # ── 8. The ./scripts folder contents ───────────────────────────────
  echo "── 8. ./scripts/ FOLDER CONTENTS ─────────────────────────────────"
  find ./scripts -type f 2>/dev/null | sort || echo "  (no ./scripts folder)"
  echo ""

  # ── 9. Files that reference 'seed' in package.json ─────────────────
  echo "── 9. SEED SCRIPTS IN package.json ───────────────────────────────"
  grep -A 20 '"scripts"' package.json 2>/dev/null | grep -iE "seed|categor" || echo "  (no seed scripts in package.json)"
  echo ""

} > "$OUT"

echo "OK wrote $OUT"
cat "$OUT"

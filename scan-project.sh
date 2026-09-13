#!/usr/bin/env bash
cd "$(dirname "$0")"
OUT="project-inventory-$(date +%F-%H%M).txt"

{
  echo "════════════════════════════════════════════════════════════════════"
  echo " SkilledProz Backend Inventory"
  echo " Generated: $(date)"
  echo "════════════════════════════════════════════════════════════════════"
  echo ""
  echo "── CONTROLLERS ────────────────────────────────────────────────────"
  find src/controllers -type f -name "*.js" | sort | while read -r f; do
    printf "  %-60s %5s lines\n" "$f" "$(wc -l < "$f")"
  done
  echo ""
  echo "── ROUTES ─────────────────────────────────────────────────────────"
  find src/routes -type f -name "*.js" | sort | while read -r f; do
    printf "  %-60s %5s lines\n" "$f" "$(wc -l < "$f")"
  done
  echo ""
  echo "── SERVICES ───────────────────────────────────────────────────────"
  find src/services -type f -name "*.js" | sort
  echo ""
  echo "── MIDDLEWARE ─────────────────────────────────────────────────────"
  find src/middleware -type f -name "*.js" | sort
  echo ""
  echo "── UTILS ──────────────────────────────────────────────────────────"
  find src/utils -type f -name "*.js" | sort
  echo ""
  echo "── CONFIG ─────────────────────────────────────────────────────────"
  find src/config -type f -name "*.js" | sort
  echo ""
  echo "── PRISMA MODELS ─────────────────────────────────────────────────"
  grep -E "^model " prisma/schema.prisma | awk '{print "  " $2}'
  echo ""
  echo "── PRISMA ENUMS ──────────────────────────────────────────────────"
  grep -E "^enum " prisma/schema.prisma | awk '{print "  " $2}'
  echo ""
  echo "── app.js MOUNTS ──────────────────────────────────────────────────"
  grep -nE "app\.use\(|app\.get\(" src/app.js
  echo ""
  echo "── COUNTS ─────────────────────────────────────────────────────────"
  echo "  Controllers: $(find src/controllers -name '*.js' | wc -l | tr -d ' ')"
  echo "  Routes:      $(find src/routes -name '*.js' | wc -l | tr -d ' ')"
  echo "  Services:    $(find src/services -name '*.js' | wc -l | tr -d ' ')"
  echo "  Models:      $(grep -cE '^model ' prisma/schema.prisma)"
  echo "  Enums:       $(grep -cE '^enum ' prisma/schema.prisma)"
  echo ""
} > "$OUT"

echo "DONE: $OUT"

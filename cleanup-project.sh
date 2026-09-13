#!/usr/bin/env bash
# cleanup-project.sh — removes obsolete files with backup safety net
# Category seed files are PRESERVED — they are the source of truth.
set -e
cd "$(dirname "$0")"

DRY_RUN=1
if [ "$1" = "--apply" ]; then
  DRY_RUN=0
fi

TS=$(date +%F-%H%M%S)
BACKUP_DIR="$HOME/skilledproz-cleanup-backup-$TS"

if [ "$DRY_RUN" = "1" ]; then
  echo "🔍 DRY RUN — no files will be deleted"
  echo "   Run with --apply to actually delete"
  echo ""
fi

# ── Backup first ────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = "0" ]; then
  mkdir -p "$BACKUP_DIR"
  echo "📦 Backing up to $BACKUP_DIR"
  cp -R ./scripts "$BACKUP_DIR/scripts" 2>/dev/null || true
  cp *.txt 2>/dev/null "$BACKUP_DIR/" || true
  echo "✅ Backup complete"
  echo ""
fi

# ── Old audit reports ───────────────────────────────────────────────────────
REPORT_DELETE=(
  "audit-full.txt"
  "audit-report.txt"
  "full-audit-report.txt"
  "SkilledProz Backend — Professional Audit Report"
)

# ── Scripts folder — pattern-based deletes ──────────────────────────────────
SCRIPTS_PATTERNS=(
  "add-*.js"
  "migrate-*.js"
  "migrate_*.js"
  "fix-*.js"
  "force-*.js"
  "create-*.js"
  "createTest*.js"
  "check-*.js"
  "diagnose-*.js"
  "seedPending*.js"
  "seedTest*.js"
  "seed_updates.js"
  "viewExternalJobs.js"
  "merge_duplicate_*.js"
  "seed-external-jobs.js"
  "seedExternalJobs.js"
  "seedExternalJobsWithMethods.js"
  "seedPlatformJobs.js"
)

echo "════════════════════════════════════════════════════════════════"
echo "  FILES TO DELETE"
echo "════════════════════════════════════════════════════════════════"
echo ""

TOTAL=0

echo "── Old audit reports ────────────────────────────────────────"
for f in "${REPORT_DELETE[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✗ $f"
    if [ "$DRY_RUN" = "0" ]; then rm -f "$f"; fi
    TOTAL=$((TOTAL + 1))
  fi
done
echo ""

echo "── Scripts (obsolete migrations/tests) ─────────────────────"
for pattern in "${SCRIPTS_PATTERNS[@]}"; do
  while IFS= read -r file; do
    if [ -n "$file" ]; then
      echo "  ✗ $file"
      if [ "$DRY_RUN" = "0" ]; then rm -f "$file"; fi
      TOTAL=$((TOTAL + 1))
    fi
  done < <(find ./scripts -maxdepth 1 -type f -name "$pattern" 2>/dev/null)
done
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  PRESERVED — Category seed files"
echo "════════════════════════════════════════════════════════════════"
echo ""
for f in categories.js seed_categories_global.js categories-government-white-collar.cjs seed_global.js seed.js categories-master.json seed-categories.mjs merge-categories.py; do
  if [ -f "$f" ]; then
    SIZE=$(du -h "$f" | cut -f1)
    echo "  ✅ $f  ($SIZE)"
  fi
done
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Total files affected: $TOTAL"
echo ""

if [ "$DRY_RUN" = "1" ]; then
  echo "  🔍 DRY RUN — nothing deleted"
  echo "  Run with --apply to actually delete"
else
  echo "  ✅ Deleted $TOTAL files"
  echo "  �� Backup at: $BACKUP_DIR"
fi
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  FILES REMAINING IN ./scripts/ AFTER CLEANUP"
echo "════════════════════════════════════════════════════════════════"
ls -la ./scripts/ 2>/dev/null | tail -n +4

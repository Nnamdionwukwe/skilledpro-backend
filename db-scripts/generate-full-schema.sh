#!/usr/bin/env bash
# ============================================================
# db-scripts/generate-full-schema.sh  (idempotency fix)
# ============================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OUT_IDEMPOTENT="db-scripts/_full-schema.sql"
OUT_PRISMA="db-scripts/_prisma-style-schema.sql"
GIT_HASH="$(git rev-parse --short HEAD 2>/dev/null || echo 'uncommitted')"
GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

FILES=(
  "db-scripts/00-init.sql"
  "db-scripts/01-enums.sql"
  "db-scripts/controllers/02-auth.sql"
  "db-scripts/controllers/02-user.sql"
  "db-scripts/controllers/13-category.sql"
  "db-scripts/controllers/03-worker.sql"
  "db-scripts/controllers/04-hirer.sql"
  "db-scripts/controllers/05-booking.sql"
  "db-scripts/controllers/06-payment.sql"
  "db-scripts/controllers/07-refund.sql"
  "db-scripts/controllers/08-hirerWallet.sql"
  "db-scripts/controllers/09-adminLog.sql"
  "db-scripts/controllers/10-job.sql"
  "db-scripts/controllers/11-dispute.sql"
  "db-scripts/controllers/12-workerDebt.sql"
  "db-scripts/controllers/14-campaign.sql"
  "db-scripts/controllers/18-feedback.sql"
  "db-scripts/controllers/23-notification.sql"
  "db-scripts/controllers/24-post.sql"
  "db-scripts/controllers/26-referral.sql"
  "db-scripts/controllers/30-subscription.sql"
  "db-scripts/controllers/31-survey.sql"
  "db-scripts/controllers/34-waitlist.sql"
  "db-scripts/99-final-fks.sql"
)

for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || { echo "❌ Missing: $f" >&2; exit 1; }
done

# ── IDEMPOTENT version ──────────────────────────────────────────────────────
# Concatenate + rewrite each ALTER TABLE ... ADD CONSTRAINT pair so that a
# matching DROP CONSTRAINT IF EXISTS precedes it. That makes the file safe
# to run on a DB that already has the constraint.
{
  echo "-- ============================================================"
  echo "-- SkilledProz — Full Schema (idempotent)"
  echo "-- Generated: $GENERATED_AT"
  echo "-- Source commit: $GIT_HASH"
  echo "-- DO NOT EDIT — regenerate via db-scripts/generate-full-schema.sh"
  echo "-- Safe to run on empty / partial / fully-built DBs."
  echo "-- ============================================================"
  echo ""

  for f in "${FILES[@]}"; do
    echo ""
    echo "-- ════════════════════════════════════════════════════════════"
    echo "-- $f"
    echo "-- ════════════════════════════════════════════════════════════"
    # Transform: for every
    #   ALTER TABLE "X" ADD CONSTRAINT "Y" ...
    # prepend:
    #   ALTER TABLE "X" DROP CONSTRAINT IF EXISTS "Y";
    # unless a matching DROP line already exists just above it.
    perl -0777 -pe '
      s{
        (?:ALTER\ TABLE\ "(\w+)"\ DROP\ CONSTRAINT\ IF\ EXISTS\ "(\w+)";\s*)?
        ALTER\ TABLE\ "(\w+)"\ ADD\ CONSTRAINT\ "(\w+)"
      }{
        my ($dropT, $dropC, $addT, $addC) = ($1, $2, $3, $4);
        if (defined $dropT) {
          "ALTER TABLE \"$dropT\" DROP CONSTRAINT IF EXISTS \"$dropC\";\n" .
          "ALTER TABLE \"$addT\" ADD CONSTRAINT \"$addC\""
        } else {
          "ALTER TABLE \"$addT\" DROP CONSTRAINT IF EXISTS \"$addC\";\n" .
          "ALTER TABLE \"$addT\" ADD CONSTRAINT \"$addC\""
        }
      }gex;
    ' "$f"
  done
} > "$OUT_IDEMPOTENT"

# ── PRISMA-STYLE version ────────────────────────────────────────────────────
# Same content, but with guards stripped and pairs collapsed into a single
# "AddForeignKey" block. Only reads $OUT_IDEMPOTENT; never writes to it.
{
  echo "-- ============================================================"
  echo "-- SkilledProz — Full Schema (Prisma-style)"
  echo "-- Generated: $GENERATED_AT"
  echo "-- Source commit: $GIT_HASH"
  echo "-- DO NOT EDIT — regenerate via db-scripts/generate-full-schema.sh"
  echo "-- NOT idempotent — will fail if run on an existing DB."
  echo "-- ============================================================"
  echo ""
  sed '1,7d' "$OUT_IDEMPOTENT" | perl -0777 -pe '
    # Unwrap DO $$ ... EXCEPTION WHEN duplicate_object THEN null; END $$;
    s/DO \$\$ BEGIN\s+CREATE TYPE (.+?);\s+EXCEPTION WHEN duplicate_object THEN null;\s+END \$\$;/-- CreateEnum\nCREATE TYPE $1;/gs;
    # Remove IF NOT EXISTS from CREATE statements
    s/CREATE TABLE IF NOT EXISTS/CREATE TABLE/g;
    s/CREATE UNIQUE INDEX IF NOT EXISTS/CREATE UNIQUE INDEX/g;
    s/CREATE INDEX IF NOT EXISTS/CREATE INDEX/g;
    # Collapse DROP + ADD CONSTRAINT pairs into a single AddForeignKey block
    s/ALTER TABLE "(\w+)" DROP CONSTRAINT IF EXISTS "(\w+)";\s*\nALTER TABLE "\w+" ADD CONSTRAINT "\w+"\s+(FOREIGN KEY[^;]+);/-- AddForeignKey\nALTER TABLE "$1" ADD CONSTRAINT "$2" $3;/gs;
  '
} > "$OUT_PRISMA"

echo "✅ Regenerated:"
printf "   %-40s %8s lines  %3s FK guards\n" \
  "$OUT_IDEMPOTENT" "$(wc -l < "$OUT_IDEMPOTENT")" \
  "$(grep -c 'DROP CONSTRAINT IF EXISTS' "$OUT_IDEMPOTENT")"
printf "   %-40s %8s lines\n" \
  "$OUT_PRISMA" "$(wc -l < "$OUT_PRISMA")"
#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

OUT="rebuild-all.sql"

{
  echo "-- ============================================================"
  echo "-- SkilledProz Backend - Full Rebuild Script"
  echo "-- Generated: $(date)"
  echo "-- ============================================================"
  echo ""

  echo "-- STEP 1: Extensions"
  cat 00-init.sql
  echo ""

  echo "-- STEP 2: Enums"
  cat 01-enums.sql
  echo ""

  echo "-- STEP 3: Tables"
  for f in \
    controllers/02-auth.sql \
    controllers/02-user.sql \
    controllers/13-category.sql \
    controllers/03-worker.sql \
    controllers/04-hirer.sql \
    controllers/05-booking.sql \
    controllers/06-payment.sql \
    controllers/07-refund.sql \
    controllers/08-hirerWallet.sql \
    controllers/09-adminLog.sql \
    controllers/10-job.sql \
    controllers/14-campaign.sql \
    controllers/18-feedback.sql \
    controllers/23-notification.sql \
    controllers/24-post.sql \
    controllers/26-referral.sql \
    controllers/30-subscription.sql \
    controllers/31-survey.sql \
    controllers/34-waitlist.sql
  do
    echo "-- $f"
    cat "$f"
    echo ""
  done

  echo "-- STEP 4: Deferred foreign keys"
  cat 99-final-fks.sql
  echo ""
} > "$OUT"

echo "OK wrote $OUT"

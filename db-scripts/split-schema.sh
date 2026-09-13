#!/usr/bin/env bash
# Split _full-schema.sql into per-controller files
# Pure POSIX — works on macOS default bash/awk/sed
set -e
cd "$(dirname "$0")"

FULL="_full-schema.sql"
OUT="controllers"
TMP="/tmp/skilled-split-$$"

if [ ! -f "$FULL" ]; then
  echo "ERROR: $FULL not found in $(pwd)"
  exit 1
fi

rm -rf "$TMP"
mkdir -p "$TMP" "$OUT"

# ── 1. Extract enums → 01-enums.sql ─────────────────────────────────────
{
  echo "-- ============================================================"
  echo "-- SkilledProz - All Enums"
  echo "-- Generated: $(date)"
  echo "-- Depends on: 00-init.sql"
  echo "-- ============================================================"
  echo ""
  awk '
    /^CREATE TYPE / { capture=1 }
    capture { print }
    /^\);$/ && capture { print ""; capture=0 }
  ' "$FULL"
} > "01-enums.sql"

echo "OK 01-enums.sql written"

# ── 2. Split into enum / table / index / fk sections ────────────────────
# Use csplit with regexes
grep -n "^CREATE TABLE\|^CREATE UNIQUE INDEX\|^CREATE INDEX\|^ALTER TABLE .* FOREIGN KEY" "$FULL" > "$TMP/marks.txt"

# ── 3. Extract each CREATE TABLE block (multi-line until lone ");") ─────
# Use awk WITHOUT the third-arg match
awk '
  BEGIN { RS="\n" }
  /^CREATE TABLE / {
    line = $0
    # extract the table name between the first pair of double quotes
    n = split(line, parts, "\"")
    if (n >= 2) {
      table = parts[2]
      out = "'"$TMP"'/table_" table ".sql"
    }
    capture = 1
  }
  capture { print > out }
  /^\);$/ && capture {
    print "" >> out
    close(out)
    capture = 0
  }
' "$FULL"

echo "OK table blocks extracted to $TMP"

# ── 4. Extract indexes and FKs — one-liners ─────────────────────────────
grep '^CREATE UNIQUE INDEX' "$FULL" | while IFS= read -r line; do
  # "CREATE UNIQUE INDEX "Name_key" ON "Table"(..."
  rest="${line#* ON \"}"
  table="${rest%%\"*}"
  echo "$line" >> "$TMP/index_${table}.sql"
done

grep '^CREATE INDEX' "$FULL" | while IFS= read -r line; do
  rest="${line#* ON \"}"
  table="${rest%%\"*}"
  echo "$line" >> "$TMP/index_${table}.sql"
done

grep '^ALTER TABLE "[^"]*" ADD CONSTRAINT' "$FULL" | while IFS= read -r line; do
  rest="${line#ALTER TABLE \"}"
  table="${rest%%\"*}"
  echo "$line" >> "$TMP/fk_${table}.sql"
done

echo "OK index & FK blocks extracted"

# ── 5. Mapping file ─────────────────────────────────────────────────────
cat > "$TMP/mapping.txt" << 'MAP_EOF'
User|02-auth
WorkerProfile|03-worker
HirerProfile|04-hirer
DeviceToken|02-user
SavedWorker|02-user
SavedJob|02-user
Portfolio|03-worker
Certification|03-worker
Availability|03-worker
WorkerCategory|03-worker
Booking|05-booking
Review|05-booking
Conversation|05-booking
ConversationUser|05-booking
Message|05-booking
VideoCall|05-booking
Payment|06-payment
Refund|07-refund
HirerWallet|08-hirerWallet
HirerTransaction|08-hirerWallet
HirerWithdrawal|08-hirerWallet
HirerFundingAttempt|08-hirerWallet
WalletTransaction|08-hirerWallet
Withdrawal|08-hirerWallet
AuditLog|09-adminLog
Report|09-adminLog
AppSettings|09-adminLog
JobPost|10-job
JobCategory|10-job
JobApplication|10-job
ExternalJobClick|10-job
Category|13-category
CampaignReferral|14-campaign
CampaignSubmission|14-campaign
CampaignTransaction|14-campaign
CampaignWithdrawal|14-campaign
Referral|26-referral
Subscription|30-subscription
PromoCode|30-subscription
PromoCodeUsage|30-subscription
FeaturedListing|30-subscription
Post|24-post
PostReaction|24-post
PostComment|24-post
Notification|23-notification
survey_responses|31-survey
waitlist_entries|34-waitlist
waitlist_campaigns|34-waitlist
waitlist_email_logs|34-waitlist
Feedback|18-feedback
MAP_EOF

# ── 6. Create each controller file with header ──────────────────────────
while IFS='|' read -r table filebase; do
  target="$OUT/${filebase}.sql"
  if [ ! -f "$target" ]; then
    {
      echo "-- ============================================================"
      echo "-- Controller: ${filebase#*-}"
      echo "-- Tables grouped from Prisma schema"
      echo "-- Depends on: 00-init.sql, 01-enums.sql"
      echo "-- ============================================================"
      echo ""
    } > "$target"
  fi
done < "$TMP/mapping.txt"

# ── 7. Append table + index + fk blocks to each controller file ────────
while IFS='|' read -r table filebase; do
  target="$OUT/${filebase}.sql"

  if [ -f "$TMP/table_${table}.sql" ]; then
    { echo "-- Table: $table"; cat "$TMP/table_${table}.sql"; echo ""; } >> "$target"
  fi

  if [ -f "$TMP/index_${table}.sql" ]; then
    { echo "-- Indexes: $table"; cat "$TMP/index_${table}.sql"; echo ""; } >> "$target"
  fi

  if [ -f "$TMP/fk_${table}.sql" ]; then
    { echo "-- Foreign keys: $table"; cat "$TMP/fk_${table}.sql"; echo ""; } >> "$target"
  fi
done < "$TMP/mapping.txt"

rm -rf "$TMP"

echo "OK wrote $(ls $OUT/*.sql 2>/dev/null | wc -l | tr -d ' ') controller files"
echo ""
echo "=== $OUT/ contents ==="
ls -la "$OUT/"

#!/usr/bin/env bash
# e2e-dispute-test.sh — Full dispute + refund flow test
# Run on the server. Uses the test booking we identified.

set -e

SERVER_CMD() { ssh root@174.138.44.155 "$@"; }

# ── Test data (from our earlier query) ──────────────────────────────
BOOKING_ID="e520046b-9030-4eb8-ad77-080208636b6c"
PAYMENT_ID="658d13cf-e9f4-4476-b294-32643af374e0"
HIRER_ID="a3ad7c49-3ff2-42b6-afbc-b182350c54c1"
WORKER_ID="d6389516-a87b-4bac-8d12-96d7c9f13a5e"

echo "════════════════════════════════════════════════════════════════"
echo "  END-TO-END DISPUTE + REFUND TEST"
echo "  Booking: $BOOKING_ID"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── 1. Generate test tokens ────────────────────────────────────────
echo "── STEP 1: Generating test tokens ─────────────────────────────"
TOKENS=$(SERVER_CMD "cd /var/www/skilledpro-backend && JWT_SECRET=\$(grep '^JWT_SECRET=' .env | cut -d'=' -f2- | tr -d '\"') && node -e \"
import('jsonwebtoken').then(({default: jwt}) => {
  const hirerToken = jwt.sign({ id: '$HIRER_ID' }, '\$JWT_SECRET', { expiresIn: '1h' });
  const adminToken = jwt.sign({ id: '$(echo PLACEHOLDER_ADMIN_ID)' }, '\$JWT_SECRET', { expiresIn: '1h' });
  console.log(JSON.stringify({ hirerToken, adminToken }));
});
\"")

HIRER_TOKEN=$(echo "$TOKENS" | python3 -c "import sys,json; print(json.load(sys.stdin)['hirerToken'])")
echo "Hirer token generated: ${HIRER_TOKEN:0:40}..."
echo ""

# ── 2. Raise dispute ───────────────────────────────────────────────
echo "── STEP 2: Raising dispute as hirer ──────────────────────────"
DISPUTE_RESP=$(SERVER_CMD "curl -s -X POST http://localhost:5000/api/disputes/raise \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $HIRER_TOKEN' \
  -d '{\"bookingId\":\"$BOOKING_ID\",\"reason\":\"SERVICE_NOT_DELIVERED\",\"description\":\"E2E test dispute\"}'")

echo "$DISPUTE_RESP" | python3 -m json.tool
echo ""

DISPUTE_ID=$(echo "$DISPUTE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['dispute']['id'])")
echo "Dispute ID: $DISPUTE_ID"
echo ""

# ── 3. Verify dispute created ──────────────────────────────────────
echo "── STEP 3: Verifying dispute + booking state ─────────────────"
SERVER_CMD "cd /var/www/skilledpro-backend && node -e \"
import('./src/config/database.js').then(async ({default: prisma}) => {
  const d = await prisma.dispute.findUnique({ where: { id: '$DISPUTE_ID' } });
  const b = await prisma.booking.findUnique({ where: { id: '$BOOKING_ID' }, select: { status: true, disputeReason: true } });
  console.log('Dispute status:', d.status);
  console.log('Dispute raisedByRole:', d.raisedByRole);
  console.log('Dispute previousBookingStatus:', d.previousBookingStatus);
  console.log('Booking status:', b.status);
  console.log('Booking disputeReason:', b.disputeReason);
  await prisma.\\\$disconnect();
});
\""
echo ""

echo "════════════════════════════════════════════════════════════════"
echo "  Pre-resolution state confirmed. Now resolve as REFUND."
echo "  Next step requires an ADMIN token."
echo "════════════════════════════════════════════════════════════════"
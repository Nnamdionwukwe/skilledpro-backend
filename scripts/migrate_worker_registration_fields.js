// scripts/migrate_worker_registration_fields.js
// Uses raw pg — no Prisma import needed, matches your existing working scripts.
// Run with: node scripts/migrate_worker_registration_fields.js

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});

const migrations = [
  // ── WorkerProfile pricing ───────────────────────────────────────────────────
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "dailyRate"       DECIMAL(10,2)`,
    "WorkerProfile.dailyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "weeklyRate"      DECIMAL(10,2)`,
    "WorkerProfile.weeklyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "monthlyRate"     DECIMAL(10,2)`,
    "WorkerProfile.monthlyRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRate"      DECIMAL(10,2)`,
    "WorkerProfile.customRate",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "customRateLabel" TEXT`,
    "WorkerProfile.customRateLabel",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "pricingNote"     TEXT`,
    "WorkerProfile.pricingNote",
  ],
  [
    `ALTER TABLE "WorkerProfile" ADD COLUMN IF NOT EXISTS "profileCurrency" TEXT DEFAULT 'USD'`,
    "WorkerProfile.profileCurrency",
  ],

  // ── Booking: duration ───────────────────────────────────────────────────────
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "estimatedUnit"  TEXT DEFAULT 'hours'`,
    "Booking.estimatedUnit",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "estimatedValue" TEXT`,
    "Booking.estimatedValue",
  ],

  // ── Booking: insurance ──────────────────────────────────────────────────────
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insurancePlan"     TEXT`,
    "Booking.insurancePlan",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insuranceAmount"   DECIMAL(10,2)`,
    "Booking.insuranceAmount",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insuranceCurrency" TEXT`,
    "Booking.insuranceCurrency",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insurancePaidAt"   TIMESTAMPTZ`,
    "Booking.insurancePaidAt",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "insuranceRef"      TEXT`,
    "Booking.insuranceRef",
  ],

  // ── Booking: SOS / emergency ────────────────────────────────────────────────
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT`,
    "Booking.emergencyContact",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosActivatedAt"   TIMESTAMPTZ`,
    "Booking.sosActivatedAt",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLatitude"      DOUBLE PRECISION`,
    "Booking.sosLatitude",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosLongitude"     DOUBLE PRECISION`,
    "Booking.sosLongitude",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "sosResolvedAt"    TIMESTAMPTZ`,
    "Booking.sosResolvedAt",
  ],

  // ── Booking: GPS check-in / check-out ───────────────────────────────────────
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkInLat"  DOUBLE PRECISION`,
    "Booking.checkInLat",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkInLng"  DOUBLE PRECISION`,
    "Booking.checkInLng",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkOutLat" DOUBLE PRECISION`,
    "Booking.checkOutLat",
  ],
  [
    `ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "checkOutLng" DOUBLE PRECISION`,
    "Booking.checkOutLng",
  ],

  // ── User: preferences ───────────────────────────────────────────────────────
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dashboardCurrency" TEXT    DEFAULT 'USD'`,
    "User.dashboardCurrency",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "paymentCurrency"   TEXT    DEFAULT 'USD'`,
    "User.paymentCurrency",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultEstUnit"    TEXT`,
    "User.defaultEstUnit",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultEstValue"   TEXT`,
    "User.defaultEstValue",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gender"            TEXT`,
    "User.gender",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showGender"        BOOLEAN DEFAULT false`,
    "User.showGender",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showEmail"         BOOLEAN DEFAULT false`,
    "User.showEmail",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "theme"             TEXT    DEFAULT 'system'`,
    "User.theme",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifBookings"     BOOLEAN DEFAULT true`,
    "User.notifBookings",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifMessages"     BOOLEAN DEFAULT true`,
    "User.notifMessages",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifPayments"     BOOLEAN DEFAULT true`,
    "User.notifPayments",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifReviews"      BOOLEAN DEFAULT true`,
    "User.notifReviews",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "notifMarketing"    BOOLEAN DEFAULT false`,
    "User.notifMarketing",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "profileVisible"    BOOLEAN DEFAULT true`,
    "User.profileVisible",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showPhone"         BOOLEAN DEFAULT false`,
    "User.showPhone",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "showLocation"      BOOLEAN DEFAULT true`,
    "User.showLocation",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled"  BOOLEAN DEFAULT false`,
    "User.twoFactorEnabled",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "state"             TEXT`,
    "User.state",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address"           TEXT`,
    "User.address",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "latitude"          DOUBLE PRECISION`,
    "User.latitude",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longitude"         DOUBLE PRECISION`,
    "User.longitude",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeen"          TIMESTAMPTZ`,
    "User.lastSeen",
  ],
  [
    `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPhoneVerified"   BOOLEAN DEFAULT false`,
    "User.isPhoneVerified",
  ],

  // ── VideoCall table ──────────────────────────────────────────────────────────
  [
    `CREATE TABLE IF NOT EXISTS "VideoCall" (
    "id"          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "bookingId"   TEXT        NOT NULL UNIQUE,
    "initiatorId" TEXT        NOT NULL,
    "receiverId"  TEXT        NOT NULL,
    "roomId"      TEXT        NOT NULL UNIQUE,
    "status"      TEXT        NOT NULL DEFAULT 'PENDING',
    "startedAt"   TIMESTAMPTZ,
    "endedAt"     TIMESTAMPTZ,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE
  )`,
    "VideoCall (table)",
  ],

  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_bookingId_idx"   ON "VideoCall"("bookingId")`,
    "VideoCall.bookingId_idx",
  ],
  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_initiatorId_idx" ON "VideoCall"("initiatorId")`,
    "VideoCall.initiatorId_idx",
  ],
  [
    `CREATE INDEX IF NOT EXISTS "VideoCall_receiverId_idx"  ON "VideoCall"("receiverId")`,
    "VideoCall.receiverId_idx",
  ],

  // ── Withdrawal table ─────────────────────────────────────────────────────────
  [
    `CREATE TABLE IF NOT EXISTS "Withdrawal" (
    "id"          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "workerId"    TEXT        NOT NULL,
    "amount"      DECIMAL(10,2) NOT NULL,
    "currency"    TEXT        NOT NULL DEFAULT 'NGN',
    "method"      TEXT        NOT NULL,
    "destination" TEXT        NOT NULL,
    "details"     JSONB       NOT NULL DEFAULT '{}',
    "reference"   TEXT        NOT NULL UNIQUE,
    "status"      TEXT        NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ,
    "failureNote" TEXT,
    "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE
  )`,
    "Withdrawal (table)",
  ],

  [
    `CREATE INDEX IF NOT EXISTS "Withdrawal_workerId_idx" ON "Withdrawal"("workerId")`,
    "Withdrawal.workerId_idx",
  ],

  // ── Payment: extra columns ───────────────────────────────────────────────────
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankName"          TEXT`,
    "Payment.bankName",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountName"       TEXT`,
    "Payment.accountName",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "accountNumber"     TEXT`,
    "Payment.accountNumber",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferRef"   TEXT`,
    "Payment.bankTransferRef",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "bankTransferProof" TEXT`,
    "Payment.bankTransferProof",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoNetwork"     TEXT`,
    "Payment.cryptoNetwork",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoTxHash"      TEXT`,
    "Payment.cryptoTxHash",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoWallet"      TEXT`,
    "Payment.cryptoWallet",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoAmount"      DECIMAL(18,8)`,
    "Payment.cryptoAmount",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "cryptoCurrency"    TEXT`,
    "Payment.cryptoCurrency",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "workerCurrency"    TEXT`,
    "Payment.workerCurrency",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "workerPayoutLocal" DECIMAL(10,2)`,
    "Payment.workerPayoutLocal",
  ],
  [
    `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "exchangeRate"      DECIMAL(18,8) DEFAULT 1`,
    "Payment.exchangeRate",
  ],
];

async function run() {
  const client = await pool.connect();
  console.log("✅ Connected to database\n");

  let ok = 0;
  let skip = 0;

  try {
    for (const [sql, label] of migrations) {
      try {
        await client.query(sql);
        console.log(`  ✅ ${label}`);
        ok++;
      } catch (err) {
        // Column already exists or other non-fatal error
        console.log(`  ⚠️  skipped  ${label} — ${err.message.slice(0, 80)}`);
        skip++;
      }
    }
    console.log(`\n🎉 Migration complete — ${ok} applied, ${skip} skipped.\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});

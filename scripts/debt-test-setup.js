// scripts/debt-test-setup.js
// ─────────────────────────────────────────────────────────────────────────────
// DEBT SYSTEM END-TO-END TEST — Step 6a: Setup
//
// Creates:
//   - A COMPLETED booking (hirer ↔ worker)
//   - A RELEASED payment (105 NGN total, 5 fee, 100 worker payout)
//   - A COMPLETED withdrawal (100 NGN) dated AFTER the payment release
//
// This simulates the "worker already cashed out" scenario so that when we
// later resolve a dispute as REFUND, the system must create a WorkerDebt
// instead of trying to decrement earnings the worker no longer holds.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from "../src/config/database.js";

const HIRER_ID  = "a3ad7c49-3ff2-42b6-afbc-b182350c54c1"; // skilledprozmarketplace@gmail.com
const WORKER_ID = "d6389516-a87b-4bac-8d12-96d7c9f13a5e"; // beautifulboldand4@gmail.com

async function main() {
  // ── Sanity check: users exist ────────────────────────────────────────────
  const hirer = await prisma.user.findUnique({
    where: { id: HIRER_ID },
    select: { id: true, email: true, role: true },
  });
  if (hirer === null) {
    console.log("HIRER NOT FOUND:", HIRER_ID);
    process.exit(1);
  }

  const worker = await prisma.user.findUnique({
    where: { id: WORKER_ID },
    select: { id: true, email: true, role: true },
  });
  if (worker === null) {
    console.log("WORKER NOT FOUND:", WORKER_ID);
    process.exit(1);
  }

  console.log("Hirer :", hirer.id, hirer.email, hirer.role);
  console.log("Worker:", worker.id, worker.email, worker.role);

  // ── Category ─────────────────────────────────────────────────────────────
  const category = await prisma.category.findFirst();
  if (category === null) {
    console.log("NO CATEGORY FOUND — cannot create booking");
    process.exit(1);
  }
  console.log("Category:", category.id, category.name);

  // ── Ensure the worker has a WorkerProfile ────────────────────────────────
  let workerProfile = await prisma.workerProfile.findUnique({
    where: { userId: WORKER_ID },
    select: { id: true, debtBalance: true, totalEarnings: true },
  });

  if (workerProfile === null) {
    console.log("WorkerProfile missing — creating a minimal one…");
    workerProfile = await prisma.workerProfile.create({
      data: {
        userId: WORKER_ID,
        title: "Test Worker",
        hourlyRate: 50,
        currency: "NGN",
      },
      select: { id: true, debtBalance: true, totalEarnings: true },
    });
  }
  console.log(
    "WorkerProfile:",
    workerProfile.id,
    "| debtBalance:",
    workerProfile.debtBalance,
    "| totalEarnings:",
    workerProfile.totalEarnings,
  );

  // ── 1. Booking ───────────────────────────────────────────────────────────
  const booking = await prisma.booking.create({
    data: {
      hirerId: HIRER_ID,
      workerId: WORKER_ID,
      categoryId: category.id,
      title: "DEBT TEST — Completed Job",
      description: "End-to-end test for the worker debt system",
      address: "123 Test Street, Lagos",
      scheduledAt: new Date(Date.now() - 30 * 86400000), // 30d ago
      completedAt: new Date(Date.now() - 25 * 86400000), // 25d ago
      agreedRate: 100,
      currency: "NGN",
      status: "COMPLETED",
    },
    select: { id: true, title: true, status: true },
  });
  console.log("Booking created:", booking.id, "|", booking.status);

  // ── 2. Payment — RELEASED ────────────────────────────────────────────────
  const releasedAt = new Date(Date.now() - 25 * 86400000); // 25d ago
  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      userId: HIRER_ID,
      amount: 105,          // 100 + 5% platform fee
      currency: "NGN",
      platformFee: 5,
      workerPayout: 100,
      status: "RELEASED",
      provider: "paystack",
      providerRef: "DEBT-TEST-PAY-" + Date.now(),
      escrowReleasedAt: releasedAt,
    },
    select: { id: true, status: true, amount: true, workerPayout: true },
  });
  console.log(
    "Payment created:",
    payment.id,
    "| status:",
    payment.status,
    "| amount:",
    payment.amount,
    "| workerPayout:",
    payment.workerPayout,
  );

  // ── 3. Withdrawal — COMPLETED (dated after release) ──────────────────────
  // NOTE: `details` is a required Json field on Withdrawal. It takes a plain
  // JS object — Prisma serializes it internally. Passing a JSON.stringify()
  // string would store a string, not an object.
  const withdrawalAt = new Date(Date.now() - 20 * 86400000); // 20d ago (after release)
  const withdrawal = await prisma.withdrawal.create({
    data: {
      workerId: WORKER_ID,
      amount: 100,
      currency: "NGN",
      method: "bank_transfer",
      destination: "0123456789",
      reference: "DEBT-TEST-WD-" + Date.now(),
      status: "COMPLETED",
      completedAt: withdrawalAt,
      details: {
        bankCode: "044",
        accountNumber: "0123456789",
        accountName: "Test Worker",
        test: true,
      },
    },
    select: { id: true, status: true, amount: true, completedAt: true },
  });
  console.log(
    "Withdrawal created:",
    withdrawal.id,
    "| status:",
    withdrawal.status,
    "| amount:",
    withdrawal.amount,
    "| completedAt:",
    withdrawal.completedAt.toISOString(),
  );

  // ── 4. Print IDs for the next step ───────────────────────────────────────
  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  PASTE THESE IDS BACK");
  console.log("════════════════════════════════════════════════════════════");
  console.log("BOOKING_ID="    + booking.id);
  console.log("PAYMENT_ID="    + payment.id);
  console.log("WITHDRAWAL_ID=" + withdrawal.id);
  console.log("HIRER_ID="      + HIRER_ID);
  console.log("WORKER_ID="     + WORKER_ID);
  console.log("════════════════════════════════════════════════════════════");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("SETUP FAILED:", err);
  process.exit(1);
});

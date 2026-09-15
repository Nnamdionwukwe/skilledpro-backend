// scripts/debt-test-withdraw.js
// ─────────────────────────────────────────────────────────────────────────────
// DEBT SYSTEM TEST — Step 6c: Auto-deduct on withdrawal
//
// Now caches the worker's JWT to /tmp/worker-token.txt so reruns don't burn
// the auth rate limiter (10 logins per 15 min per IP).
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import prisma from "../src/config/database.js";

const API       = "http://localhost:5000/api";
const HIRER_ID  = "a3ad7c49-3ff2-42b6-afbc-b182350c54c1";
const WORKER_ID = "d6389516-a87b-4bac-8d12-96d7c9f13a5e";
const WORKER_EMAIL = "beautifulboldand4@gmail.com";
const PASSWORD     = "123456789N";
const TOKEN_FILE   = "/tmp/worker-token.txt";

// ── HTTP helper ──────────────────────────────────────────────────────────────
async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function tokenOf(j) {
  return j?.data?.accessToken || j?.data?.token || j?.accessToken || j?.token || null;
}

function log(label, value) {
  console.log(`  ${label}:`, typeof value === "object" ? JSON.stringify(value, null, 2) : value);
}

function section(t) {
  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  " + t);
  console.log("════════════════════════════════════════════════════════════");
}

// ── Cached login ─────────────────────────────────────────────────────────────
function readCachedToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (!t) return null;
    const part = t.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, "base64").toString("utf8"));
    if (payload.exp && payload.exp * 1000 > Date.now() + 60_000) return t;
    return null;
  } catch { return null; }
}

async function loginWorker() {
  const cached = readCachedToken();
  if (cached) {
    console.log("  ✅ Using cached token from", TOKEN_FILE);
    return cached;
  }
  const res = await api("POST", "/auth/login", {
    email: WORKER_EMAIL,
    password: PASSWORD,
  });
  log("login status", res.status);
  if (res.status !== 200) {
    log("login body", res.json);
    throw new Error("Worker login failed");
  }
  const t = tokenOf(res.json);
  if (!t) throw new Error("No token in login response");
  fs.writeFileSync(TOKEN_FILE, t);
  console.log("  ✅ Logged in and cached token to", TOKEN_FILE);
  return t;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // ── 0. Pre-flight ────────────────────────────────────────────────────────
  section("0. PRE-FLIGHT STATE");
  const wpBefore = await prisma.workerProfile.findUnique({
    where: { userId: WORKER_ID },
    select: { id: true, debtBalance: true, totalEarnings: true },
  });
  log("workerProfile.id", wpBefore?.id);
  log("debtBalance (before)", wpBefore?.debtBalance);
  log("totalEarnings (before)", wpBefore?.totalEarnings);

  const debtBefore = await prisma.workerDebt.findMany({
    where: { workerId: WORKER_ID, status: "OUTSTANDING" },
  });
  log("outstanding debts (before)", debtBefore.length);

  // ── 1. Fresh booking + RELEASED payment ──────────────────────────────────
  section("1. GIVE WORKER FRESH EARNINGS");
  const category = await prisma.category.findFirst();
  const booking2 = await prisma.booking.create({
    data: {
      hirerId: HIRER_ID,
      workerId: WORKER_ID,
      categoryId: category.id,
      title: "DEBT TEST — Second Completed Job",
      description: "Fresh earnings for withdrawal test",
      address: "456 Test Avenue",
      scheduledAt: new Date(Date.now() - 5 * 86400000),
      completedAt: new Date(Date.now() - 3 * 86400000),
      agreedRate: 200,
      currency: "NGN",
      status: "COMPLETED",
    },
    select: { id: true, title: true, status: true },
  });
  log("booking2.id", booking2.id);

  const payment2 = await prisma.payment.create({
    data: {
      bookingId: booking2.id,
      userId: HIRER_ID,
      amount: 210,
      currency: "NGN",
      platformFee: 10,
      workerPayout: 200,
      status: "RELEASED",
      provider: "paystack",
      providerRef: "DEBT-TEST-PAY2-" + Date.now(),
      escrowReleasedAt: new Date(Date.now() - 3 * 86400000),
    },
    select: { id: true, status: true, workerPayout: true },
  });
  log("payment2.id", payment2.id);

  // ── 2. Login (cached) ────────────────────────────────────────────────────
  section("2. LOGIN AS WORKER (CACHED)");
  const workerToken = await loginWorker();

  // ── 3. Ensure PIN ────────────────────────────────────────────────────────
  section("3. WITHDRAWAL PIN");
  const existingPin = await prisma.user.findUnique({
    where: { id: WORKER_ID },
    select: { withdrawalPinSet: true },
  });
  log("pin already set?", existingPin?.withdrawalPinSet);

  if (!existingPin?.withdrawalPinSet) {
    const pinRes = await api("POST", "/payments/pin/set", {
      pin: "5050",
      confirmPin: "1234",
    }, workerToken);
    log("pin/set status", pinRes.status);
    log("pin/set body", pinRes.json);
  }

  // ── 4. GET withdrawals (verify balance view) ─────────────────────────────
  section("4. GET /payments/withdrawals");
  const getRes = await api("GET", "/payments/withdrawals", null, workerToken);
  log("status", getRes.status);
  log("balance", getRes.json?.data?.balance);

  // ── 5. Withdraw 150 ──────────────────────────────────────────────────────
  section("5. REQUEST WITHDRAWAL (150 NGN)");
  const withdrawRes = await api("POST", "/payments/withdraw", {
    amount: 150,
    currency: "NGN",
    method: "bank_transfer",
    bankCode: "044",
    bankName: "Access Bank",
    accountNumber: "0123456789",
    accountName: "Test Worker",
    country: "NG",
    pin: "5050",
  }, workerToken);
  log("status", withdrawRes.status);
  log("body", withdrawRes.json);

  // ── 6. Verify DB ─────────────────────────────────────────────────────────
  section("6. VERIFY DB STATE");

  const wpAfter = await prisma.workerProfile.findUnique({
    where: { userId: WORKER_ID },
    select: { debtBalance: true, totalEarnings: true },
  });
  console.log("── WorkerProfile ──");
  log("debtBalance (after)", wpAfter?.debtBalance);
  log("totalEarnings (after)", wpAfter?.totalEarnings);

  const debtsAfter = await prisma.workerDebt.findMany({
    where: { workerId: WORKER_ID },
    orderBy: { createdAt: "asc" },
  });
  console.log("── WorkerDebt rows (after) ──");
  for (const d of debtsAfter) {
    log("  debt", {
      id: d.id,
      status: d.status,
      amount: d.amount,
      amountPaid: d.amountPaid,
      clearedAt: d.clearedAt?.toISOString(),
    });
  }

  const latestWithdrawal = await prisma.withdrawal.findFirst({
    where: { workerId: WORKER_ID, reference: { startsWith: "WD-" } },
    orderBy: { createdAt: "desc" },
  });
  console.log("── Latest Withdrawal ──");
  if (latestWithdrawal) {
    log("amount", latestWithdrawal.amount);
    log("status", latestWithdrawal.status);
    log("details", latestWithdrawal.details);
  } else {
    console.log("  (none)");
  }

  // ── 7. Verdict ───────────────────────────────────────────────────────────
  section("VERDICT");
  const debtCleared     = debtsAfter.some(d => d.status === "CLEARED" && d.amountPaid === 100);
  const debtBalanceZero = (wpAfter?.debtBalance ?? -1) === 0;
  const withdrawalOk    = latestWithdrawal?.amount === 50;

  console.log("  ✅ Debt CLEARED (amountPaid=100) :", debtCleared);
  console.log("  ✅ debtBalance back to 0         :", debtBalanceZero);
  console.log("  ✅ Withdrawal net = 50           :", withdrawalOk,
    latestWithdrawal ? `(got ${latestWithdrawal.amount})` : "(no withdrawal)");

  const allGreen = debtCleared && debtBalanceZero && withdrawalOk;
  console.log("");
  console.log(allGreen ? "🎉 ALL GREEN — AUTO-DEDUCT WORKS" : "❌ SOME CHECKS FAILED");

  await prisma.$disconnect();
  process.exit(allGreen ? 0 : 1);
}

main().catch(async (err) => {
  console.error("");
  console.error("TEST FAILED:", err.message);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});

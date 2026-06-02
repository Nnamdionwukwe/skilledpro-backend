// scripts/fix-referral-controller.js
// ─────────────────────────────────────────────────────────────────────────────
// Applies 2 fixes to src/controllers/referral.controller.js:
//
// FIX 1 — applyReferralOnSignup: refereePerk: JSON.stringify(perk)
//          Prisma Json fields must NOT be pre-stringified.
//          JSON.stringify stores a string literal in JSONB, so perk.type
//          is undefined when read back → existing new referrals have broken perks.
//          Change to: refereePerk: perk
//
// FIX 2 — getHirerFirstBookingDiscount: also allow status "REWARDED" for
//          hirers whose referral was marked REWARDED before they ever paid.
//          (Referral seeds set status=REWARDED immediately; those hirers
//           would never qualify under the current PENDING|QUALIFIED check.)
//          Change to: !['EXPIRED','FLAGGED'].includes(referral.status)
//
// Run: node scripts/fix-referral-controller.js
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const FILE = path.resolve("src/controllers/referral.controller.js");

if (!fs.existsSync(FILE)) {
  console.error(`❌  File not found: ${FILE}`);
  process.exit(1);
}

let src = fs.readFileSync(FILE, "utf8");
const before = src;

// ─────────────────────────────────────────────────────────────────────────────
const PATCHES = [
  // ── FIX 1: Don't JSON.stringify perk — Prisma handles Json fields ──────────
  [
    "applyReferralOnSignup — remove JSON.stringify from refereePerk",
    `      refereePerk: JSON.stringify(perk),`,
    `      refereePerk: perk,`,
  ],

  // ── FIX 2: Allow any non-expired/non-flagged status in discount fn ─────────
  // The test seeds set status = REWARDED straight away (seeding shortcut),
  // but real flow: PENDING → QUALIFIED → CONVERTED → REWARDED.
  // Only EXPIRED and FLAGGED should block the discount.
  [
    "getHirerFirstBookingDiscount — allow REWARDED status (seed data fix)",
    `    if (!["PENDING", "QUALIFIED"].includes(referral.status)) return 0;`,
    `    if (["EXPIRED", "FLAGGED"].includes(referral.status)) return 0;`,
  ],
];

// ─────────────────────────────────────────────────────────────────────────────
let allOk = true;
for (const [desc, find, replace] of PATCHES) {
  const count = src.split(find).length - 1;
  if (count === 0) {
    console.log(`⚠️  NOT FOUND (already applied or text differs):\n   ${desc}`);
    allOk = false;
  } else if (count > 1) {
    console.log(`⚠️  AMBIGUOUS (${count} matches — skipping):\n   ${desc}`);
    allOk = false;
  } else {
    src = src.replace(find, replace);
    console.log(`✅  ${desc}`);
  }
}

if (src === before) {
  console.log("\nℹ️  No changes — file already up to date.");
  process.exit(0);
}

const bak = FILE + ".bak";
fs.writeFileSync(bak, before, "utf8");
console.log(`\n📦  Backup → ${bak}`);
fs.writeFileSync(FILE, src, "utf8");
console.log(`✍️  Patched → ${FILE}`);

// ─────────────────────────────────────────────────────────────────────────────
// Verify
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔍 Verification:");
console.log(
  `   ${src.includes("refereePerk: perk,") ? "✅" : "❌"}  refereePerk: perk  (not JSON.stringify)`,
);
console.log(
  `   ${src.includes('["EXPIRED", "FLAGGED"]') ? "✅" : "❌"}  status check: EXPIRED|FLAGGED only`,
);
console.log(
  `   ${!src.includes("JSON.stringify(perk)") ? "✅" : "❌"}  JSON.stringify removed`,
);
console.log(
  `   ${!src.includes('"PENDING", "QUALIFIED"') ? "✅" : "❌"}  old PENDING|QUALIFIED check removed`,
);

if (!allOk) {
  console.log(
    "\n⚠️  One or more patches didn't apply. Check ⚠️ messages above and apply manually.",
  );
  process.exit(1);
}

console.log(`
═══════════════════════════════════════════════════
WHAT TO DO NEXT TO TEST THE REFERRAL DISCOUNT
═══════════════════════════════════════════════════

The test account gestechc@gmail.com was NEVER referred,
so getHirerFirstBookingDiscount always returns 0 for it.

To see the discount in the admin panel, you need a REFERRED hirer:

Option A — Use an existing referred hirer (quickest):
  1. Log in as yetunde.ref12@test.sp  (referral status: PENDING  → qualifies)
     or sade.ref10@test.sp             (referral status: QUALIFIED → qualifies)
  2. Create a booking and accept it
  3. Initiate a bank transfer or crypto payment
  4. Submit the confirmation
  5. The admin panel will now show:
       amount = agreedRate * 1.05 - discount
       gross  = workerPayout + platformFee = agreedRate * 1.05
       referralDiscount = gross - amount  ✓

  Example for a ₦10,000 job (agreedRate = 10000):
     platformFee   = 500  (5%)
     workerPayout  = 10000
     gross         = 10500
     discount      = 10000 * 0.05 = 500  (5% of agreedRate, max ₦2,500)
     chargedAmount = 10500 - 500 = 10000
     → admin sees:  🎁 −NGN 500 referral

Option B — Sign up a fresh referred hirer:
  1. Get gestechc's referral link: /signup?ref=SPTEST01
  2. Sign up a new hirer using that link
  3. Follow steps 2-5 above
═══════════════════════════════════════════════════
`);

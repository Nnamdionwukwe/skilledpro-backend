// scripts/fix-payment-relation.js
// ─────────────────────────────────────────────────────────────────────────────
// One-shot script: replaces all `payment` (singular) references with `payments`
// (plural, one-to-many) across every controller file.
//
// Run from project root:
//   node scripts/fix-payment-relation.js
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";

const FILES = [
  "src/controllers/booking.controller.js",
  "src/controllers/payment.controller.js",
  "src/controllers/hirer.controller.js",
  "src/controllers/dispute.controller.js",
  "src/controllers/invoice.controller.js",
  "src/controllers/admin.controller.js",
];

// Each entry: [description, regex, replacement]
// ORDER MATTERS — most specific patterns first.
const REPLACEMENTS = [
  // ── 1. Single-line include: { payment: true } ──────────────────────────────
  // e.g.  include: { payment: true }
  [
    "single-line include: { payment: true }",
    /include:\s*\{\s*payment:\s*true\s*\}/g,
    `include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } }`,
  ],

  // ── 2. Multi-line include entry: payment: true, (with trailing comma) ──────
  // e.g.          payment: true,
  [
    "multi-line  payment: true,",
    /^(\s+)payment:\s*true,$/gm,
    `$1payments: { orderBy: { createdAt: "desc" }, take: 1 },`,
  ],

  // ── 3. Multi-line include entry: payment: true  (no trailing comma) ─────────
  // e.g.          payment: true
  [
    "multi-line  payment: true  (no comma)",
    /^(\s+)payment:\s*true$/gm,
    `$1payments: { orderBy: { createdAt: "desc" }, take: 1 }`,
  ],

  // ── 4. booking.payment?.  →  booking.payments?.[0]?. ──────────────────────
  ["booking.payment?.", /booking\.payment\?\./g, "booking.payments?.[0]?."],

  // ── 5. booking.payment.  →  booking.payments?.[0]. ────────────────────────
  ["booking.payment.", /booking\.payment\./g, "booking.payments?.[0]."],

  // ── 6. booking.payment &&  →  booking.payments?.[0] && ────────────────────
  ["booking.payment &&", /booking\.payment\s*&&/g, "booking.payments?.[0] &&"],

  // ── 7. booking.payment)  →  booking.payments?.[0]) ────────────────────────
  ["booking.payment)", /booking\.payment\)/g, "booking.payments?.[0])"],

  // ── 8. booking.payment;  →  booking.payments?.[0]; ────────────────────────
  ["booking.payment;", /booking\.payment;/g, "booking.payments?.[0];"],

  // ── 9. booking.payment\n  →  booking.payments?.[0]  (end of line) ─────────
  [
    "booking.payment (end of line)",
    /booking\.payment$/gm,
    "booking.payments?.[0]",
  ],

  // ── 10. catch-all: booking.payment (not already booking.payments) ──────────
  // Negative lookahead: don't touch `booking.payments` (already correct)
  [
    "booking.payment (catch-all)",
    /booking\.payment(?!s|\?|\[)/g,
    "booking.payments?.[0]",
  ],
];

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
let totalChanges = 0;

for (const relPath of FILES) {
  const fullPath = path.resolve(relPath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  Skipping (not found): ${relPath}`);
    continue;
  }

  let src = fs.readFileSync(fullPath, "utf8");
  let changed = false;
  const fileChanges = [];

  for (const [desc, pattern, replacement] of REPLACEMENTS) {
    const before = src;
    src = src.replace(pattern, replacement);
    if (src !== before) {
      // Count how many replacements were made
      const count = (before.match(pattern) || []).length;
      fileChanges.push(`   • ${count}× ${desc}`);
      totalChanges += count;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(fullPath, src, "utf8");
    console.log(`✅ ${relPath}`);
    fileChanges.forEach((c) => console.log(c));
  } else {
    console.log(`✔  ${relPath}  (no changes needed)`);
  }
}

console.log(
  `\n🎉 Done — ${totalChanges} replacement(s) across ${FILES.length} file(s).`,
);

// ─────────────────────────────────────────────────────────────────────────────
// Verify: grep for any remaining payment: true or booking.payment occurrences
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n🔍 Checking for remaining occurrences…");

let remaining = 0;
for (const relPath of FILES) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) continue;

  const src = fs.readFileSync(fullPath, "utf8");
  const lines = src.split("\n");

  lines.forEach((line, i) => {
    // Match old patterns but not the new ones (payments is fine)
    const hasOld =
      /payment:\s*true/.test(line) || /booking\.payment(?!s)/.test(line);
    if (hasOld) {
      console.log(`  ⚠️  ${relPath}:${i + 1}  →  ${line.trim()}`);
      remaining++;
    }
  });
}

if (remaining === 0) {
  console.log("  ✅ No remaining occurrences — all clean!");
} else {
  console.log(
    `\n  ⚠️  ${remaining} line(s) may still need manual review above.`,
  );
}

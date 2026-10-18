// scripts/seed-retained-system-settings.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeds the default AppSettings keys used by the Retained Staff module.
//
// Run: node scripts/seed-retained-system-settings.js
//
// Safe to re-run — uses upsert (won't overwrite existing values).
// ─────────────────────────────────────────────────────────────────────────────

import prisma from "../src/config/database.js";

const SETTINGS = [
  {
    key: "retained.enabled",
    value: "true",
    description: "Master switch for Retained Staff module",
  },
  {
    key: "retained.defaultPlatformFeePct",
    value: "5",
    description: "Platform fee % applied to retained payroll cycles",
  },
  {
    key: "retained.maxActiveStaffPerHirer",
    value: "100",
    description: "Maximum active retained-staff members per hirer",
  },
  {
    key: "retained.cron.lookaheadDays",
    value: "3",
    description:
      "How many days ahead the cron looks for due cycles (create them early so hirers can fund)",
  },
  {
    key: "retained.requireDocumentBeforeCycle",
    value: "false",
    description:
      "If true, block cycle creation for members without an uploaded CONTRACT document",
  },
  {
    key: "retained.allowDirectTransfer",
    value: "true",
    description:
      "Allow hirers to mark a cycle as paid outside escrow (DIRECT_TRANSFER)",
  },
];

async function run() {
  console.log("🔧 Seeding retained-staff system settings...\n");

  let created = 0;
  let existing = 0;

  for (const s of SETTINGS) {
    const found = await prisma.appSettings.findUnique({
      where: { key: s.key },
    });

    if (found) {
      existing++;
      console.log(`  ⏭  ${s.key}  (already set: ${found.value})`);
      continue;
    }

    await prisma.appSettings.create({
      data: {
        key: s.key,
        value: s.value,
        description: s.description,
      },
    });
    created++;
    console.log(`  ✅ ${s.key} = ${s.value}`);
  }

  console.log(`\n📊 Done. created=${created}, existing=${existing}`);
  console.log(
    `\n💡 Change any value later via admin panel or direct DB update.\n`,
  );
}

run()
  .catch((err) => {
    console.error("\n❌ Failed:", err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

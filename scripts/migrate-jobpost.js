#!/usr/bin/env node
/**
 * migrate-jobpost.js
 *
 * Run from your backend project root:
 *   node scripts/migrate-jobpost.js
 *
 * What it does:
 *  1. Finds schema.prisma
 *  2. Adds 4 new enums (JobType, LocationType, BudgetType, DurationType)
 *  3. Patches the JobPost model:
 *       - Makes `address` optional (not required when REMOTE)
 *       - Adds jobType, locationType, budgetType, durationType,
 *         durationValue, skills
 *  4. Writes the updated schema back to disk
 *  5. Runs `npx prisma migrate dev --name add_jobpost_fields`
 *  6. Prints the updated controller + route snippets you need to paste
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // project root

// ── 1. Locate schema.prisma ──────────────────────────────────────────────────

const SCHEMA_CANDIDATES = [
  path.join(ROOT, "prisma", "schema.prisma"),
  path.join(ROOT, "schema.prisma"),
  path.join(ROOT, "src", "prisma", "schema.prisma"),
];

let SCHEMA_PATH = SCHEMA_CANDIDATES.find(fs.existsSync);
if (!SCHEMA_PATH) {
  console.error(
    "❌  Could not find schema.prisma. Run this script from your backend root.",
  );
  process.exit(1);
}

console.log(`\n✅  Found schema at: ${SCHEMA_PATH}`);

let schema = fs.readFileSync(SCHEMA_PATH, "utf8");

// ── 2. Helper: check if a token already exists ───────────────────────────────

const has = (token) => schema.includes(token);

// ── 3. New enum definitions ──────────────────────────────────────────────────

const NEW_ENUMS = {
  JobType: `
enum JobType {
  FULL_TIME
  PART_TIME
  CONTRACT
  TEMPORARY
}
`,
  LocationType: `
enum LocationType {
  REMOTE
  ON_SITE
  HYBRID
}
`,
  BudgetType: `
enum BudgetType {
  FIXED
  HOURLY
  DAILY
  WEEKLY
  MONTHLY
  CUSTOM
}
`,
  DurationType: `
enum DurationType {
  HOURS
  DAYS
  WEEKS
  MONTHS
  CUSTOM
}
`,
};

let enumsAdded = [];

for (const [name, block] of Object.entries(NEW_ENUMS)) {
  if (has(`enum ${name}`)) {
    console.log(`  ⏭️   Enum ${name} already exists — skipped`);
  } else {
    // Append new enum before the last closing brace / at end of file
    schema += block;
    enumsAdded.push(name);
    console.log(`  ➕  Added enum ${name}`);
  }
}

// ── 4. Patch JobPost model ───────────────────────────────────────────────────

// Extract the JobPost model block
const MODEL_RE = /model JobPost \{[\s\S]*?\n\}/;
const modelMatch = schema.match(MODEL_RE);

if (!modelMatch) {
  console.error("❌  Could not find `model JobPost` in schema. Aborting.");
  process.exit(1);
}

let jobPostBlock = modelMatch[0];

// 4a. Make address optional  (String → String?)
if (/address\s+String[^?]/.test(jobPostBlock)) {
  jobPostBlock = jobPostBlock.replace(
    /(\s+address\s+)String(\s)/,
    "$1String?$2",
  );
  console.log("  ✏️   Made `address` optional (String?)");
} else {
  console.log("  ⏭️   `address` is already optional — skipped");
}

// 4b. Fields to inject (only if missing)
const NEW_FIELDS = [
  { token: "jobType", line: "  jobType      JobType      @default(FULL_TIME)" },
  {
    token: "locationType",
    line: "  locationType LocationType @default(REMOTE)",
  },
  { token: "budgetType", line: "  budgetType   BudgetType   @default(FIXED)" },
  {
    token: "durationType",
    line: "  durationType DurationType @default(HOURS)",
  },
  { token: "durationValue", line: "  durationValue String?" },
  { token: "skills", line: "  skills        String[]    @default([])" },
];

let fieldsAdded = [];

for (const { token, line } of NEW_FIELDS) {
  if (jobPostBlock.includes(`  ${token}`)) {
    console.log(`  ⏭️   Field \`${token}\` already exists — skipped`);
  } else {
    // Insert before the closing brace of the model
    jobPostBlock = jobPostBlock.replace(/(\n\})$/, `\n${line}\n}`);
    fieldsAdded.push(token);
    console.log(`  ➕  Added field \`${token}\``);
  }
}

// Replace old JobPost block with patched block
schema = schema.replace(MODEL_RE, jobPostBlock);

// ── 5. Write updated schema ──────────────────────────────────────────────────

// Backup original
const BACKUP = SCHEMA_PATH + ".bak";
fs.copyFileSync(SCHEMA_PATH, BACKUP);
console.log(`\n📦  Backed up original to ${BACKUP}`);

fs.writeFileSync(SCHEMA_PATH, schema, "utf8");
console.log("💾  schema.prisma updated\n");

// ── 6. Run Prisma migration ──────────────────────────────────────────────────

if (enumsAdded.length === 0 && fieldsAdded.length === 0) {
  console.log("ℹ️   No schema changes needed — skipping migration.\n");
} else {
  console.log("🚀  Running prisma migrate dev …\n");
  try {
    execSync("npx prisma migrate dev --name add_jobpost_fields", {
      stdio: "inherit",
      cwd: ROOT,
    });
    console.log("\n✅  Migration complete!\n");
  } catch (err) {
    console.error("\n⚠️   Migration failed. Try manually:\n");
    console.error("    npx prisma migrate dev --name add_jobpost_fields\n");
    console.error("    or: npx prisma db push\n");
  }
}

// ── 7. Print controller patch ────────────────────────────────────────────────

console.log(`
${"═".repeat(72)}
  CONTROLLER PATCH — src/controllers/job.controller.js
${"═".repeat(72)}

Replace the createJobPost destructure + validation + prisma.create block
with the version below:

─────────────────────────────────────────────────────────────────────────

export const createJobPost = async (req, res) => {
  try {
    const {
      categoryId,
      title,
      description,
      // location fields
      locationType = "REMOTE",
      address,
      latitude,
      longitude,
      // job meta
      jobType = "FULL_TIME",
      scheduledAt,      // maps to startDate from the app
      startDate,        // alias — app sends startDate
      estimatedHours,
      estimatedUnit,
      estimatedValue,
      // payment / duration
      budgetType = "FIXED",
      budget,
      currency,
      durationType = "HOURS",
      durationValue,
      // extras
      skills = [],
      notes,
    } = req.body;

    // Resolve startDate — app sends startDate, legacy sends scheduledAt
    const resolvedScheduledAt = scheduledAt || startDate;

    // address is required only for non-remote jobs
    if (!categoryId || !title || !description || !resolvedScheduledAt || !budget) {
      return sendError(res, "Please provide all required fields", 400);
    }
    if (locationType !== "REMOTE" && !address) {
      return sendError(res, "Address is required for on-site / hybrid jobs", 400);
    }

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return sendError(res, "Category not found", 404);

    const jobPost = await prisma.jobPost.create({
      data: {
        hirerId:     req.user.id,
        categoryId,
        title,
        description,
        locationType,
        address:     locationType !== "REMOTE" ? address : null,
        latitude:    latitude  ? parseFloat(latitude)  : null,
        longitude:   longitude ? parseFloat(longitude) : null,
        jobType,
        scheduledAt: new Date(resolvedScheduledAt),
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        estimatedUnit:  estimatedUnit || "hours",
        estimatedValue: estimatedValue ? String(estimatedValue) : null,
        budgetType,
        budget:      parseFloat(budget),
        currency:    currency || "NGN",
        durationType,
        durationValue: durationValue ? String(durationValue) : null,
        skills:      Array.isArray(skills) ? skills : [],
        notes:       notes || null,
      },
      include: {
        hirer:    { select: { id: true, firstName: true, lastName: true, avatar: true } },
        category: true,
        _count:   { select: { applications: true } },
      },
    });

    // … rest of worker-notification logic unchanged …

    return sendResponse(res, {
      status: 201,
      message: "Job posted successfully",
      data: { jobPost },
    });
  } catch (err) {
    console.error(err);
    return sendError(res, "Failed to post job");
  }
};

─────────────────────────────────────────────────────────────────────────
Also add these filters to getJobPosts() inside the \`where\` object:

    ...(req.query.jobType      && { jobType:      req.query.jobType }),
    ...(req.query.locationType && { locationType: req.query.locationType }),
    ...(req.query.budgetType   && { budgetType:   req.query.budgetType }),

─────────────────────────────────────────────────────────────────────────

${"═".repeat(72)}
  ROUTE — no changes needed (POST / already correct)
${"═".repeat(72)}

All existing routes are correct. No additions required.

${"═".repeat(72)}
  DONE — summary of changes
${"═".repeat(72)}
  Enums added  : ${enumsAdded.length ? enumsAdded.join(", ") : "none (all existed)"}
  Fields added : ${fieldsAdded.length ? fieldsAdded.join(", ") : "none (all existed)"}
  address      : now optional (String?)
${"═".repeat(72)}
`);

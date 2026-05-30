#!/usr/bin/env node
// patch-pagination.js
// ─────────────────────────────────────────────────────────────────────────────
// Automatically patches all controllers to:
//   1. Add helpers import at the top
//   2. Replace manual skip/take/pages/page patterns with helper calls
//
// Run from project root:  node patch-pagination.js
// Backups created at:     src/controllers/*.bak  (safe to delete after review)
//
// Run the audit first:    node audit-controllers.js
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile, copyFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC =
  [join(__dirname, "src"), join(__dirname, "../src")].find(existsSync) ??
  join(__dirname, "src");
const CTRL_DIR = join(SRC, "controllers");

const LINE = "─".repeat(80);
const DRY = process.argv.includes("--dry"); // node patch-pagination.js --dry

// ─────────────────────────────────────────────────────────────────────────────
// REPLACEMENT RULES  (applied in order — order matters)
// Each rule: { pattern, replacement, description }
// ─────────────────────────────────────────────────────────────────────────────
const RULES = [
  // ── Rule 1: skip = (parseInt(page) - 1) * parseInt(limit)  ─────────────────
  //   → const { skip, take } = paginate(page, limit);
  {
    description: "Replace skip calculation (parseInt variant)",
    pattern:
      /const\s+skip\s*=\s*\(parseInt\s*\(\s*page\s*\)\s*-\s*1\)\s*\*\s*parseInt\s*\(\s*limit\s*\)\s*;/g,
    replacement: "const { skip, take } = paginate(page, limit);",
  },

  // ── Rule 2: skip = (Number(page) - 1) * Number(limit)  ─────────────────────
  {
    description: "Replace skip calculation (Number variant)",
    pattern:
      /const\s+skip\s*=\s*\(Number\s*\(\s*page\s*\)\s*-\s*1\)\s*\*\s*Number\s*\(\s*limit\s*\)\s*;/g,
    replacement: "const { skip, take } = paginate(page, limit);",
  },

  // ── Rule 3: skip = (parseInt(page) - 1) * parseInt(limit) — no semicolon ───
  {
    description: "Replace skip calculation (no semicolon variant)",
    pattern:
      /const\s+skip\s*=\s*\(parseInt\s*\(\s*page\s*\)\s*-\s*1\)\s*\*\s*parseInt\s*\(\s*limit\s*\)(?!\s*;)/g,
    replacement: "const { skip, take } = paginate(page, limit);",
  },

  // ── Rule 4: take: parseInt(limit),  → take,  ────────────────────────────────
  //   Only replace when it's a standalone property (not inside a variable name)
  {
    description: "Replace take: parseInt(limit) with take",
    pattern: /\btake\s*:\s*parseInt\s*\(\s*limit\s*\)\s*,/g,
    replacement: "take,",
  },
  {
    description: "Replace take: Number(limit) with take",
    pattern: /\btake\s*:\s*Number\s*\(\s*limit\s*\)\s*,/g,
    replacement: "take,",
  },
  {
    description: "Replace take: parseInt(limit) (no trailing comma)",
    pattern: /\btake\s*:\s*parseInt\s*\(\s*limit\s*\)(?!\s*\w)/g,
    replacement: "take",
  },

  // ── Rule 5: pages: Math.ceil(total / parseInt(limit))  ─────────────────────
  {
    description: "Replace pages: Math.ceil(total / parseInt(limit)) with take",
    pattern:
      /pages\s*:\s*Math\.ceil\s*\(\s*total\s*\/\s*parseInt\s*\(\s*limit\s*\)\s*\)/g,
    replacement: "pages: Math.ceil(total / take)",
  },
  {
    description: "Replace pages: Math.ceil(total / Number(limit)) with take",
    pattern:
      /pages\s*:\s*Math\.ceil\s*\(\s*total\s*\/\s*Number\s*\(\s*limit\s*\)\s*\)/g,
    replacement: "pages: Math.ceil(total / take)",
  },
  // Handle the variant with parseInt(limit) spread across multiple lines
  {
    description: "Replace pages: Math.ceil(total / limit variant)",
    pattern: /pages\s*:\s*Math\.ceil\s*\(\s*total\s*\/\s*limit\s*\)/g,
    replacement: "pages: Math.ceil(total / take)",
  },

  // ── Rule 6: page: parseInt(page)  ──────────────────────────────────────────
  //   → page: parseInt(page)  kept as-is (safer — paginate returns p but destructure name clashes)
  //   We will NOT auto-replace this to avoid bugs when `page` variable is reused.
];

// ─────────────────────────────────────────────────────────────────────────────
// IMPORT INJECTION
// Adds or merges the helpers import at the top of the file.
// ─────────────────────────────────────────────────────────────────────────────
const HELPERS_TO_IMPORT = [
  "paginate",
  "paginationMeta",
  "fullName",
  "formatCurrency",
  "truncate",
  "slugify",
  "uniqueRef",
  "parseJSON",
  "extractIP",
  "timeAgo",
  "safeUser",
];

const IMPORT_LINE = `import { paginate, paginationMeta, fullName, formatCurrency, truncate, slugify, uniqueRef, parseJSON, extractIP, timeAgo, safeUser } from "../utils/helpers.js";`;

function injectImport(content, file) {
  // Already has the helpers import — check if we need to extend it
  if (/from\s+["']\.\.\/utils\/helpers\.js["']/.test(content)) {
    // Extract existing named imports
    const existingMatch = content.match(
      /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/utils\/helpers\.js["']/,
    );
    if (existingMatch) {
      const existing = new Set(
        existingMatch[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      const toAdd = HELPERS_TO_IMPORT.filter((h) => !existing.has(h));
      if (toAdd.length === 0) return { content, changed: false };
      const merged = [...existing, ...toAdd].join(", ");
      return {
        content: content.replace(
          existingMatch[0],
          `import { ${merged} } from "../utils/helpers.js"`,
        ),
        changed: true,
        note: `Extended helpers import with: ${toAdd.join(", ")}`,
      };
    }
    return { content, changed: false };
  }

  // Find the last import line in the file and insert after it
  const importLines = content.split("\n");
  let lastImportIdx = -1;
  for (let i = 0; i < importLines.length; i++) {
    if (/^import\s/.test(importLines[i].trim())) lastImportIdx = i;
  }

  if (lastImportIdx >= 0) {
    importLines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    return {
      content: importLines.join("\n"),
      changed: true,
      note: "Added helpers import",
    };
  }

  // No imports found — prepend
  return {
    content: IMPORT_LINE + "\n" + content,
    changed: true,
    note: "Prepended helpers import",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-FILE PROCESSING
// ─────────────────────────────────────────────────────────────────────────────
async function patchFile(filePath, fileName) {
  const original = await readFile(filePath, "utf8");
  let content = original;
  const changes = [];

  // Apply each rule
  for (const rule of RULES) {
    const before = content;
    content = content.replace(rule.pattern, rule.replacement);
    if (content !== before) {
      // Count how many replacements were made
      const count = (before.match(rule.pattern) || []).length;
      changes.push({ rule: rule.description, count });
    }
  }

  // Inject import (only if pagination was actually changed)
  const paginationChanged = changes.length > 0;
  let importNote = "";

  if (
    paginationChanged ||
    !/from\s+["']\.\.\/utils\/helpers\.js["']/.test(content)
  ) {
    const {
      content: withImport,
      changed,
      note,
    } = injectImport(content, fileName);
    if (changed) {
      content = withImport;
      importNote = note || "";
    }
  }

  const fileChanged = content !== original;

  return { fileChanged, changes, importNote, content };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function run() {
  console.log();
  console.log("SkilledProz — Pagination Patch Script");
  console.log(
    `Mode    : ${DRY ? "DRY RUN (no files written)" : "LIVE (files will be modified)"}`,
  );
  console.log(`Dir     : ${CTRL_DIR}`);
  console.log(`Started : ${new Date().toLocaleString()}`);
  console.log(LINE);

  const files = (await readdir(CTRL_DIR))
    .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
    .sort();

  let totalPatched = 0;
  let totalSkipped = 0;
  let totalChanges = 0;
  const patchLog = [];

  for (const file of files) {
    const filePath = join(CTRL_DIR, file);
    const { fileChanged, changes, importNote, content } = await patchFile(
      filePath,
      file,
    );

    if (!fileChanged) {
      console.log(`  ⏭  ${file.padEnd(45)} (no changes needed)`);
      totalSkipped++;
      continue;
    }

    // Count total replacements
    const replacementCount = changes.reduce((sum, c) => sum + c.count, 0);
    totalChanges += replacementCount;

    console.log();
    console.log(`  ✅  ${file}`);
    if (importNote) console.log(`       import : ${importNote}`);
    changes.forEach((c) => {
      console.log(`       ${c.count}× ${c.rule}`);
    });

    patchLog.push({ file, changes, importNote, replacementCount });

    if (!DRY) {
      // Backup original
      await copyFile(filePath, `${filePath}.bak`);
      // Write patched content
      await writeFile(filePath, content, "utf8");
    }

    totalPatched++;
  }

  console.log();
  console.log(LINE);
  console.log("SUMMARY");
  console.log(LINE);
  console.log(`  Files patched       : ${totalPatched}`);
  console.log(`  Files unchanged     : ${totalSkipped}`);
  console.log(`  Total replacements  : ${totalChanges}`);
  if (DRY) {
    console.log();
    console.log("  ⚠️  DRY RUN — no files were written.");
    console.log("  Run without --dry to apply changes.");
  } else {
    console.log();
    console.log("  Backups saved as: src/controllers/*.bak");
    console.log("  To undo: rename .bak files back to .js");
    console.log();
    console.log("  WHAT STILL NEEDS MANUAL REVIEW:");
    console.log("  ─────────────────────────────────────────────────────────");
    console.log("  1. page: parseInt(page) in response objects");
    console.log(
      "     → Can be replaced with: page: parseInt(page) || left as-is",
    );
    console.log(
      "     → Or restructure to use paginationMeta(total, page, limit)",
    );
    console.log();
    console.log(
      "  2. Any place that uses `limit` as an integer AFTER this patch",
    );
    console.log("     (e.g. aggregate queries not using take/skip)");
    console.log(
      "     → Replace parseInt(limit) with take (which is already an int)",
    );
    console.log();
    console.log(
      "  3. Check for any uses of `skip` variable that weren't from pagination",
    );
    console.log(
      "     → Run: node audit-controllers.js after patching to verify",
    );
  }
  console.log(LINE);
  console.log();
}

run().catch((err) => {
  console.error("PATCH FAILED:", err.message);
  process.exit(1);
});

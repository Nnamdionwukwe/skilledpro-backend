#!/usr/bin/env node
// fix-imports.js
// ─────────────────────────────────────────────────────────────────────────────
// Fixes the broken helpers import in all controllers.
// The original patch-pagination.js placed the import inside multi-line
// import blocks (e.g. `import { ... } from "push.service.js"`), causing
// SyntaxError: Unexpected reserved word.
//
// This script:
//   1. Removes any existing (broken or correct) helpers import from each file
//   2. Finds the TRUE end of all imports using brace-counting
//   3. Re-inserts the helpers import correctly at the right position
//
// Run from project root:  node fix-imports.js
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
const DRY = process.argv.includes("--dry");
const LINE = "─".repeat(72);

const HELPERS_IMPORT = `import { paginate, paginationMeta, fullName, formatCurrency, truncate, slugify, uniqueRef, parseJSON, extractIP, timeAgo, safeUser } from "../utils/helpers.js";`;

// ─── Find the index of the last line that belongs to an import block ──────────
// Uses brace-counting to correctly handle multi-line imports like:
//   import {
//     foo,
//     bar,
//   } from "somewhere.js";
function findLastImportLineIndex(lines) {
  let lastEnd = -1;
  let depth = 0; // open brace depth while inside a multi-line import

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Skip blank lines and comments before first import
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*")
    ) {
      continue;
    }

    // Once we hit a non-import, non-blank, non-comment line OUTSIDE an import
    // block and we've already seen imports, we're done.
    if (depth === 0 && lastEnd >= 0 && !/^import\s/.test(trimmed)) {
      break;
    }

    if (/^import\s/.test(trimmed)) {
      // Count braces on this line
      const opens = (lines[i].match(/\{/g) || []).length;
      const closes = (lines[i].match(/\}/g) || []).length;
      depth += opens - closes;

      if (depth <= 0) {
        // Single-line import, or multi-line that closes on the same line
        lastEnd = i;
        depth = 0;
      }
      // If depth > 0 we're inside a multi-line import — keep going
      continue;
    }

    if (depth > 0) {
      // We're inside a multi-line import block — track braces until it closes
      const opens = (lines[i].match(/\{/g) || []).length;
      const closes = (lines[i].match(/\}/g) || []).length;
      depth += opens - closes;

      if (depth <= 0) {
        lastEnd = i;
        depth = 0;
      }
    }
  }

  return lastEnd;
}

// ─── Remove ALL occurrences of the helpers import from the file ───────────────
// Handles both single-line and any stray partial lines that got inserted
function removeExistingHelpersImport(lines) {
  const filtered = [];
  let removed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Remove the import line itself (however it was inserted)
    if (
      /from\s+["']\.\.\/utils\/helpers\.js["']/.test(line) &&
      /^import\s/.test(line.trim())
    ) {
      removed++;
      // Also skip the following blank line if any
      if (i + 1 < lines.length && lines[i + 1].trim() === "") {
        i++;
      }
      continue;
    }

    // Remove any stray import line that appears INSIDE another import block
    // (the specific bug: line starts with `import {` but is inside another block)
    filtered.push(line);
  }

  return { lines: filtered, removed };
}

async function processFile(file) {
  const filePath = join(CTRL_DIR, file);
  const original = await readFile(filePath, "utf8");
  let lines = original.split("\n");

  // Step 1: Remove any existing helpers import (broken or otherwise)
  const { lines: cleaned, removed: removedCount } =
    removeExistingHelpersImport(lines);
  lines = cleaned;

  // Step 2: Find the true end of all imports
  const insertAfter = findLastImportLineIndex(lines);

  if (insertAfter < 0) {
    // No imports found at all — prepend
    lines.unshift(HELPERS_IMPORT);
  } else {
    lines.splice(insertAfter + 1, 0, HELPERS_IMPORT);
  }

  const result = lines.join("\n");
  const changed = result !== original;

  return {
    content: result,
    changed,
    removedCount,
    insertedAt: insertAfter + 1,
  };
}

async function run() {
  console.log();
  console.log("SkilledProz — Fix Helpers Import Placement");
  console.log(`Mode: ${DRY ? "DRY RUN (no files written)" : "LIVE"}`);
  console.log(LINE);

  const files = (await readdir(CTRL_DIR))
    .filter((f) => f.endsWith(".js") && !f.endsWith(".bak"))
    .sort();

  let fixed = 0;
  let skipped = 0;

  for (const file of files) {
    const { content, changed, removedCount, insertedAt } =
      await processFile(file);

    if (!changed) {
      console.log(`  ⏭  ${file.padEnd(45)} no change`);
      skipped++;
      continue;
    }

    console.log(`  ✅  ${file}`);
    if (removedCount > 0) {
      console.log(`       removed ${removedCount} existing helpers import(s)`);
    }
    console.log(`       inserted helpers import at line ${insertedAt + 1}`);

    if (!DRY) {
      await copyFile(join(CTRL_DIR, file), `${join(CTRL_DIR, file)}.bak`);
      await writeFile(join(CTRL_DIR, file), content, "utf8");
    }

    fixed++;
  }

  console.log();
  console.log(LINE);
  console.log(`  Fixed   : ${fixed}`);
  console.log(`  Skipped : ${skipped}`);
  if (DRY) {
    console.log("  ⚠️  DRY RUN — run without --dry to apply.");
  }
  console.log(LINE);
  console.log();
}

run().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

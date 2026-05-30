#!/usr/bin/env node
// fix-conflicts.js
// ─────────────────────────────────────────────────────────────────────────────
// Scans all controllers for local function/const definitions that now conflict
// with names imported from helpers.js, then removes the local duplicates.
//
// Run from project root:  node fix-conflicts.js
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

// ── Names exported by helpers.js that might be re-defined locally ─────────────
const HELPER_NAMES = [
  "uniqueRef",
  "slugify",
  "paginate",
  "parseJSON",
  "fullName",
  "formatCurrency",
  "truncate",
  "extractIP",
  "timeAgo",
  "safeUser",
  "generateReferralCode",
  "generateOTP",
  "paginationMeta",
];

// ── Patterns that define a function locally ───────────────────────────────────
// Matches single-line and multi-line function/const declarations
function buildRemovalPattern(name) {
  return [
    // function NAME(...) { ... }  — multi-line, greedy up to closing brace
    new RegExp(
      `\\/\\/ [^\n]*\\n\\s*function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}\\n?`,
      "g",
    ),
    // function NAME(...) { ... }  — without leading comment
    new RegExp(`\\nfunction\\s+${name}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}`, "g"),
    // const NAME = (...) => { ... }  — arrow function
    new RegExp(
      `\\nconst\\s+${name}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*\\{[^}]*\\};?`,
      "g",
    ),
    // const NAME = function(...) { ... }
    new RegExp(`\\nconst\\s+${name}\\s*=\\s*function[^{]*\\{[^}]*\\};?`, "g"),
  ];
}

// More reliable: line-by-line block remover
function removeLocalDefinition(content, name) {
  const lines = content.split("\n");
  const result = [];
  let i = 0;
  let removed = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Detect start of a local definition
    const isLocalDef =
      new RegExp(`^\\s*function\\s+${name}\\s*\\(`).test(line) ||
      new RegExp(`^\\s*const\\s+${name}\\s*=`).test(line) ||
      new RegExp(`^\\s*export\\s+function\\s+${name}\\s*\\(`).test(line);

    if (isLocalDef) {
      // Skip forward to find matching closing brace
      let depth = 0;
      let started = false;
      let j = i;

      // Also skip any immediately preceding comment line
      if (result.length > 0) {
        const prev = result[result.length - 1].trim();
        if (
          prev.startsWith("//") ||
          prev.startsWith("/*") ||
          prev.startsWith("*")
        ) {
          result.pop(); // remove the comment too
        }
      }

      while (j < lines.length) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === "{") {
            depth++;
            started = true;
          }
          if (ch === "}") depth--;
        }
        j++;
        if (started && depth === 0) break;
      }

      // Skip blank line after the removed block
      if (j < lines.length && lines[j].trim() === "") j++;

      removed++;
      i = j;
      continue;
    }

    result.push(line);
    i++;
  }

  return { content: result.join("\n"), removed };
}

async function run() {
  console.log();
  console.log("SkilledProz — Conflict Fix Script");
  console.log(`Mode    : ${DRY ? "DRY RUN" : "LIVE"}`);
  console.log(LINE);

  const files = (await readdir(CTRL_DIR))
    .filter((f) => f.endsWith(".js") && !f.endsWith(".bak"))
    .sort();

  let totalFiles = 0;
  let totalRemoved = 0;

  for (const file of files) {
    const filePath = join(CTRL_DIR, file);
    let content = await readFile(filePath, "utf8");

    // Only process files that import from helpers.js
    if (!/from\s+["']\.\.\/utils\/helpers\.js["']/.test(content)) continue;

    // Extract which helpers are imported in this file
    const importMatch = content.match(
      /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/utils\/helpers\.js["']/,
    );
    if (!importMatch) continue;

    const importedNames = importMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => HELPER_NAMES.includes(s));

    const fileChanges = [];
    let modified = false;

    for (const name of importedNames) {
      // Check if this name is also locally defined
      const isLocallyDefined =
        new RegExp(`^\\s*function\\s+${name}\\s*\\(`, "m").test(content) ||
        new RegExp(`^\\s*const\\s+${name}\\s*=`, "m").test(content);

      if (!isLocallyDefined) continue;

      const { content: patched, removed } = removeLocalDefinition(
        content,
        name,
      );
      if (removed > 0) {
        content = patched;
        fileChanges.push({ name, removed });
        modified = true;
        totalRemoved += removed;
      }
    }

    if (!modified) continue;

    totalFiles++;
    console.log();
    console.log(`  ✅  ${file}`);
    fileChanges.forEach((c) => {
      console.log(
        `       Removed local definition of: ${c.name} (${c.removed} block${c.removed > 1 ? "s" : ""})`,
      );
    });

    if (!DRY) {
      await copyFile(filePath, `${filePath}.conflict.bak`);
      await writeFile(filePath, content, "utf8");
    }
  }

  console.log();
  console.log(LINE);
  console.log(`  Files fixed         : ${totalFiles}`);
  console.log(`  Local defs removed  : ${totalRemoved}`);
  if (DRY) {
    console.log("  ⚠️  DRY RUN — no files written. Remove --dry to apply.");
  } else if (totalFiles > 0) {
    console.log("  Backups saved as: *.conflict.bak");
  } else {
    console.log("  ✅  Nothing to fix — no conflicts found.");
  }
  console.log(LINE);
  console.log();
}

run().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});

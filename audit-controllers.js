#!/usr/bin/env node
// audit-controllers.js
// ─────────────────────────────────────────────────────────────────────────────
// Scans all 25 controllers and reports:
//   1. Every export name per controller
//   2. Every manual pagination pattern (skip, take, pages) with line numbers
//   3. Which helpers are already imported
//   4. Summary of what patch-pagination.js will change
//
// Run from project root:  node audit-controllers.js
// Output saved to:        audit-controllers-report.txt
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC =
  [join(__dirname, "src"), join(__dirname, "../src")].find(existsSync) ??
  join(__dirname, "src");
const CTRL_DIR = join(SRC, "controllers");

const LINE = "─".repeat(80);
const lines = [];
function out(s = "") {
  console.log(s);
  lines.push(s);
}

// ── Patterns to detect ────────────────────────────────────────────────────────
const PATTERNS = {
  skipCalc:
    /const\s+skip\s*=\s*\((?:parseInt|Number)\s*\(\s*page\s*\)\s*-\s*1\)\s*\*\s*(?:parseInt|Number)\s*\(\s*limit\s*\)/,
  skipSimple:
    /const\s+skip\s*=\s*\(\s*(?:page|p)\s*-\s*1\)\s*\*\s*(?:limit|l)\b/,
  takeLimit: /take\s*:\s*(?:parseInt|Number)\s*\(\s*limit\s*\)/,
  pagesCalc:
    /pages\s*:\s*Math\.ceil\s*\(\s*total\s*\/\s*(?:parseInt|Number)?\s*\(?\s*limit\s*\)?/,
  pageIntParse: /page\s*:\s*(?:parseInt|Number)\s*\(\s*page\s*\)/,
  queryDestructure: /const\s*\{[^}]*(?:page|limit)[^}]*\}\s*=\s*req\.query/,
  skipSkip: /skip\s*,/,
  helperImport: /from\s+["']\.\.\/utils\/helpers\.js["']/,
};

function matchLines(content, pattern) {
  const hits = [];
  content.split("\n").forEach((line, i) => {
    if (pattern.test(line)) hits.push({ ln: i + 1, text: line.trim() });
  });
  return hits;
}

async function run() {
  out();
  out("SkilledProz — Controller Audit Report");
  out(`Generated : ${new Date().toLocaleString()}`);
  out(`Controllers dir: ${CTRL_DIR}`);
  out(LINE);

  const files = (await readdir(CTRL_DIR))
    .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
    .sort();

  let totalControllers = 0;
  let needsPatch = 0;
  let alreadyImports = 0;
  const patchTargets = [];

  for (const file of files) {
    totalControllers++;
    const content = await readFile(join(CTRL_DIR, file), "utf8");
    const allLines = content.split("\n");

    // Count exports
    const exports = (
      content.match(
        /^export\s+(?:const|async\s+function|function)\s+(\w+)/gm,
      ) || []
    ).length;

    // Detect patterns
    const skipLines = matchLines(content, PATTERNS.skipCalc).concat(
      matchLines(content, PATTERNS.skipSimple),
    );
    const takeLines = matchLines(content, PATTERNS.takeLimit);
    const pagesLines = matchLines(content, PATTERNS.pagesCalc);
    const pageLines = matchLines(content, PATTERNS.pageIntParse);
    const hasHelper = PATTERNS.helperImport.test(content);
    const queryLines = matchLines(content, PATTERNS.queryDestructure);

    const hasPagination = skipLines.length > 0;

    out();
    out(`  ┌─ ${file}  (${exports} export${exports !== 1 ? "s" : ""})`);
    out(`  │   helpers imported : ${hasHelper ? "✅ yes" : "❌ no"}`);

    if (hasPagination) {
      out(`  │   ── PAGINATION FOUND ──────────────────────────────`);

      if (queryLines.length > 0) {
        out(`  │   📥 req.query destructure:`);
        queryLines.forEach((h) => out(`  │      L${h.ln}: ${h.text}`));
      }

      out(`  │   🔢 skip calculations (${skipLines.length}):`);
      skipLines.forEach((h) => out(`  │      L${h.ln}: ${h.text}`));

      if (takeLines.length > 0) {
        out(
          `  │   📤 take: parseInt(limit) (${takeLines.length} occurrences):`,
        );
        takeLines.forEach((h) => out(`  │      L${h.ln}: ${h.text}`));
      }
      if (pagesLines.length > 0) {
        out(
          `  │   📄 pages: Math.ceil(...) (${pagesLines.length} occurrences):`,
        );
        pagesLines.forEach((h) => out(`  │      L${h.ln}: ${h.text}`));
      }
      if (pageLines.length > 0) {
        out(`  │   🔢 page: parseInt(page) (${pageLines.length} occurrences):`);
        pageLines.forEach((h) => out(`  │      L${h.ln}: ${h.text}`));
      }

      if (!hasHelper) {
        out(`  │   ⚠️  WILL BE PATCHED by patch-pagination.js`);
        needsPatch++;
        patchTargets.push({
          file,
          skipLines,
          takeLines,
          pagesLines,
          pageLines,
        });
      } else {
        out(`  │   ✅  helpers already imported`);
        alreadyImports++;
        patchTargets.push({
          file,
          skipLines,
          takeLines,
          pagesLines,
          pageLines,
        });
      }
    } else {
      out(`  │   ✅  no manual pagination`);
    }

    out(`  └${"─".repeat(60)}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  out();
  out(LINE);
  out("SUMMARY");
  out(LINE);
  out(`  Total controllers   : ${totalControllers}`);
  out(`  Need patch          : ${needsPatch}`);
  out(`  Already use helpers : ${alreadyImports}`);
  out();
  out("  FILES THAT WILL BE PATCHED:");
  patchTargets.forEach((t) => {
    const count = t.skipLines.length;
    out(
      `    ${t.file.padEnd(40)} ${count} skip line${count !== 1 ? "s" : ""} to replace`,
    );
  });

  out();
  out("  WHAT patch-pagination.js WILL DO:");
  out(
    "    1. Add: import { paginate, paginationMeta, fullName, ... } from '../utils/helpers.js'",
  );
  out("    2. Replace every:");
  out("         const skip = (parseInt(page) - 1) * parseInt(limit);");
  out("       With:");
  out("         const { skip, take } = paginate(page, limit);");
  out("    3. Replace every:");
  out("         take: parseInt(limit),");
  out("       With:");
  out("         take,");
  out("    4. Replace every:");
  out("         pages: Math.ceil(total / parseInt(limit)),");
  out("       With:");
  out("         pages: Math.ceil(total / take),");
  out("    5. Replace every:");
  out("         page: parseInt(page),");
  out("       With:");
  out(
    "         page,  (uses the p variable from paginate destructure if present)",
  );
  out();
  out(LINE);

  const report = lines.join("\n");
  const outPath = join(__dirname, "audit-controllers-report.txt");
  await writeFile(outPath, report, "utf8");
  out(`Report saved to: ${outPath}`);
  out(LINE);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

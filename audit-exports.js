#!/usr/bin/env node
// audit-exports.js
// ─────────────────────────────────────────────────────────────────────────────
// Scans every controller in src/controllers/ and every route in src/routes/,
// then reports:
//   1. All exported function names per controller
//   2. Every import in every route that does NOT exist in its controller
//   3. The nearest-match suggestion for each broken import
//
// Run from project root:
//   node audit-exports.js
//
// Output is also saved to:  audit-exports-report.txt
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Locate src/ ──────────────────────────────────────────────────────────────
const candidates = [
  join(__dirname, "src"),
  join(__dirname, "..", "src"),
  join(__dirname, "skilledpro-backend", "src"),
];
const SRC = candidates.find(existsSync) ?? join(__dirname, "src");
const CONTROLLERS_DIR = join(SRC, "controllers");
const ROUTES_DIR = join(SRC, "routes");

const LINE = "─".repeat(80);
const lines = []; // collects output for the text file

function out(str = "") {
  console.log(str);
  lines.push(str);
}

// ── Extract exported names from a JS file ────────────────────────────────────
async function getExports(filepath) {
  const src = await readFile(filepath, "utf8");
  const found = new Set();

  const patterns = [
    /^export\s+const\s+(\w+)\s*=/gm, // export const foo =
    /^export\s+async\s+function\s+(\w+)/gm, // export async function foo
    /^export\s+function\s+(\w+)/gm, // export function foo
    /exports\.(\w+)\s*=/gm, // CJS exports.foo = (fallback)
    /module\.exports\s*=\s*\{([^}]+)\}/gm, // CJS module.exports = { foo }
  ];

  for (const pattern of patterns) {
    if (pattern.source.includes("module")) {
      // Handle module.exports = { a, b }
      const m = pattern.exec(src);
      if (m) {
        m[1].split(",").forEach((name) => {
          const n = name.trim().split(":")[0].trim();
          if (n && /^\w+$/.test(n)) found.add(n);
        });
      }
      continue;
    }
    let m;
    const re = new RegExp(pattern.source, pattern.flags);
    while ((m = re.exec(src)) !== null) {
      if (m[1]) found.add(m[1]);
    }
  }

  return [...found].sort();
}

// ── Extract { named } imports from controller files in a route ───────────────
async function getControllerImports(filepath) {
  const src = await readFile(filepath, "utf8");
  const result = {}; // { 'worker.controller.js': ['fn1', 'fn2'] }

  // Match:  import { a, b, c } from '../controllers/xyz.controller.js'
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]*controller[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const names = m[1]
      .split(",")
      .map((n) =>
        n
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      ) // handle `foo as bar`
      .filter((n) => /^\w+$/.test(n));
    const file = basename(m[2]);
    if (!result[file]) result[file] = [];
    result[file].push(...names);
  }
  return result;
}

// ── Levenshtein distance for fuzzy matching ───────────────────────────────────
function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[a.length][b.length];
}

function bestMatches(missing, available, max = 3) {
  return available
    .map((a) => ({
      name: a,
      score: lev(missing.toLowerCase(), a.toLowerCase()),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, max)
    .filter((x) => x.score <= Math.max(missing.length * 0.6, 4))
    .map((x) => x.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
out();
out("SkilledProz — Controller Export & Route Import Audit");
out(`Generated : ${new Date().toLocaleString()}`);
out(`src dir   : ${SRC}`);
out(LINE);

// ── 1. Read all controllers ──────────────────────────────────────────────────
const controllerFiles = (await readdir(CONTROLLERS_DIR))
  .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
  .sort();

const controllerMap = {}; // { 'worker.controller.js': ['fn1', ...] }

out();
out("§ 1  ALL CONTROLLER EXPORTS");
out(LINE);

for (const file of controllerFiles) {
  const filepath = join(CONTROLLERS_DIR, file);
  const exports = await getExports(filepath);
  controllerMap[file] = exports;

  out();
  out(
    `  ┌─ ${file}  (${exports.length} export${exports.length !== 1 ? "s" : ""})`,
  );
  if (exports.length === 0) {
    out(`  │   (no exports found — file may use default export or be empty)`);
  } else {
    exports.forEach((e) => out(`  │   ${e}`));
  }
  out(`  └${"─".repeat(60)}`);
}

// ── 2. Check every route file ────────────────────────────────────────────────
const routeFiles = (await readdir(ROUTES_DIR))
  .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
  .sort();

const allMismatches = [];
const allClean = [];

out();
out();
out("§ 2  ROUTE IMPORT MISMATCH REPORT");
out(LINE);

for (const routeFile of routeFiles) {
  const routePath = join(ROUTES_DIR, routeFile);
  const imports = await getControllerImports(routePath);

  const routeMismatches = [];

  for (const [controllerFile, importedNames] of Object.entries(imports)) {
    const available = controllerMap[controllerFile];
    if (!available) {
      // Controller file not found at all
      routeMismatches.push({
        controllerFile,
        importedNames,
        mismatches: importedNames.map((n) => ({ missing: n, suggestions: [] })),
        available: [],
      });
      continue;
    }

    const missing = importedNames.filter((n) => !available.includes(n));
    if (missing.length > 0) {
      routeMismatches.push({
        controllerFile,
        importedNames,
        mismatches: missing.map((n) => ({
          missing: n,
          suggestions: bestMatches(n, available),
        })),
        available,
      });
    }
  }

  if (routeMismatches.length === 0) {
    allClean.push(routeFile);
  } else {
    allMismatches.push({ routeFile, routeMismatches });
    out();
    out(`  ❌  ${routeFile}`);
    for (const { controllerFile, mismatches, available } of routeMismatches) {
      out(`       importing from: ${controllerFile}`);
      for (const { missing, suggestions } of mismatches) {
        const hint =
          suggestions.length > 0
            ? `  → did you mean: ${suggestions.map((s) => `"${s}"`).join(" | ")}`
            : "  → no close match found";
        out(`         ✗  "${missing}"${hint}`);
      }
      out(
        `       available exports: ${available.slice(0, 15).join(", ")}${available.length > 15 ? ` … (${available.length} total)` : ""}`,
      );
    }
  }
}

out();
out();
out("§ 3  CLEAN ROUTE FILES (no import errors)");
out(LINE);
allClean.forEach((f) => out(`  ✅  ${f}`));

out();
out();
out("§ 4  SUMMARY");
out(LINE);
out(`  Controllers scanned : ${controllerFiles.length}`);
out(`  Route files scanned : ${routeFiles.length}`);
out(`  Routes with errors  : ${allMismatches.length}`);
out(`  Clean routes        : ${allClean.length}`);
out();
if (allMismatches.length > 0) {
  out("  BROKEN IMPORTS AT A GLANCE:");
  for (const { routeFile, routeMismatches } of allMismatches) {
    for (const { controllerFile, mismatches } of routeMismatches) {
      for (const { missing, suggestions } of mismatches) {
        const fix = suggestions[0]
          ? ` → fix: "${suggestions[0]}"`
          : " → needs manual check";
        out(
          `    ${routeFile}  imports "${missing}" from ${controllerFile}${fix}`,
        );
      }
    }
  }
}

out();
out(LINE);
out(`Report saved to: audit-exports-report.txt`);
out(LINE);
out();

// ── Save to file ──────────────────────────────────────────────────────────────
await writeFile(
  join(__dirname, "audit-exports-report.txt"),
  lines.join("\n"),
  "utf8",
);

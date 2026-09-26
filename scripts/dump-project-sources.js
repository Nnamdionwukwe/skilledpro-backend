#!/usr/bin/env node
/**
 * scripts/dump-project-sources.js  (ESM version)
 *
 * Walks a set of well-known directories in the project root and prints
 * every file's contents to stdout with clear separators.
 *
 * Default targets (relative to CWD):
 *   - db-scripts/controllers
 *   - db-scripts
 *   - scripts
 *
 * Usage:
 *   node scripts/dump-project-sources.js
 *   node scripts/dump-project-sources.js db-scripts scripts
 *   node scripts/dump-project-sources.js --out dumps/sources.txt
 *   node scripts/dump-project-sources.js --ext .js,.ts
 *   node scripts/dump-project-sources.js --no-color
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ── CLI parsing ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

const flags = { out: null, ext: null, noColor: false, help: false };
const targets = [];

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") flags.help = true;
  else if (a === "--no-color") flags.noColor = true;
  else if (a === "--out" || a === "-o") flags.out = argv[++i];
  else if (a === "--ext" || a === "-e")
    flags.ext = argv[++i]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  else targets.push(a);
}

if (flags.help) {
  console.log(
    "Usage: node scripts/dump-project-sources.js [dirs...] [--out FILE] [--ext .js,.ts] [--no-color]",
  );
  process.exit(0);
}

const DEFAULT_TARGETS = ["db-scripts/controllers", "db-scripts", "scripts"];
const ROOT = process.cwd();
const DIRS = (targets.length ? targets : DEFAULT_TARGETS).map((d) =>
  path.resolve(ROOT, d),
);

const EXTENSIONS = flags.ext || [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".prisma",
  ".sql",
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".turbo",
  ".vercel",
  ".netlify",
  "generated",
]);

// ── Colours ─────────────────────────────────────────────────────────────────
const useColor = !flags.noColor && process.stdout.isTTY;
const C = {
  reset: useColor ? "\x1b[0m" : "",
  dim: useColor ? "\x1b[2m" : "",
  bold: useColor ? "\x1b[1m" : "",
  cyan: useColor ? "\x1b[36m" : "",
  yellow: useColor ? "\x1b[33m" : "",
  green: useColor ? "\x1b[32m" : "",
  magenta: useColor ? "\x1b[35m" : "",
  red: useColor ? "\x1b[31m" : "",
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}
function isFile(p) {
  const st = safeStat(p);
  return st && st.isFile();
}
function isDir(p) {
  const st = safeStat(p);
  return st && st.isDirectory();
}
function hasExt(p) {
  return EXTENSIONS.includes(path.extname(p).toLowerCase());
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    out.push({ error: `Cannot read directory: ${dir} — ${e.message}` });
    return;
  }
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && hasExt(full)) out.push({ file: full });
  }
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (e) {
    return `⚠️  Could not read file: ${e.message}`;
  }
}
function relative(p) {
  const r = path.relative(ROOT, p);
  return r.startsWith("..") ? p : r;
}
function countLines(text) {
  return text ? text.split("\n").length : 0;
}
function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  const chunks = [];
  const push = (s = "") => chunks.push(s);

  const startedAt = new Date();
  push(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  push(`${C.bold}  PROJECT SOURCE DUMP${C.reset}`);
  push(`  Started: ${startedAt.toISOString()}`);
  push(`  Root:    ${ROOT}`);
  push(`  Exts:    ${EXTENSIONS.join(", ")}`);
  push(`  Targets:`);
  for (const d of DIRS) push(`    - ${relative(d)}`);
  push(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  push("");

  const summary = [];

  for (const dir of DIRS) {
    push("");
    push(
      `${C.magenta}▶ ${relative(dir)}${C.reset} ${C.dim}(${isDir(dir) ? "directory" : "missing"})${C.reset}`,
    );

    if (!isDir(dir)) {
      push(`  ${C.red}✗ skipped — not a directory or does not exist${C.reset}`);
      summary.push({ dir: relative(dir), files: 0, bytes: 0, missing: true });
      continue;
    }

    const hits = [];
    walk(dir, hits);

    const onlyFiles = hits.filter((h) => h.file);
    const errors = hits.filter((h) => h.error);

    for (const e of errors) push(`  ${C.red}${e.error}${C.reset}`);
    if (onlyFiles.length === 0) push(`  ${C.dim}(no matching files)${C.reset}`);

    let dirBytes = 0;

    for (const { file } of onlyFiles) {
      const content = readFileSafe(file);
      let size = 0;
      try {
        size = fs.statSync(file).size;
      } catch {}
      dirBytes += size;

      push("");
      push(
        `${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
      );
      push(`${C.bold}📄 ${relative(file)}${C.reset}`);
      push(
        `${C.dim}   ${humanBytes(size)} · ${countLines(content)} lines${C.reset}`,
      );
      push(
        `${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
      );
      push(content);
      if (!content.endsWith("\n")) push("");
    }

    summary.push({
      dir: relative(dir),
      files: onlyFiles.length,
      bytes: dirBytes,
    });
  }

  push("");
  push(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );
  push(`${C.bold}  SUMMARY${C.reset}`);
  push(
    `${C.bold}══════════════════════════════════════════════════════════════${C.reset}`,
  );

  let totalFiles = 0,
    totalBytes = 0;
  for (const s of summary) {
    totalFiles += s.files;
    totalBytes += s.bytes;
    const flag = s.missing ? `${C.red}(missing)${C.reset}` : "";
    push(
      `  ${s.dir.padEnd(40)} ${String(s.files).padStart(4)} files  ${humanBytes(s.bytes).padStart(10)}  ${flag}`,
    );
  }
  push(
    `  ${C.bold}${"TOTAL".padEnd(40)} ${String(totalFiles).padStart(4)} files  ${humanBytes(totalBytes).padStart(10)}${C.reset}`,
  );
  push(`  Elapsed: ${Date.now() - startedAt.getTime()} ms`);
  push("");

  const output = chunks.join("\n");

  if (flags.out) {
    const outPath = path.resolve(ROOT, flags.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
    console.error(
      `${C.green}✓ Wrote ${humanBytes(Buffer.byteLength(output))} to ${flags.out}${C.reset}`,
    );
  } else {
    process.stdout.write(output);
  }
}

main();

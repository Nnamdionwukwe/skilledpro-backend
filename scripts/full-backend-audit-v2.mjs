#!/usr/bin/env node
// full-backend-audit-v2.mjs — deep backend audit
// Run from BACKEND project root:
//   node scripts/full-backend-audit-v2.mjs
//   node scripts/full-backend-audit-v2.mjs --output report.txt

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const PRISMA = path.join(ROOT, "prisma", "schema.prisma");
const PKG = path.join(ROOT, "package.json");

const ARGS = process.argv.slice(2);
const OUT_FILE = ARGS.includes("--output")
  ? ARGS[ARGS.indexOf("--output") + 1]
  : null;

const LINE = "=".repeat(80);
const THIN = "-".repeat(80);
const lines = [];

function out(s = "") {
  lines.push(s);
  process.stdout.write(s + "\n");
}
function read(f) {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return "";
  }
}
function rel(f) {
  return path.relative(ROOT, f).split(path.sep).join("/");
}
function walk(dir, exts = [".js", ".mjs", ".cjs", ".ts"]) {
  const r = [];
  if (!fs.existsSync(dir)) return r;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".git", "dist", "build", ".next"].includes(e.name))
        continue;
      r.push(...walk(full, exts));
    } else if (exts.some((x) => e.name.endsWith(x))) {
      r.push(full);
    }
  }
  return r;
}
function lineCount(t) {
  return t ? t.split("\n").length : 0;
}

// ── Header ─────────────────────────────────────────────────────────────────
out(LINE);
out("  SKILLEDPROZ - FULL BACKEND AUDIT v2");
out("  " + new Date().toLocaleString());
out("  Root: " + ROOT);
out(LINE);

if (!fs.existsSync(SRC)) {
  console.error("src/ not found - run from backend project root");
  process.exit(1);
}

// ── §1 INVENTORY ──────────────────────────────────────────────────────────
const allJsFiles = walk(SRC);
const controllerFiles = allJsFiles.filter((f) => f.includes("/controllers/"));
const routeFiles = allJsFiles.filter((f) => f.includes("/routes/"));
const serviceFiles = allJsFiles.filter((f) => f.includes("/services/"));
const middlewareFiles = allJsFiles.filter((f) => f.includes("/middleware/"));
const utilFiles = allJsFiles.filter((f) => f.includes("/utils/"));
const configFiles = allJsFiles.filter((f) => f.includes("/config/"));
const scriptFiles = walk(path.join(ROOT, "scripts"));

out("\n" + THIN);
out("  §1  PROJECT INVENTORY");
out(THIN);
out("  Controllers : " + controllerFiles.length);
out("  Routes      : " + routeFiles.length);
out("  Services    : " + serviceFiles.length);
out("  Middleware  : " + middlewareFiles.length);
out("  Utils       : " + utilFiles.length);
out("  Config      : " + configFiles.length);
out("  Scripts     : " + scriptFiles.length);
out("  Total JS/TS : " + allJsFiles.length);

let totalLines = 0;
for (const f of allJsFiles) totalLines += lineCount(read(f));
out("  Total lines : " + totalLines);

out("\n  Largest files:");
const sized = allJsFiles
  .map((f) => ({ f, n: lineCount(read(f)) }))
  .sort((a, b) => b.n - a.n);
for (const { f, n } of sized.slice(0, 15)) {
  out("    " + String(n).padStart(6) + "  " + rel(f));
}

// ── §2 SYNTAX ─────────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §2  SYNTAX VALIDATION (node --check)");
out(THIN);

const syntaxErrors = [];
for (const f of allJsFiles) {
  try {
    execSync("node --check " + JSON.stringify(f), {
      stdio: "pipe",
      timeout: 8000,
    });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString() : e.message)
      .split("\n")
      .slice(0, 3)
      .join(" | ");
    syntaxErrors.push({ file: rel(f), error: msg });
  }
}

if (syntaxErrors.length === 0) {
  out("  OK  All " + allJsFiles.length + " files pass node --check");
} else {
  out("  " + syntaxErrors.length + " syntax error(s):");
  for (const { file, error } of syntaxErrors) {
    out("    X " + file);
    out("        " + error);
  }
}

// ── §3 PRISMA ─────────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §3  PRISMA SCHEMA");
out(THIN);

if (fs.existsSync(PRISMA)) {
  const schema = read(PRISMA);
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
  const enums = [...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]);

  out("  Models (" + models.length + "): " + models.join(", "));
  out("  Enums  (" + enums.length + "): " + enums.join(", "));

  const noId = [];
  for (const model of models) {
    const re = new RegExp(
      "model\\s+" + model + "\\s*\\{([\\s\\S]*?)\\n\\}",
      "m",
    );
    const m = schema.match(re);
    if (m && !/@id\b|@@id\b/.test(m[1])) noId.push(model);
  }
  out(
    noId.length === 0
      ? "  OK  All models have @id"
      : "  MISSING @id: " + noId.join(", "),
  );

  try {
    const res = execSync("npx prisma validate 2>&1", {
      cwd: ROOT,
      timeout: 30000,
    }).toString();
    if (res.includes("valid")) out("  OK  prisma validate passes");
    else out("  WARN  prisma validate: " + res.slice(0, 200));
  } catch (e) {
    out("  WARN  prisma validate failed (may need live DB / .env):");
    const msg = (e.stdout ? e.stdout.toString() : e.message).split("\n")[0];
    out("      " + msg);
  }
} else {
  out("  MISSING prisma/schema.prisma");
}

// ── §4 ROUTE ↔ CONTROLLER WIRING ──────────────────────────────────────────
out("\n" + THIN);
out("  §4  ROUTE to CONTROLLER WIRING");
out(THIN);

const controllerExports = new Map();
for (const f of controllerFiles) {
  const c = read(f);
  for (const m of c.matchAll(
    /export\s+(?:async\s+)?(?:const|function)\s+(\w+)/g,
  )) {
    controllerExports.set(m[1], rel(f));
  }
  for (const m of c.matchAll(/export\s*\{\s*([^}]+)\}/g)) {
    for (const name of m[1].split(",").map((s) =>
      s
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim(),
    )) {
      if (name) controllerExports.set(name, rel(f));
    }
  }
}

const routeHandlers = [];
for (const f of routeFiles) {
  const c = read(f);
  const re =
    /router\.(get|post|put|patch|delete)\s*\(\s*["'\u0060]([^"'\u0060]+)["'\u0060]\s*,([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    const [, method, routePath, tail] = m;
    const parts = tail
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const last = parts[parts.length - 1] || "";
    const handler = last.replace(/\(.*$/, "").trim();
    routeHandlers.push({
      method: method.toUpperCase(),
      path: routePath,
      handler,
      file: rel(f),
    });
  }
}

const brokenHandlers = [];
const seenHandlers = new Set();
for (const r of routeHandlers) {
  if (!r.handler || r.handler.startsWith("(") || r.handler.includes("=>"))
    continue;
  if (seenHandlers.has(r.handler)) continue;
  seenHandlers.add(r.handler);
  if (!controllerExports.has(r.handler)) brokenHandlers.push(r);
}

out("  Routes parsed       : " + routeHandlers.length);
out("  Controller exports  : " + controllerExports.size);
if (brokenHandlers.length === 0) {
  out("  OK  All route handlers resolve to a controller export");
} else {
  out("  " + brokenHandlers.length + " route handler(s) not found:");
  for (const b of brokenHandlers) {
    out(
      "    " +
        b.method.padEnd(7) +
        " " +
        b.path.padEnd(40) +
        " -> " +
        (b.handler || "?") +
        "  (" +
        b.file +
        ")",
    );
  }
}

// ── §5 APP MOUNTS ─────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §5  APP MOUNTS & MIDDLEWARE");
out(THIN);

const appFile = fs.existsSync(path.join(SRC, "app.js"))
  ? path.join(SRC, "app.js")
  : path.join(SRC, "server.js");

if (fs.existsSync(appFile)) {
  const appSrc = read(appFile);
  const mounts = [
    ...appSrc.matchAll(
      /app\.use\s*\(\s*["'\u0060]([^"'\u0060]+)["'\u0060]\s*,\s*(\w+)/g,
    ),
  ];
  out("  app.use mounts (" + mounts.length + "):");
  for (const [, p, r] of mounts) out("    " + p.padEnd(30) + " <- " + r);

  const checks = [
    ["helmet", /helmet\s*\(/],
    ["cors", /cors\s*\(/],
    ["express.json", /express\.json\s*\(/],
    ["rateLimit", /rateLimit|express-rate-limit/],
    ["logger (morgan/winston/pino)", /morgan|winston|pino/],
    ["errorHandler", /errorHandler|error\.middleware|errorMiddleware/],
  ];
  out("\n  Middleware presence:");
  for (const [name, re] of checks) {
    out("    " + (re.test(appSrc) ? "OK   " : "MISS ") + name);
  }
} else {
  out("  MISSING app.js");
}

// ── §6 ENV VARS ───────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §6  ENVIRONMENT VARIABLES");
out(THIN);

const envExample = fs.existsSync(path.join(ROOT, ".env.example"))
  ? read(path.join(ROOT, ".env.example"))
  : "";
const declared = new Set(
  (envExample.match(/^([A-Z0-9_]+)\s*=/gm) || []).map((s) =>
    s.replace("=", "").trim(),
  ),
);

const used = new Map();
for (const f of allJsFiles) {
  const c = read(f);
  for (const m of c.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
    if (!used.has(m[1])) used.set(m[1], rel(f));
  }
}

out("  Used in code        : " + used.size);
out("  Declared in .env.ex : " + declared.size);

const missingInExample = [...used.keys()].filter((v) => !declared.has(v));
if (missingInExample.length === 0) {
  out("  OK  Every used env var appears in .env.example");
} else {
  out("  " + missingInExample.length + " used-but-undeclared:");
  for (const v of missingInExample.sort()) {
    out("    " + v.padEnd(40) + " <- " + used.get(v));
  }
}

// ── §7 AUTH / ROLE PROTECTION ─────────────────────────────────────────────
out("\n" + THIN);
out("  §7  AUTH & ROLE PROTECTION");
out(THIN);

let publicRoutes = 0,
  protectedRoutes = 0,
  adminRoutes = 0;
const adminWithoutGuard = [];

for (const f of routeFiles) {
  const c = read(f);
  const re =
    /router\.(get|post|put|patch|delete)\s*\(\s*["'\u0060]([^"'\u0060]+)["'\u0060]\s*,([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    const [, , routePath, tail] = m;
    const hasAuth = /\b(authenticate|requireAuth|protect)\b/.test(tail);
    const hasAdmin =
      /\b(requireAdmin|requireRole\s*\(\s*["']ADMIN|isAdmin|adminOnly)\b/.test(
        tail,
      );
    const isAdminPath = routePath.includes("/admin");

    if (hasAdmin) adminRoutes++;
    else if (hasAuth) protectedRoutes++;
    else publicRoutes++;

    if (isAdminPath && !hasAdmin && !f.includes("admin.routes")) {
      adminWithoutGuard.push({ path: routePath, file: rel(f) });
    }
  }
}

out("  Public routes        : " + publicRoutes);
out("  Authenticated routes : " + protectedRoutes);
out("  Admin-guarded routes : " + adminRoutes);

if (adminWithoutGuard.length === 0) {
  out("  OK  No unguarded admin routes");
} else {
  out(
    "  " +
      adminWithoutGuard.length +
      " admin path(s) in non-admin file WITHOUT guard:",
  );
  for (const r of adminWithoutGuard) {
    out("    " + r.path.padEnd(40) + " (" + r.file + ")");
  }
}

// ── §8 PRISMA CLIENT ──────────────────────────────────────────────────────
out("\n" + THIN);
out("  §8  DATABASE CLIENT USAGE");
out(THIN);

const directPrismaImports = [];
for (const f of allJsFiles) {
  const c = read(f);
  if (/new\s+PrismaClient\s*\(/.test(c) && !f.includes("/config/")) {
    directPrismaImports.push(rel(f));
  }
}
if (directPrismaImports.length === 0) {
  out("  OK  No stray PrismaClient() outside config/");
} else {
  out(
    "  " +
      directPrismaImports.length +
      " file(s) instantiate PrismaClient directly:",
  );
  for (const f of directPrismaImports) out("    " + f);
}

// ── §9 BUG PATTERNS ───────────────────────────────────────────────────────
out("\n" + THIN);
out("  §9  COMMON BUG PATTERNS");
out(THIN);

const bugs = [];
for (const f of allJsFiles) {
  const c = read(f);
  const rf = rel(f);

  const ac = (c.match(/\basync\s+/g) || []).length;
  const tc = (c.match(/\btry\s*\{/g) || []).length;
  if (ac > 5 && tc === 0)
    bugs.push({ file: rf, issue: ac + " async fns, 0 try/catch" });

  if (rf.includes("/controllers/")) {
    const lc = (c.match(/console\.log\s*\(/g) || []).length;
    if (lc > 3)
      bugs.push({ file: rf, issue: lc + " console.log calls in controller" });
  }

  const t = (c.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
  if (t > 0) bugs.push({ file: rf, issue: t + " TODO/FIXME marker(s)" });
}

if (bugs.length === 0) {
  out("  OK  No obvious bug patterns");
} else {
  out("  " + bugs.length + " potential issue(s):");
  for (const b of bugs.slice(0, 30)) out("    " + b.file + " -> " + b.issue);
  if (bugs.length > 30) out("    ... and " + (bugs.length - 30) + " more");
}

// ── §10 PACKAGE ───────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §10  PACKAGE & DEPENDENCIES");
out(THIN);

if (fs.existsSync(PKG)) {
  try {
    const pkg = JSON.parse(read(PKG));
    out("  Name    : " + pkg.name);
    out("  Version : " + pkg.version);
    out("  Scripts : " + Object.keys(pkg.scripts || {}).length);
    out("  Deps    : " + Object.keys(pkg.dependencies || {}).length);
    out("  DevDeps : " + Object.keys(pkg.devDependencies || {}).length);
    out("\n  Scripts:");
    for (const [k, v] of Object.entries(pkg.scripts || {})) {
      out("    " + k.padEnd(20) + " -> " + v);
    }
    for (const [k, v] of Object.entries(pkg.scripts || {})) {
      const m = v.match(
        /(?:node|ts-node|nodemon)\s+(?:--\S+\s+)*([^\s]+\.(?:js|mjs|cjs|ts))/,
      );
      if (m && !fs.existsSync(path.resolve(ROOT, m[1]))) {
        out('  BROKEN  script "' + k + '" -> ' + m[1]);
      }
    }
  } catch (e) {
    out("  INVALID package.json: " + e.message);
  }
} else {
  out("  MISSING package.json");
}

// ── §11 GIT ───────────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §11  GIT STATUS");
out(THIN);

try {
  const branch = execSync("git branch --show-current", {
    cwd: ROOT,
    stdio: "pipe",
  })
    .toString()
    .trim();
  const status = execSync("git status --short", {
    cwd: ROOT,
    stdio: "pipe",
  }).toString();
  const head = execSync("git log -1 --format='%h %s'", {
    cwd: ROOT,
    stdio: "pipe",
  })
    .toString()
    .trim();
  const changed = status.trim().split("\n").filter(Boolean).length;

  out("  Branch      : " + branch);
  out("  HEAD        : " + head);
  out("  Uncommitted : " + changed + " file(s)");
  if (changed > 0) {
    out("\n  Uncommitted (first 20):");
    for (const f of status.trim().split("\n").slice(0, 20)) out("    " + f);
  }
} catch {
  out("  WARN  Not a git repo or git unavailable");
}

// ── §12 TESTS ─────────────────────────────────────────────────────────────
out("\n" + THIN);
out("  §12  TESTS");
out(THIN);

const testFiles = [
  ...walk(path.join(ROOT, "tests")),
  ...walk(path.join(ROOT, "test")),
  ...walk(path.join(ROOT, "__tests__")),
];
out("  Test files : " + testFiles.length);
for (const f of testFiles.slice(0, 20)) out("    " + rel(f));

// ── §13 DUPLICATE ROUTES ──────────────────────────────────────────────────
out("\n" + THIN);
out("  §13  DUPLICATE ROUTE PATHS");
out(THIN);

const pathMap = new Map();
for (const f of routeFiles) {
  const c = read(f);
  const re =
    /router\.(get|post|put|patch|delete)\s*\(\s*["'\u0060]([^"'\u0060]+)["'\u0060]/g;
  let m;
  while ((m = re.exec(c)) !== null) {
    const key = m[1].toUpperCase() + " " + m[2];
    if (!pathMap.has(key)) pathMap.set(key, []);
    pathMap.get(key).push(rel(f));
  }
}

const dupes = [...pathMap.entries()].filter(([, files]) => files.length > 1);
if (dupes.length === 0) {
  out("  OK  No duplicate route paths");
} else {
  out("  " + dupes.length + " duplicated route path(s):");
  for (const [key, files] of dupes) {
    out("  " + key);
    for (const f of files) out("      <- " + f);
  }
}

// ── §14 SUMMARY ───────────────────────────────────────────────────────────
out("\n" + LINE);
out("  SUMMARY");
out(LINE);
out("  Files analysed        : " + allJsFiles.length);
out("  Syntax errors         : " + syntaxErrors.length);
out("  Broken route handlers : " + brokenHandlers.length);
out("  Unguarded admin routes: " + adminWithoutGuard.length);
out("  Direct PrismaClient   : " + directPrismaImports.length);
out("  Bug patterns          : " + bugs.length);
out("  Env vars missing      : " + missingInExample.length);
out("  Duplicate routes      : " + dupes.length);
out("  Test files            : " + testFiles.length);

const critical =
  syntaxErrors.length + brokenHandlers.length + adminWithoutGuard.length;
out(
  critical === 0
    ? "\n  HEALTHY  No critical issues detected"
    : "\n  " + critical + " critical issue(s) — see above",
);

out("\n" + LINE);
out(" Audit complete");
out(LINE + "\n");

if (OUT_FILE) {
  fs.writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  console.log("Report saved to " + OUT_FILE);
}

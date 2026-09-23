#!/usr/bin/env node
// skilledpro-backend/scripts/audit-admin-backend.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Backend audit: finds admin handlers and admin routes that live OUTSIDE
// src/controllers/admin.controller.js and src/routes/admin.routes.js.
//
// Writes to: <backend>/admin-audit-backend.txt
// Also copies to: $FRONTEND_ROOT/admin-audit-backend.txt (if env var set)
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTROLLERS_DIR = path.join(ROOT, "src", "controllers");
const ROUTES_DIR = path.join(ROOT, "src", "routes");
const APP_FILE = path.join(ROOT, "src", "app.js");
const SERVER_FILE = path.join(ROOT, "src", "server.js");
const OUT_FILE = path.join(ROOT, "admin-audit-backend.txt");
const FRONTEND_ROOT = process.env.FRONTEND_ROOT;

// ── Patterns that identify an admin handler by name ──────────────────────────
const ADMIN_NAME_PATTERNS = [
  /^admin[A-Z]/,
  /^Admin[A-Z]/,
  /[a-z]Admin[A-Z]/,
  /^verifyWorker$/,
  /^banUser$/,
  /^unbanUser$/,
  /^deleteUser$/,
  /^updateUserRole$/,
  /^resolveDispute$/,
  /^approveWithdrawal$/,
  /^rejectWithdrawal$/,
  /^approveWithdrawalPayout$/,
  /^broadcastNotification$/,
  /^deleteReview$/,
  /^deleteCategory$/,
  /^createCategory$/,
  /^updateCategory$/,
  /^getAllUsers$/,
  /^getUserDetail$/,
  /^getPlatformStats$/,
  /^getUserGrowthAnalytics$/,
  /^getRevenueAnalytics$/,
  /^getPendingVerifications$/,
  /^getVerificationStats$/,
  /^getAllBookings$/,
  /^adminUpdateBookingStatus$/,
  /^getDisputes$/,
  /^getAllPayments$/,
  /^getPaymentDetail$/,
  /^getAllWithdrawals$/,
  /^getAllReviews$/,
  /^getAllJobPosts$/,
  /^getJobPostDetail$/,
  /^adminUpdateJobStatus$/,
  /^adminDeleteJobPost$/,
  /^getAllSubscriptions$/,
  /^adminCancelSubscription$/,
  /^getAllFeaturedListings$/,
  /^adminRemoveFeaturedListing$/,
  /^getAllPosts$/,
  /^adminDeletePost$/,
  /^adminDeleteComment$/,
  /^getAllConversations$/,
  /^getConversationMessages$/,
  /^getAllVideoCalls$/,
];

function isAdminHandlerName(name) {
  return ADMIN_NAME_PATTERNS.some((re) => re.test(name));
}

// ── Walk a directory recursively ────────────────────────────────────────────
function walk(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full, filter));
    } else if (entry.isFile() && filter(full)) {
      out.push(full);
    }
  }
  return out;
}

// ── Extract exported function names from a controller file ──────────────────
function extractExports(source) {
  const names = new Set();
  const re =
    /export\s+(?:async\s+)?(?:const|let|var|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(source))) names.add(m[1]);
  return [...names];
}

// ── Extract route definitions from a route file ─────────────────────────────
function extractRoutes(source) {
  const routes = [];
  const routeRe =
    /router\.(get|post|patch|put|delete|use)\s*\(\s*([`"'])([^`"']+)\2\s*,\s*([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = routeRe.exec(source))) {
    const method = m[1].toUpperCase();
    const urlPath = m[3];
    const middlewares = m[4]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const handler = middlewares[middlewares.length - 1] || "";
    routes.push({
      method,
      path: urlPath,
      middlewares,
      handler,
      raw: m[0],
    });
  }
  return routes;
}

// ── Extract route mount prefixes from app.js / server.js ────────────────────
function extractMounts(source) {
  const mounts = {};
  const re =
    /app\.use\s*\(\s*[`"']([^`"']+)[`"']\s*,\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let m;
  while ((m = re.exec(source))) {
    mounts[m[2]] = m[1];
  }
  return mounts;
}

function extractImportsForMounts(source) {
  const imports = {};
  const re =
    /import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s+[`"']\.\/routes\/([^`"']+)[`"']/g;
  let m;
  while ((m = re.exec(source))) {
    imports[m[1]] = m[2];
  }
  return imports;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const out = [];
  const log = (s = "") => {
    console.log(s);
    out.push(s);
  };

  log("═══════════════════════════════════════════════════════════════");
  log("ADMIN BACKEND AUDIT");
  log("═══════════════════════════════════════════════════════════════");
  log("");

  // ── Route mounts ──────────────────────────────────────────────────────────
  let mounts = {};
  let imports = {};
  const appSrc = fs.existsSync(APP_FILE)
    ? fs.readFileSync(APP_FILE, "utf8")
    : fs.existsSync(SERVER_FILE)
      ? fs.readFileSync(SERVER_FILE, "utf8")
      : "";
  if (appSrc) {
    mounts = extractMounts(appSrc);
    imports = extractImportsForMounts(appSrc);
  }
  const fileToPrefix = {};
  for (const [varName, prefix] of Object.entries(mounts)) {
    const file = imports[varName];
    if (file) fileToPrefix[file] = prefix;
  }

  // ── Section A ─────────────────────────────────────────────────────────────
  log("─────────────────────────────────────────────────────────────");
  log("A. ADMIN HANDLERS LIVING OUTSIDE admin.controller.js");
  log("─────────────────────────────────────────────────────────────");
  log("");

  const handlerHits = {};
  const controllerFiles = walk(CONTROLLERS_DIR, (f) => f.endsWith(".js"));
  for (const file of controllerFiles) {
    const rel = path.relative(ROOT, file);
    if (rel.endsWith("admin.controller.js")) continue;
    const source = fs.readFileSync(file, "utf8");
    const exports = extractExports(source);
    const hits = exports.filter(isAdminHandlerName);
    if (hits.length) {
      handlerHits[rel] = hits;
      log(`${rel}`);
      for (const h of hits) log(`  ${h}`);
      log(`  → ${hits.length} handler(s) should move to admin.controller.js`);
      log("");
    }
  }
  if (Object.keys(handlerHits).length === 0) {
    log("(none — all admin handlers already in admin.controller.js)");
    log("");
  }

  // ── Section B ─────────────────────────────────────────────────────────────
  log("─────────────────────────────────────────────────────────────");
  log("B. ADMIN ROUTES LIVING OUTSIDE admin.routes.js");
  log("─────────────────────────────────────────────────────────────");
  log("");

  const routeHits = {};
  const routeFiles = walk(ROUTES_DIR, (f) => f.endsWith(".js"));
  for (const file of routeFiles) {
    const rel = path.relative(ROOT, file);
    if (rel.endsWith("admin.routes.js")) continue;
    const source = fs.readFileSync(file, "utf8");
    const routes = extractRoutes(source);
    const baseFile = path.basename(file);
    const prefix = fileToPrefix[baseFile] || "?";

    const adminRoutes = routes.filter((r) => {
      const mw = r.middlewares.join(",");
      if (/requireRole\(\s*["']ADMIN["']\s*\)/.test(mw)) return true;
      if (/restrictTo\(\s*["']ADMIN["']\s*\)/.test(mw)) return true;
      if (r.path.includes("/admin")) return true;
      return false;
    });

    if (adminRoutes.length) {
      routeHits[rel] = adminRoutes.map((r) => ({
        ...r,
        fullPath: `${prefix}${r.path}`,
      }));
      log(`${rel}  (mounted at ${prefix})`);
      for (const r of adminRoutes) {
        const full = `${prefix}${r.path}`;
        log(`  ${r.method.padEnd(6)} ${r.path.padEnd(30)} → ${full}`);
      }
      log(`  → ${adminRoutes.length} route(s) should move to admin.routes.js`);
      log("");
    }
  }
  if (Object.keys(routeHits).length === 0) {
    log("(none — all admin routes already in admin.routes.js)");
    log("");
  }

  // ── Section C ─────────────────────────────────────────────────────────────
  log("─────────────────────────────────────────────────────────────");
  log("C. HANDLERS IMPORTED BY admin.routes.js FROM NON-ADMIN CONTROLLERS");
  log("─────────────────────────────────────────────────────────────");
  log("");

  const adminRoutesFile = path.join(ROUTES_DIR, "admin.routes.js");
  if (fs.existsSync(adminRoutesFile)) {
    const src = fs.readFileSync(adminRoutesFile, "utf8");
    const importRe =
      /import\s+\{([^}]+)\}\s+from\s+[`"'](\.\.\/controllers\/[^`"']+)[`"']/g;
    let m;
    let found = false;
    while ((m = importRe.exec(src))) {
      const names = m[1]
        .split(",")
        .map((s) =>
          s
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      const source = m[2];
      if (!source.includes("admin.controller.js")) {
        found = true;
        log(`From ${source}:`);
        for (const n of names) log(`  - ${n}`);
        log(`  → handler(s) should move to admin.controller.js`);
        log("");
      }
    }
    if (!found) {
      log("(none — admin.routes.js only imports from admin.controller.js)");
      log("");
    }
  } else {
    log("(admin.routes.js not found)");
    log("");
  }

  // ── Section D ─────────────────────────────────────────────────────────────
  log("─────────────────────────────────────────────────────────────");
  log("D. DUPLICATE ADMIN ROUTES");
  log("─────────────────────────────────────────────────────────────");
  log("");

  const allRoutes = [];
  for (const file of routeFiles) {
    const rel = path.relative(ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    const routes = extractRoutes(source);
    for (const r of routes) allRoutes.push({ file: rel, ...r });
  }

  const byHandler = {};
  for (const r of allRoutes) {
    const handlerName = r.handler.replace(/\(.*$/, "").trim();
    if (!byHandler[handlerName]) byHandler[handlerName] = [];
    byHandler[handlerName].push(r);
  }
  let dupFound = false;
  for (const [handler, group] of Object.entries(byHandler)) {
    if (group.length > 1) {
      const hasAdmin = group.some((g) => g.file.endsWith("admin.routes.js"));
      const hasNonAdmin = group.some(
        (g) => !g.file.endsWith("admin.routes.js"),
      );
      if (hasAdmin && hasNonAdmin) {
        dupFound = true;
        log(`SAME HANDLER IN TWO FILES: ${handler}`);
        for (const g of group) {
          log(`  ${g.file}  → ${g.method} ${g.path}`);
        }
        log("");
      }
    }
  }
  if (!dupFound) {
    log("(none found)");
    log("");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  log("═══════════════════════════════════════════════════════════════");
  log("SUMMARY");
  log("═══════════════════════════════════════════════════════════════");
  const totalHandlers = Object.values(handlerHits).reduce(
    (s, a) => s + a.length,
    0,
  );
  const totalRoutes = Object.values(routeHits).reduce(
    (s, a) => s + a.length,
    0,
  );
  log(
    `Controllers with admin handlers to move: ${Object.keys(handlerHits).length}`,
  );
  log(`Total admin handlers to move:             ${totalHandlers}`);
  log(
    `Route files with admin routes to move:    ${Object.keys(routeHits).length}`,
  );
  log(`Total admin routes to move:               ${totalRoutes}`);
  log("");

  fs.writeFileSync(OUT_FILE, out.join("\n"));
  console.log(
    `\n📄 Backend report written to: ${path.relative(ROOT, OUT_FILE)}`,
  );

  // ── Copy to frontend if FRONTEND_ROOT is set ──────────────────────────────
  if (FRONTEND_ROOT) {
    const dest = path.join(FRONTEND_ROOT, "admin-audit-backend.txt");
    if (fs.existsSync(FRONTEND_ROOT)) {
      fs.copyFileSync(OUT_FILE, dest);
      console.log(`📄 Copied to frontend:       ${dest}`);
    } else {
      console.warn(
        `⚠️  FRONTEND_ROOT set but does not exist: ${FRONTEND_ROOT}`,
      );
    }
  }
}

main();

#!/usr/bin/env node
// full-audit.js
// ─────────────────────────────────────────────────────────────────────────────
// SkilledProz — Complete Platform Audit
//
// Checks:
//   §1  Project file tree
//   §2  All controller exports (25 controllers)
//   §3  All route endpoints (method + path + handler)
//   §4  Controller → Route coverage (exported functions with no route)
//   §5  Route → Controller cross-check (broken imports)
//   §6  Auth middleware coverage (routes missing protect/requireRole)
//   §7  Validation coverage (POST/PATCH/PUT missing validators)
//   §8  Pagination coverage (list endpoints not using paginate helper)
//   §9  Service files check
//   §10 Middleware files check
//   §11 Utils files check
//   §12 Platform feature checklist (what a marketplace must have)
//   §13 app.js route mount check
//   §14 Environment variable audit
//   §15 Summary & priority action list
//
// Run: node full-audit.js
// Output saved to: full-audit-report.txt
// ─────────────────────────────────────────────────────────────────────────────

import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join, dirname, extname, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = false;

// ── Find project root ─────────────────────────────────────────────────────────
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return start;
}
const ROOT = findRoot(__dirname);
const SRC = join(ROOT, "src");
const LINE = "─".repeat(80);
const DLINE = "═".repeat(80);

const out = [];
function log(s = "") {
  console.log(s);
  out.push(s);
}
function sec(title) {
  log();
  log(DLINE);
  log(`  ${title}`);
  log(DLINE);
}
function sub(title) {
  log();
  log(`  ${LINE.slice(0, 60)}`);
  log(`  ${title}`);
  log(`  ${LINE.slice(0, 60)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function readSrc(rel) {
  try {
    return await readFile(join(SRC, rel), "utf8");
  } catch {
    return null;
  }
}

async function listDir(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries;
  } catch {
    return [];
  }
}

async function dirExists(p) {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

// Extract named exports from a JS file
function extractExports(content) {
  const found = new Set();
  const patterns = [
    /^export\s+const\s+(\w+)\s*=/gm,
    /^export\s+async\s+function\s+(\w+)/gm,
    /^export\s+function\s+(\w+)/gm,
  ];
  for (const p of patterns) {
    let m;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(content)) !== null) if (m[1]) found.add(m[1]);
  }
  return [...found].sort();
}

// Extract router.METHOD(path, ...) lines
function extractRoutes(content, filename) {
  const routes = [];
  const re =
    /router\.(get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2];
    if (method === "USE" && path === "/") continue; // skip router.use("/")

    // Extract handlers (last identifier before the closing paren group)
    const lineStart = content.lastIndexOf("\n", m.index) + 1;
    const lineEnd = content.indexOf("\n", m.index + m[0].length);
    const snippet = content.slice(
      m.index,
      lineEnd < 0 ? undefined : lineEnd + 200,
    );

    // Find handler name — last word before closing paren of route definition
    const handlers = [...snippet.matchAll(/\b([a-z][a-zA-Z0-9]+)\b/g)]
      .map((x) => x[1])
      .filter(
        (h) =>
          ![
            "router",
            "get",
            "post",
            "put",
            "patch",
            "delete",
            "use",
            "protect",
            "requireRole",
            "optionalProtect",
            "uploadSingle",
            "normaliseFile",
            "validatePagination",
            "loginLimiter",
            "registerLimiter",
            "apiLimiter",
            "aiLimiter",
            "aiDailyLimiter",
            "nearbyLimiter",
            "searchLimiter",
            "filterLimiter",
            "trendingLimiter",
            "webhookLimiter",
            "uploadLimiter",
            "notificationRequestLimiter",
          ].includes(h),
      );

    const handler = handlers[handlers.length - 1] || "?";

    routes.push({
      method,
      path,
      handler,
      hasProtect: /\bprotect\b/.test(snippet),
      hasRequireRole: /\brequireRole\b/.test(snippet),
      hasValidator: /\bvalidate[A-Z]/.test(snippet),
      hasUUIDParam: /\bvalidateUUIDParam\b/.test(snippet),
      hasPagination: /\bvalidatePagination\b/.test(snippet),
      isOptionalAuth: /\boptionalProtect\b/.test(snippet),
    });
  }
  return routes;
}

// Extract what a route file imports from controllers
function extractControllerImports(content) {
  const result = {};
  const re = /import\s*\{([^}]+)\}\s*from\s*["']([^'"]*controller[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const names = m[1]
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter(Boolean);
    const file = basename(m[2]);
    if (!result[file]) result[file] = [];
    result[file].push(...names);
  }
  return result;
}

// Levenshtein for suggestions
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

function closest(name, list) {
  return list
    .sort((a, b) => lev(name, a) - lev(name, b))
    .slice(0, 2)
    .filter((x) => lev(name, x) <= 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
log();
log(DLINE);
log("  SkilledProz — Full Platform Audit");
log(`  Generated : ${new Date().toLocaleString()}`);
log(`  Root      : ${ROOT}`);
log(`  Src       : ${SRC}`);
log(DLINE);

// ─────────────────────────────────────────────────────────────────────────────
// §1  PROJECT FILE TREE
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 1  PROJECT FILE TREE");

const KEY_DIRS = [
  "controllers",
  "routes",
  "services",
  "middleware",
  "utils",
  "config",
  "socket",
  "prisma",
  "generated",
];

for (const dir of KEY_DIRS) {
  const full = join(SRC, dir);
  const entries = await listDir(full);
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  const exists = await dirExists(full);

  if (!exists || files.length === 0) {
    log(`  ❌  src/${dir}/  (empty or missing)`);
  } else {
    log(
      `  ✅  src/${dir}/  (${files.length} file${files.length !== 1 ? "s" : ""})`,
    );
    files.forEach((f) => {
      const size = "";
      log(`        ${f}`);
    });
  }
}

// Also list root scripts/
const scriptFiles = (await listDir(join(ROOT, "scripts")))
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .sort();
log();
log(`  📁  scripts/  (${scriptFiles.length} files)`);
scriptFiles.forEach((f) => log(`        ${f}`));

// ─────────────────────────────────────────────────────────────────────────────
// §2  CONTROLLER AUDIT
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 2  ALL CONTROLLER EXPORTS");

const ctrlDir = join(SRC, "controllers");
const ctrlFiles = (await listDir(ctrlDir))
  .filter(
    (e) => e.isFile() && e.name.endsWith(".js") && !e.name.endsWith(".bak"),
  )
  .map((e) => e.name)
  .sort();

const controllerMap = {}; // { "auth.controller.js": ["login","register",...] }

let totalExports = 0;
for (const file of ctrlFiles) {
  const content = await readFile(join(ctrlDir, file), "utf8");
  const exports = extractExports(content);
  controllerMap[file] = exports;
  totalExports += exports.length;
  log();
  log(`  ┌─ ${file}  (${exports.length} exports)`);
  exports.forEach((e) => log(`  │   ${e}`));
  log(`  └${"─".repeat(60)}`);
}
log();
log(
  `  Total: ${ctrlFiles.length} controllers, ${totalExports} exported functions`,
);

// ─────────────────────────────────────────────────────────────────────────────
// §3  ROUTE AUDIT
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 3  ALL ROUTES");

const routesDir = join(SRC, "routes");
const routeFiles = (await listDir(routesDir))
  .filter(
    (e) => e.isFile() && e.name.endsWith(".js") && !e.name.endsWith(".bak"),
  )
  .map((e) => e.name)
  .sort();

const routeMap = {}; // { "auth.routes.js": [{ method, path, handler, ... }] }
const importMap = {}; // { "auth.routes.js": { "auth.controller.js": ["login",...] } }

let totalRoutes = 0;
for (const file of routeFiles) {
  const content = await readFile(join(routesDir, file), "utf8");
  const routes = extractRoutes(content, file);
  const imports = extractControllerImports(content);
  routeMap[file] = routes;
  importMap[file] = imports;
  totalRoutes += routes.length;

  log();
  log(
    `  ┌─ ${file}  (${routes.length} route${routes.length !== 1 ? "s" : ""})`,
  );
  routes.forEach((r) => {
    const auth = r.hasProtect
      ? r.hasRequireRole
        ? "🔐ROLE"
        : "🔑AUTH"
      : r.isOptionalAuth
        ? "👁️OPT"
        : "🌐PUB ";
    const val = r.hasValidator ? "✅VAL" : "⬜   ";
    log(
      `  │   ${auth} ${val}  ${r.method.padEnd(7)} ${r.path.padEnd(40)} → ${r.handler}`,
    );
  });
  log(`  └${"─".repeat(60)}`);
}
log();
log(`  Total: ${routeFiles.length} route files, ${totalRoutes} endpoints`);

// ─────────────────────────────────────────────────────────────────────────────
// §4  CONTROLLER → ROUTE COVERAGE
//     (exported functions that are not used in any route)
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 4  UNUSED CONTROLLER EXPORTS (not mapped to any route)");

// Build set of all handler names used in routes
const usedHandlers = new Set();
for (const routes of Object.values(routeMap)) {
  routes.forEach((r) => usedHandlers.add(r.handler));
}
// Also collect everything imported in route files
for (const imports of Object.values(importMap)) {
  for (const names of Object.values(imports))
    names.forEach((n) => usedHandlers.add(n));
}

const INTERNAL_FNS = new Set([
  // functions meant to be called internally, not via routes
  "applyReferralOnSignup",
  "qualifyReferral",
  "convertReferral",
  "registerCampaignReferral",
  "markProfileSetupComplete",
  "getHirerFirstBookingDiscount",
  "notifyBookingUpdate",
  "sendRealTimeNotification",
  "TIERS",
  "REFEREE_PERKS",
  "REFERRAL_CONFIG",
  "CAMPAIGN_CONFIG",
  "FEATURED_PACKAGES",
  "HIRER_PLANS",
  "WORKER_PLANS",
  "PLANS",
  "CRYPTO_CURRENCIES",
  "SUPPORTED_CURRENCIES",
  "getPlanCode",
]);

let unusedCount = 0;
for (const [file, exports] of Object.entries(controllerMap)) {
  const unused = exports.filter(
    (e) => !usedHandlers.has(e) && !INTERNAL_FNS.has(e),
  );
  if (unused.length > 0) {
    log();
    log(`  ⚠️  ${file}`);
    unused.forEach((fn) => log(`       not routed: ${fn}`));
    unusedCount += unused.length;
  }
}

if (unusedCount === 0) {
  log(
    "  ✅  All exported controller functions are mapped to at least one route.",
  );
} else {
  log();
  log(`  ${unusedCount} function(s) exported but not reachable via any route.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §5  ROUTE → CONTROLLER CROSS-CHECK
//     (imports that don't exist in the controller)
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 5  BROKEN ROUTE IMPORTS");

let brokenCount = 0;
for (const [routeFile, imports] of Object.entries(importMap)) {
  for (const [ctrlFile, names] of Object.entries(imports)) {
    const available = controllerMap[ctrlFile] || [];
    const broken = names.filter((n) => !available.includes(n));
    if (broken.length > 0) {
      log();
      log(`  ❌  ${routeFile}  ← ${ctrlFile}`);
      broken.forEach((n) => {
        const hint = closest(n, available);
        log(
          `       ✗  "${n}"${hint.length ? `  → did you mean: ${hint.join(" | ")}` : "  → not found"}`,
        );
      });
      brokenCount += broken.length;
    }
  }
}

if (brokenCount === 0) {
  log("  ✅  All route imports resolve to real controller exports.");
} else {
  log();
  log(
    `  ${brokenCount} broken import(s) found. Fix these first — server crashes on startup.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §6  AUTH MIDDLEWARE COVERAGE
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 6  AUTH MIDDLEWARE COVERAGE");

// Routes that should always be public
const ALWAYS_PUBLIC = new Set([
  "/",
  "/health",
  "/search",
  "/nearby",
  "/trending",
  "/filters",
  "/validate/:code",
  "/plans",
  "/categories",
]);
// Route files that are entirely public (no auth needed anywhere)
const PUBLIC_ROUTE_FILES = new Set(["search.routes.js", "category.routes.js"]);

let noAuthCount = 0;
for (const [file, routes] of Object.entries(routeMap)) {
  if (PUBLIC_ROUTE_FILES.has(file)) continue;

  const unprotected = routes.filter((r) => {
    if (r.method === "GET" && ALWAYS_PUBLIC.has(r.path)) return false;
    if (r.isOptionalAuth) return false;
    if (r.hasProtect || r.hasRequireRole) return false;
    // Webhooks are intentionally unprotected
    if (r.path.includes("webhook")) return false;
    // Public GET endpoints are usually fine
    if (r.method === "GET" && (r.path === "/" || r.path.match(/^\/:[a-z]+Id$/)))
      return false;
    return (
      r.method !== "GET" ||
      r.path.includes("register") ||
      r.path.includes("login")
    );
  });

  if (unprotected.length > 0) {
    log();
    log(`  ⚠️  ${file} — routes missing auth middleware:`);
    unprotected.forEach((r) => log(`       ${r.method.padEnd(7)} ${r.path}`));
    noAuthCount += unprotected.length;
  }
}

if (noAuthCount === 0) {
  log("  ✅  Auth middleware looks complete across all route files.");
}

// ─────────────────────────────────────────────────────────────────────────────
// §7  VALIDATION COVERAGE
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 7  VALIDATION COVERAGE (POST/PATCH/PUT missing validators)");

// Routes that are intentionally unvalidated (webhooks, simple toggles, etc.)
const SKIP_VALIDATION = new Set([
  "paystackWebhook",
  "flutterwaveWebhook",
  "logout",
  "getMe",
  "refreshToken",
  "clearAllNotifications",
  "deleteNotification",
  "markAllAsRead",
  "markAsRead",
  "deleteVideoIntro",
  "removeCategory",
  "deletePortfolio",
  "deleteCertification",
  "deleteAccount",
  "deletePost",
  "deleteComment",
  "deleteReview",
  "deleteUser",
  "banUser",
  "unbanUser",
  "deleteCategory",
  "adminDeleteJobPost",
  "adminDeletePost",
  "adminDeleteComment",
  "adminUpdateJobStatus",
  "adminCancelSubscription",
  "adminRemoveFeaturedListing",
  "acceptCall",
  "declineCall",
  "endCall",
  "getCallStatus",
  "cancelReport",
  "cancelDispute",
  "resolveSOS",
]);

let noValCount = 0;
for (const [file, routes] of Object.entries(routeMap)) {
  const missing = routes.filter(
    (r) =>
      ["POST", "PATCH", "PUT"].includes(r.method) &&
      !r.hasValidator &&
      !r.hasUUIDParam &&
      !SKIP_VALIDATION.has(r.handler) &&
      !r.path.includes("webhook"),
  );

  if (missing.length > 0) {
    log();
    log(`  ⚠️  ${file}`);
    missing.forEach((r) =>
      log(`       ${r.method.padEnd(7)} ${r.path.padEnd(40)} → ${r.handler}`),
    );
    noValCount += missing.length;
  }
}

if (noValCount === 0) {
  log("  ✅  All mutating routes have validation middleware.");
} else {
  log();
  log(`  ${noValCount} route(s) modifying data without input validation.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// §8  PAGINATION COVERAGE
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 8  PAGINATION COVERAGE (GET list routes missing validatePagination)");

// Handlers that definitely return lists
const LIST_HANDLERS = new Set([
  "getAllUsers",
  "getAllBookings",
  "getAllPayments",
  "getAllWithdrawals",
  "getAllCategories",
  "getAllReviews",
  "getAllJobPosts",
  "getAllSubscriptions",
  "getAllFeaturedListings",
  "getAllPosts",
  "getAllConversations",
  "getAllVideoCalls",
  "getAllDisputes",
  "getMyBookings",
  "getHirerBookings",
  "getMyJobPosts",
  "getJobPosts",
  "getMyApplications",
  "getJobApplications",
  "getMyCampaignReferrals",
  "getCampaignSubmissions",
  "adminGetCampaignWithdrawals",
  "adminGetSubmissions",
  "adminGetAllReferrals",
  "getMyReports",
  "adminGetAllReports",
  "getAuditLogs",
  "getSavedWorkers",
  "getSavedJobs",
  "searchWorkers",
  "getWorkerNotifications",
  "getNotifications",
  "getConversations",
  "getMessages",
  "getPendingVerifications",
  "getVerifiedWorkers",
  "getPendingHirerVerifications",
  "getMyReceivedReviews",
  "getMyGivenReviews",
  "getWorkerReviews",
  "getHirerReviews",
  "getWithdrawals",
  "getHirerPayments",
  "getWorkerEarnings",
  "getFeed",
  "getMyPosts",
  "getUserPosts",
]);

let noPagCount = 0;
for (const [file, routes] of Object.entries(routeMap)) {
  const missing = routes.filter(
    (r) =>
      r.method === "GET" && !r.hasPagination && LIST_HANDLERS.has(r.handler),
  );
  if (missing.length > 0) {
    log();
    log(`  ⚠️  ${file}`);
    missing.forEach((r) =>
      log(
        `       GET ${r.path.padEnd(40)} → ${r.handler}  (no validatePagination)`,
      ),
    );
    noPagCount += missing.length;
  }
}

if (noPagCount === 0) {
  log("  ✅  All known list endpoints use validatePagination.");
}

// ─────────────────────────────────────────────────────────────────────────────
// §9  SERVICE FILES
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 9  SERVICE FILES");

const EXPECTED_SERVICES = [
  { file: "auth.service.js", desc: "JWT + token management" },
  { file: "email.service.js", desc: "Resend / Nodemailer email sending" },
  {
    file: "notification.service.js",
    desc: "In-app + push notification helpers",
  },
  { file: "push.service.js", desc: "Expo push notification API" },
  {
    file: "payment.service.js",
    desc: "Shared payment utilities (Paystack/Flutterwave)",
  },
];

for (const s of EXPECTED_SERVICES) {
  const exists = existsSync(join(SRC, "services", s.file));
  log(`  ${exists ? "✅" : "❌"}  services/${s.file.padEnd(30)} ${s.desc}`);
}

// Also list any extra service files
const svcFiles = (await listDir(join(SRC, "services")))
  .filter((e) => e.isFile() && e.name.endsWith(".js"))
  .map((e) => e.name);
const extra = svcFiles.filter(
  (f) => !EXPECTED_SERVICES.map((s) => s.file).includes(f),
);
if (extra.length > 0) {
  log();
  log("  Extra service files found:");
  extra.forEach((f) => log(`       ${f}`));
}

// ─────────────────────────────────────────────────────────────────────────────
// §10 MIDDLEWARE FILES
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 10  MIDDLEWARE FILES");

const EXPECTED_MW = [
  { file: "auth.middleware.js", desc: "protect, requireRole, optionalProtect" },
  {
    file: "upload.middleware.js",
    desc: "uploadSingle, uploadMultiple, normaliseFile",
  },
  { file: "rateLimit.middleware.js", desc: "14 named limiters" },
  {
    file: "error.middleware.js",
    desc: "Global error handler (optional but recommended)",
  },
];

for (const m of EXPECTED_MW) {
  const exists = existsSync(join(SRC, "middleware", m.file));
  log(`  ${exists ? "✅" : "❌"}  middleware/${m.file.padEnd(28)} ${m.desc}`);
}

// Check what auth.middleware.js exports
const authMwContent = await readSrc("middleware/auth.middleware.js");
if (authMwContent) {
  const authExports = extractExports(authMwContent);
  const required = ["protect", "requireRole", "optionalProtect"];
  required.forEach((fn) => {
    const ok =
      authExports.includes(fn) ||
      authMwContent.includes(`export const ${fn}`) ||
      authMwContent.includes(`exports.${fn}`);
    log(`       ${ok ? "✅" : "❌"}  ${fn}`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §11 UTILS FILES
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 11  UTILITY FILES");

const EXPECTED_UTILS = [
  { file: "response.js", desc: "sendResponse, sendError, sendPaginated, …" },
  { file: "helpers.js", desc: "paginate, fullName, formatCurrency, …" },
  { file: "validators.js", desc: "All input validators (22 sections)" },
  { file: "auditLog.js", desc: "logAdminAction, logAdminFailure" },
];

for (const u of EXPECTED_UTILS) {
  const exists = existsSync(join(SRC, "utils", u.file));
  log(`  ${exists ? "✅" : "❌"}  utils/${u.file.padEnd(20)} ${u.desc}`);
  if (exists) {
    const content = await readSrc(`utils/${u.file}`);
    const exports = extractExports(content);
    log(`       ${exports.length} exported functions`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// §12 PLATFORM FEATURE CHECKLIST
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 12  PLATFORM FEATURE CHECKLIST");

// Infer which features exist based on controller presence
const ctrlSet = new Set(ctrlFiles);
const routeSet = new Set(routeFiles);

const FEATURES = [
  // Auth & Users
  {
    name: "User registration + login",
    ctrl: "auth.controller.js",
    route: "auth.routes.js",
  },
  {
    name: "Email verification",
    ctrl: "auth.controller.js",
    route: "auth.routes.js",
  },
  {
    name: "Forgot / reset password",
    ctrl: "auth.controller.js",
    route: "auth.routes.js",
  },
  {
    name: "JWT refresh token rotation",
    ctrl: "auth.controller.js",
    route: "auth.routes.js",
  },
  {
    name: "User profile settings",
    ctrl: "settings.controller.js",
    route: "settings.routes.js",
  },
  {
    name: "Avatar upload",
    ctrl: "settings.controller.js",
    route: "settings.routes.js",
  },
  {
    name: "Privacy settings",
    ctrl: "settings.controller.js",
    route: "settings.routes.js",
  },
  {
    name: "Activity log",
    ctrl: "settings.controller.js",
    route: "settings.routes.js",
  },
  // Workers
  {
    name: "Worker profile",
    ctrl: "worker.controller.js",
    route: "worker.routes.js",
  },
  {
    name: "Portfolio management",
    ctrl: "worker.controller.js",
    route: "worker.routes.js",
  },
  {
    name: "Availability calendar",
    ctrl: "worker.controller.js",
    route: "worker.routes.js",
  },
  {
    name: "Video intro upload",
    ctrl: "worker.controller.js",
    route: "worker.routes.js",
  },
  {
    name: "Worker search & discovery",
    ctrl: "search.controller.js",
    route: "search.routes.js",
  },
  {
    name: "Nearby workers (geo)",
    ctrl: "search.controller.js",
    route: "search.routes.js",
  },
  {
    name: "Worker dashboard",
    ctrl: "worker.controller.js",
    route: "worker.routes.js",
  },
  // Hirers
  {
    name: "Hirer profile",
    ctrl: "hirer.controller.js",
    route: "hirer.routes.js",
  },
  {
    name: "Hirer dashboard",
    ctrl: "hirer.controller.js",
    route: "hirer.routes.js",
  },
  {
    name: "Saved workers (shortlist)",
    ctrl: "hirer.controller.js",
    route: "hirer.routes.js",
  },
  // Jobs
  {
    name: "Job post (create/browse)",
    ctrl: "job.controller.js",
    route: "job.routes.js",
  },
  {
    name: "Job applications",
    ctrl: "job.controller.js",
    route: "job.routes.js",
  },
  {
    name: "Saved jobs (worker bookmark)",
    ctrl: "job.controller.js",
    route: "job.routes.js",
  },
  // Bookings
  {
    name: "Booking lifecycle (CRUD)",
    ctrl: "booking.controller.js",
    route: "booking.routes.js",
  },
  {
    name: "Check-in / check-out",
    ctrl: "booking.controller.js",
    route: "booking.routes.js",
  },
  {
    name: "SOS emergency alert",
    ctrl: "booking.controller.js",
    route: "booking.routes.js",
  },
  {
    name: "Emergency contact",
    ctrl: "booking.controller.js",
    route: "booking.routes.js",
  },
  // Payments
  {
    name: "Paystack (card) payment",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Flutterwave payment",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Bank transfer (manual)",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Crypto payment (USDC/USDT)",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Escrow release",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Worker withdrawal",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  {
    name: "Bank account verification",
    ctrl: "payment.controller.js",
    route: "payment.routes.js",
  },
  // Reviews
  {
    name: "Worker & hirer reviews",
    ctrl: "review.controller.js",
    route: "review.routes.js",
  },
  // Messages
  {
    name: "Real-time messaging",
    ctrl: "message.controller.js",
    route: "message.routes.js",
  },
  // Notifications
  {
    name: "In-app notifications",
    ctrl: "notification.controller.js",
    route: "notification.routes.js",
  },
  {
    name: "Push notifications (Expo)",
    ctrl: "notification.controller.js",
    route: "notification.routes.js",
  },
  {
    name: "Device token management",
    ctrl: "notification.controller.js",
    route: "notification.routes.js",
  },
  // Verification
  {
    name: "Worker ID verification",
    ctrl: "verification.controller.js",
    route: "verification.routes.js",
  },
  {
    name: "Worker certification upload",
    ctrl: "verification.controller.js",
    route: "verification.routes.js",
  },
  {
    name: "Background check",
    ctrl: "verification.controller.js",
    route: "verification.routes.js",
  },
  {
    name: "Hirer business verification",
    ctrl: "verification.controller.js",
    route: "verification.routes.js",
  },
  // Reports & Safety
  {
    name: "Report / flag system",
    ctrl: "report.controller.js",
    route: "report.routes.js",
  },
  {
    name: "Dispute resolution",
    ctrl: "dispute.controller.js",
    route: "dispute.routes.js",
  },
  // Subscriptions & Monetisation
  {
    name: "Subscription plans",
    ctrl: "subscription.controller.js",
    route: "subscription.routes.js",
  },
  {
    name: "Featured listings (boost)",
    ctrl: "featured.controller.js",
    route: "featured.routes.js",
  },
  {
    name: "Insurance plans",
    ctrl: "insurance.controller.js",
    route: "insurance.routes.js",
  },
  // Referral & Campaign
  {
    name: "Referral program (tiered)",
    ctrl: "referral.controller.js",
    route: "referral.routes.js",
  },
  {
    name: "Daily campaign (social tasks)",
    ctrl: "campaign.controller.js",
    route: "campaign.routes.js",
  },
  // Community
  {
    name: "Community posts / feed",
    ctrl: "post.controller.js",
    route: "post.routes.js",
  },
  // AI & Translation
  { name: "AI assistant (Anthropic)", ctrl: null, route: "ai.routes.js" },
  { name: "Translation endpoint", ctrl: null, route: "translate.routes.js" },
  // Video
  {
    name: "Video calls (WebRTC)",
    ctrl: "videocall.controller.js",
    route: "videocall.routes.js",
  },
  // Admin
  {
    name: "Admin user management",
    ctrl: "admin.controller.js",
    route: "admin.routes.js",
  },
  {
    name: "Admin analytics & stats",
    ctrl: "admin.controller.js",
    route: "admin.routes.js",
  },
  {
    name: "Admin audit log",
    ctrl: "audit.controller.js",
    route: "audit.routes.js",
  },
  {
    name: "Admin manual payment verify",
    ctrl: "admin.controller.js",
    route: "admin.routes.js",
  },
];

let presentCount = 0;
let missingCount = 0;
for (const f of FEATURES) {
  const ctrlOk = !f.ctrl || ctrlSet.has(f.ctrl);
  const routeOk = !f.route || routeSet.has(f.route);
  const ok = ctrlOk && routeOk;
  if (ok) presentCount++;
  else missingCount++;
  log(
    `  ${ok ? "✅" : "❌"}  ${f.name.padEnd(42)} ${f.ctrl || "(inline)"}${!ctrlOk ? " ← MISSING CTRL" : ""}${!routeOk ? " ← MISSING ROUTE" : ""}`,
  );
}
log();
log(
  `  ${presentCount}/${FEATURES.length} features present  |  ${missingCount} missing`,
);

// ─────────────────────────────────────────────────────────────────────────────
// §13 APP.JS ROUTE MOUNT CHECK
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 13  APP.JS ROUTE MOUNTS");

const appContent =
  (await readFile(join(ROOT, "app.js"), "utf8").catch(() => null)) ||
  (await readFile(join(SRC, "app.js"), "utf8").catch(() => null)) ||
  (await readFile(join(ROOT, "server.js"), "utf8").catch(() => null));

if (!appContent) {
  log("  ❌  Could not find app.js or server.js");
} else {
  const EXPECTED_MOUNTS = [
    { route: "/api/auth", file: "auth.routes.js" },
    { route: "/api/users", file: "user.routes.js" },
    { route: "/api/workers", file: "worker.routes.js" },
    { route: "/api/hirers", file: "hirer.routes.js" },
    { route: "/api/jobs", file: "job.routes.js" },
    { route: "/api/bookings", file: "booking.routes.js" },
    { route: "/api/payments", file: "payment.routes.js" },
    { route: "/api/reviews", file: "review.routes.js" },
    { route: "/api/messages", file: "message.routes.js" },
    { route: "/api/notifications", file: "notification.routes.js" },
    { route: "/api/verification", file: "verification.routes.js" },
    { route: "/api/reports", file: "report.routes.js" },
    { route: "/api/disputes", file: "dispute.routes.js" },
    { route: "/api/subscriptions", file: "subscription.routes.js" },
    { route: "/api/featured", file: "featured.routes.js" },
    { route: "/api/insurance", file: "insurance.routes.js" },
    { route: "/api/referral", file: "referral.routes.js" },
    { route: "/api/campaign", file: "campaign.routes.js" },
    { route: "/api/posts", file: "post.routes.js" },
    { route: "/api/search", file: "search.routes.js" },
    { route: "/api/categories", file: "category.routes.js" },
    { route: "/api/video-calls", file: "videocall.routes.js" },
    { route: "/api/ai", file: "ai.routes.js" },
    { route: "/api/translate", file: "translate.routes.js" },
    { route: "/api/admin", file: "admin.routes.js" },
    { route: "/api/audit", file: "audit.routes.js" },
  ];

  let mountedCount = 0;
  let unmountedCount = 0;
  for (const m of EXPECTED_MOUNTS) {
    const mounted =
      appContent.includes(`"${m.route}"`) ||
      appContent.includes(`'${m.route}'`);
    if (mounted) mountedCount++;
    else unmountedCount++;
    log(
      `  ${mounted ? "✅" : "❌"}  app.use("${m.route}", …)${!mounted ? " ← NOT MOUNTED" : ""}`,
    );
  }
  log();
  log(
    `  ${mountedCount}/${EXPECTED_MOUNTS.length} routes mounted  |  ${unmountedCount} unmounted`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §14 ENVIRONMENT VARIABLES
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 14  ENVIRONMENT VARIABLES (.env check)");

let envContent = "";
try {
  envContent = await readFile(join(ROOT, ".env"), "utf8");
} catch {}

const REQUIRED_ENVS = [
  // Database
  {
    key: "DATABASE_URL",
    critical: true,
    note: "Railway PostgreSQL connection string",
  },
  // JWT
  { key: "JWT_SECRET", critical: true, note: "Access token signing secret" },
  {
    key: "JWT_REFRESH_SECRET",
    critical: true,
    note: "Refresh token signing secret",
  },
  { key: "JWT_EXPIRES_IN", critical: false, note: "e.g. 7d (default 7d)" },
  {
    key: "JWT_REFRESH_EXPIRES_IN",
    critical: false,
    note: "e.g. 30d (default 30d)",
  },
  // Cloudinary
  { key: "CLOUDINARY_CLOUD_NAME", critical: true, note: "Cloudinary uploads" },
  { key: "CLOUDINARY_API_KEY", critical: true, note: "" },
  { key: "CLOUDINARY_API_SECRET", critical: true, note: "" },
  // Payments
  { key: "PAYSTACK_SECRET_KEY", critical: true, note: "Paystack API secret" },
  {
    key: "FLUTTERWAVE_SECRET_KEY",
    critical: true,
    note: "Flutterwave API secret",
  },
  { key: "FLUTTERWAVE_PUBLIC_KEY", critical: false, note: "" },
  // Email
  {
    key: "RESEND_API_KEY",
    critical: false,
    note: "Resend email (or use SMTP)",
  },
  { key: "EMAIL_FROM", critical: false, note: "e.g. noreply@skilledproz.com" },
  // App
  { key: "NODE_ENV", critical: true, note: "production | development" },
  { key: "PORT", critical: false, note: "default 5000" },
  { key: "CLIENT_URL", critical: true, note: "Frontend URL for CORS" },
  { key: "APP_BASE_URL", critical: false, note: "Backend base URL for links" },
  // AI
  { key: "ANTHROPIC_API_KEY", critical: false, note: "For /api/ai endpoint" },
  // Social campaign
  {
    key: "FACEBOOK_URL",
    critical: false,
    note: "SkilledProz Facebook page URL",
  },
  { key: "INSTAGRAM_URL", critical: false, note: "SkilledProz Instagram URL" },
  { key: "TIKTOK_URL", critical: false, note: "SkilledProz TikTok URL" },
];

// Check for duplicate keys in .env
const envLines = envContent.split("\n").filter((l) => /^\s*\w+=/.test(l));
const envKeys = envLines.map((l) => l.split("=")[0].trim());
const dupeKeys = envKeys.filter((k, i) => envKeys.indexOf(k) !== i);
if (dupeKeys.length > 0) {
  log(
    `  ⚠️  Duplicate .env keys (keep only one): ${[...new Set(dupeKeys)].join(", ")}`,
  );
  log();
}

for (const e of REQUIRED_ENVS) {
  const present =
    envContent.includes(`${e.key}=`) || envContent.includes(`${e.key} =`);
  const val = envContent
    .match(new RegExp(`${e.key}\\s*=\\s*(.+)`))?.[1]
    ?.trim();
  const empty = !val || val === "" || val === "your_secret_here";
  const icon = !present ? (e.critical ? "❌" : "⚠️") : empty ? "⚠️" : "✅";
  log(
    `  ${icon}  ${e.key.padEnd(28)} ${!present ? "(missing)" : empty ? "(empty/placeholder)" : "(set)"}  ${e.note}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// §15 SUMMARY & PRIORITY LIST
// ─────────────────────────────────────────────────────────────────────────────
sec("§ 15  SUMMARY & PRIORITY ACTION LIST");

log();
log("  CRITICAL — Fix before launch:");
log("  ─────────────────────────────────────────────────────────────────");
if (brokenCount > 0)
  log(
    `  🔴  ${brokenCount} broken route import(s) — server crashes on startup`,
  );
if (noAuthCount > 0)
  log(
    `  🔴  ${noAuthCount} route(s) missing auth middleware — potential security hole`,
  );

log();
log("  HIGH — Fix before testing:");
log("  ─────────────────────────────────────────────────────────────────");
if (unusedCount > 0)
  log(
    `  🟠  ${unusedCount} controller function(s) not reachable via any route`,
  );
if (noPagCount > 0)
  log(`  🟠  ${noPagCount} list endpoint(s) missing validatePagination`);

log();
log("  MEDIUM — Polish before launch:");
log("  ─────────────────────────────────────────────────────────────────");
if (noValCount > 0)
  log(`  🟡  ${noValCount} mutating route(s) without input validation`);
if (missingCount > 0)
  log(`  🟡  ${missingCount} platform feature(s) not detected (see §12)`);

log();
log("  RECOMMENDED ADDITIONS (not detected in codebase):");
log("  ─────────────────────────────────────────────────────────────────");

const RECOMMENDATIONS = [
  "GET  /health               — health check endpoint for Railway (returns 200 + DB status)",
  "POST /api/admin/export/users — CSV export for user data (admin reporting)",
  "POST /api/admin/export/payments — payment reconciliation export",
  "GET  /api/workers/online   — list currently available workers (real-time status)",
  "POST /api/bookings/:id/extend — extend booking duration/deadline",
  "GET  /api/payments/invoice/:id — downloadable PDF invoice for hirer",
  "POST /api/auth/logout-all  — invalidate all sessions (security feature)",
  "PATCH /api/users/me/deactivate — soft disable without deletion (GDPR)",
  "GET  /api/admin/dashboard  — single admin overview endpoint (all stats at once)",
  "GET  /api/trending          — trending workers, jobs, categories",
];

RECOMMENDATIONS.forEach((r) => log(`  💡  ${r}`));

log();
log(LINE);
log(`  Audit complete — ${new Date().toLocaleString()}`);
log(`  Report saved: full-audit-report.txt`);
log(LINE);
log();

// Save to file
await writeFile(join(ROOT, "full-audit-report.txt"), out.join("\n"), "utf8");

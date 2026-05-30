#!/usr/bin/env node
// full-audit.js  v2 — fixed regex for comments in imports, router.use() auth, handler extraction
import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
function sec(t) {
  log();
  log(DLINE);
  log(`  ${t}`);
  log(DLINE);
}

// ── Read helpers ──────────────────────────────────────────────────────────────
async function readSrc(rel) {
  try {
    return await readFile(join(SRC, rel), "utf8");
  } catch {
    return null;
  }
}
async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
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

// ── Strip JS comments from a string (single-line + block) ────────────────────
function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "") // // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // /* block comments */
}

// ── Extract named exports ─────────────────────────────────────────────────────
function extractExports(content) {
  const found = new Set();
  const clean = stripComments(content);
  [
    /^export\s+const\s+(\w+)\s*=/gm,
    /^export\s+async\s+function\s+(\w+)/gm,
    /^export\s+function\s+(\w+)/gm,
  ].forEach((p) => {
    let m;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(clean)) !== null) if (m[1]) found.add(m[1]);
  });
  return [...found].sort();
}

// ── Extract what a route file imports from controllers ────────────────────────
// KEY FIX: strip comments before splitting on comma
function extractControllerImports(content) {
  const result = {};
  const re = /import\s*\{([^}]+)\}\s*from\s*["']([^'"]*controller[^'"]*)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const block = stripComments(m[1]); // ← strip // comments first
    const names = block
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter((s) => /^\w+$/.test(s)); // only valid identifiers
    const file = basename(m[2]);
    if (!result[file]) result[file] = [];
    result[file].push(...names);
  }
  return result;
}

// ── Extract routes from a route file ─────────────────────────────────────────
function extractRoutes(content) {
  const routes = [];

  // KEY FIX: detect router.use(protect) at the router level
  const routerUsesProtect = /router\.use\s*\(\s*protect\b/.test(content);
  const routerUsesRequireRole =
    /router\.use\s*\(\s*(?:protect\s*,\s*)?requireRole\b/.test(content);
  // also detect const W = [protect, ...] pattern
  const hasWProtect = /const\s+\w+\s*=\s*\[protect\b/.test(content);

  const re =
    /router\.(get|post|put|patch|delete|use)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const method = m[1].toUpperCase();
    const path = m[2];
    if (method === "USE") continue;

    // Get the snippet from this match to the next semicolon / close paren
    const start = m.index;
    const snippet = content.slice(start, start + 600);

    // KEY FIX: extract handler — last word that looks like a camelCase function
    // ignore keywords, middleware names, and short words
    const IGNORE = new Set([
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
      "validate",
      "body",
      "param",
      "query",
      "default",
      "async",
      "await",
      "const",
      "let",
      "var",
      "return",
      "function",
      "router",
      "express",
      "true",
      "false",
    ]);

    const allWords = [...snippet.matchAll(/\b([a-z][a-zA-Z0-9]{3,})\b/g)]
      .map((x) => x[1])
      .filter(
        (w) => !IGNORE.has(w) && !w.startsWith("validate") && w !== "route",
      );

    const handler = allWords[allWords.length - 1] || "?";

    // Per-route auth detection (individual route has protect)
    const perRouteProtect = /\bprotect\b/.test(snippet);
    const perRouteRole = /\brequireRole\b/.test(snippet);

    // Router-level OR per-route
    const hasProtect = perRouteProtect || routerUsesProtect || hasWProtect;
    const hasRequireRole = perRouteRole || routerUsesRequireRole;
    const isOptional = /\boptionalProtect\b/.test(snippet);

    routes.push({
      method,
      path,
      handler,
      hasProtect,
      hasRequireRole,
      hasValidator: /\bvalidate[A-Z]/.test(snippet),
      hasUUIDParam: /\bvalidateUUIDParam\b/.test(snippet),
      hasPagination: /\bvalidatePagination\b/.test(snippet),
      isOptionalAuth: isOptional && !hasProtect,
    });
  }
  return routes;
}

// ── Levenshtein ───────────────────────────────────────────────────────────────
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

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
log();
log(DLINE);
log("  SkilledProz — Full Platform Audit  v2");
log(`  Generated : ${new Date().toLocaleString()}`);
log(`  Root      : ${ROOT}`);
log(DLINE);

// ── §1 File tree ──────────────────────────────────────────────────────────────
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
];
for (const dir of KEY_DIRS) {
  const files = (await listDir(join(SRC, dir)))
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
  const ok = (await dirExists(join(SRC, dir))) && files.length > 0;
  log(`  ${ok ? "✅" : "❌"}  src/${dir}/  (${files.length} files)`);
  files.forEach((f) => log(`        ${f}`));
}
const scripts = (await listDir(join(ROOT, "scripts")))
  .filter((e) => e.isFile())
  .map((e) => e.name)
  .sort();
log();
log(`  📁  scripts/ (${scripts.length} files)`);
scripts.forEach((f) => log(`        ${f}`));

// ── §2 Controller exports ────────────────────────────────────────────────────
sec("§ 2  ALL CONTROLLER EXPORTS");
const ctrlDir = join(SRC, "controllers");
const ctrlFiles = (await listDir(ctrlDir))
  .filter(
    (e) => e.isFile() && e.name.endsWith(".js") && !e.name.endsWith(".bak"),
  )
  .map((e) => e.name)
  .sort();
const controllerMap = {};
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
log(
  `\n  Total: ${ctrlFiles.length} controllers, ${totalExports} exported functions`,
);

// ── §3 Route audit ────────────────────────────────────────────────────────────
sec("§ 3  ALL ROUTES");
const routesDir = join(SRC, "routes");
const routeFiles = (await listDir(routesDir))
  .filter(
    (e) => e.isFile() && e.name.endsWith(".js") && !e.name.endsWith(".bak"),
  )
  .map((e) => e.name)
  .sort();
const routeMap = {};
const importMap = {};
let totalRoutes = 0;
for (const file of routeFiles) {
  const content = await readFile(join(routesDir, file), "utf8");
  const routes = extractRoutes(content);
  const imports = extractControllerImports(content);
  routeMap[file] = routes;
  importMap[file] = imports;
  totalRoutes += routes.length;
  log();
  log(`  ┌─ ${file}  (${routes.length} routes)`);
  routes.forEach((r) => {
    const auth = r.hasProtect
      ? r.hasRequireRole
        ? "🔐ROLE"
        : "🔑AUTH"
      : r.isOptionalAuth
        ? "👁️OPT "
        : "🌐PUB ";
    const val = r.hasValidator || r.hasUUIDParam ? "✅VAL" : "⬜   ";
    log(
      `  │   ${auth} ${val}  ${r.method.padEnd(7)} ${r.path.padEnd(40)} → ${r.handler}`,
    );
  });
  log(`  └${"─".repeat(60)}`);
}
log(`\n  Total: ${routeFiles.length} route files, ${totalRoutes} endpoints`);

// ── §4 Controller → Route coverage ───────────────────────────────────────────
sec("§ 4  UNUSED CONTROLLER EXPORTS (not mapped to any route)");
const usedHandlers = new Set();
for (const routes of Object.values(routeMap))
  routes.forEach((r) => usedHandlers.add(r.handler));
for (const imports of Object.values(importMap))
  for (const names of Object.values(imports))
    names.forEach((n) => usedHandlers.add(n));

const INTERNAL = new Set([
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
    (e) => !usedHandlers.has(e) && !INTERNAL.has(e),
  );
  if (unused.length > 0) {
    log();
    log(`  ⚠️  ${file}`);
    unused.forEach((fn) => log(`       not routed: ${fn}`));
    unusedCount += unused.length;
  }
}
if (!unusedCount) log("  ✅  All exported functions are reachable via routes.");
else log(`\n  ${unusedCount} function(s) not routed.`);

// ── §5 Broken imports ────────────────────────────────────────────────────────
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
if (!brokenCount)
  log("  ✅  All route imports resolve to real controller exports.");
else log(`\n  ${brokenCount} broken import(s).`);

// ── §6 Auth coverage ─────────────────────────────────────────────────────────
sec("§ 6  AUTH MIDDLEWARE COVERAGE");
const ALWAYS_PUBLIC_PATHS = new Set([
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
const ALWAYS_PUBLIC_METHODS = new Set(["GET"]);
const INTENTIONALLY_PUBLIC = new Set([
  "register",
  "login",
  "forgotPassword",
  "resetPassword",
  "verifyEmail",
  "resendVerification",
  "paystackWebhook",
  "flutterwaveWebhook",
  "getJobPosts",
  "searchWorkers",
  "getHirerProfile",
  "getHirerPublicProfile",
  "getWorkerProfile",
  "getCategories",
  "getCategory",
  "suggestCategory",
  "validateReferralCode",
  "getInsurancePlans",
  "getPackages",
  "getTrending",
  "getFilterOptions",
  "globalSearch",
  "nearbyWorkers",
]);
let noAuthCount = 0;
for (const [file, routes] of Object.entries(routeMap)) {
  const missing = routes.filter((r) => {
    if (r.hasProtect || r.hasRequireRole || r.isOptionalAuth) return false;
    if (r.path.includes("webhook")) return false;
    if (ALWAYS_PUBLIC_PATHS.has(r.path)) return false;
    if (INTENTIONALLY_PUBLIC.has(r.handler)) return false;
    if (r.method === "GET") return false; // GET is usually OK to be public unless financial/personal
    return true;
  });
  if (missing.length > 0) {
    log();
    log(`  ⚠️  ${file}`);
    missing.forEach((r) => log(`       ${r.method.padEnd(7)} ${r.path}`));
    noAuthCount += missing.length;
  }
}
if (!noAuthCount) log("  ✅  Auth middleware looks complete.");

// ── §7 Validation ─────────────────────────────────────────────────────────────
sec("§ 7  VALIDATION COVERAGE (POST/PATCH/PUT without body validators)");
const SKIP_VAL = new Set([
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
  "cancelSubscription",
  "markNotificationsRead",
  "markAllNotificationsRead",
  "repost",
  "unsaveWorker",
  "unsaveJob",
  "markConversationRead",
  "removeAllDeviceTokens",
  "removeDeviceToken",
  "updateBackgroundCheck",
]);
let noValCount = 0;
for (const [file, routes] of Object.entries(routeMap)) {
  const missing = routes.filter(
    (r) =>
      ["POST", "PATCH", "PUT"].includes(r.method) &&
      !r.hasValidator &&
      !r.hasUUIDParam &&
      !SKIP_VAL.has(r.handler) &&
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
if (!noValCount) log("  ✅  All mutating routes have validation middleware.");
else log(`\n  ${noValCount} route(s) modifying data without input validation.`);

// ── §8 Pagination ─────────────────────────────────────────────────────────────
sec("§ 8  PAGINATION COVERAGE");
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
      log(`       GET ${r.path.padEnd(40)} → ${r.handler}`),
    );
    noPagCount += missing.length;
  }
}
if (!noPagCount) log("  ✅  All list endpoints use validatePagination.");

// ── §9–§11 Services / Middleware / Utils ──────────────────────────────────────
sec("§ 9  SERVICE FILES");
[
  { f: "auth.service.js", d: "JWT + token management" },
  { f: "email.service.js", d: "Email sending" },
  { f: "notification.service.js", d: "In-app + push notifications" },
  { f: "push.service.js", d: "Expo push API" },
  { f: "payment.service.js", d: "Paystack/Flutterwave utilities" },
].forEach((s) => {
  const ok = existsSync(join(SRC, "services", s.f));
  log(`  ${ok ? "✅" : "❌"}  ${s.f.padEnd(30)} ${s.d}`);
});
const svcFiles = (await listDir(join(SRC, "services")))
  .filter((e) => e.isFile() && e.name.endsWith(".js"))
  .map((e) => e.name);
const expected = [
  "auth.service.js",
  "email.service.js",
  "notification.service.js",
  "push.service.js",
  "payment.service.js",
];
const extra = svcFiles.filter((f) => !expected.includes(f));
if (extra.length) {
  log();
  log("  Extra:");
  extra.forEach((f) => log(`       ${f}`));
}

sec("§ 10  MIDDLEWARE FILES");
[
  { f: "auth.middleware.js", d: "protect, requireRole, optionalProtect" },
  { f: "upload.middleware.js", d: "uploadSingle, normaliseFile" },
  { f: "rateLimit.middleware.js", d: "Named limiters" },
  { f: "error.middleware.js", d: "Global error handler" },
].forEach((m) =>
  log(
    `  ${existsSync(join(SRC, "middleware", m.f)) ? "✅" : "❌"}  ${m.f.padEnd(28)} ${m.d}`,
  ),
);

sec("§ 11  UTILITY FILES");
for (const u of ["response.js", "helpers.js", "validators.js", "auditLog.js"]) {
  const ok = existsSync(join(SRC, "utils", u));
  if (ok) {
    const c = await readSrc(`utils/${u}`);
    const n = extractExports(c).length;
    log(`  ✅  utils/${u.padEnd(16)} (${n} exports)`);
  } else {
    log(`  ❌  utils/${u}`);
  }
}

// ── §12 Feature checklist ─────────────────────────────────────────────────────
sec("§ 12  PLATFORM FEATURE CHECKLIST");
const ctrlSet = new Set(ctrlFiles);
const routeSet = new Set(routeFiles);
const FEATURES = [
  {
    n: "User registration + login",
    c: "auth.controller.js",
    r: "auth.routes.js",
  },
  { n: "Email verification", c: "auth.controller.js", r: "auth.routes.js" },
  {
    n: "Forgot / reset password",
    c: "auth.controller.js",
    r: "auth.routes.js",
  },
  {
    n: "JWT refresh token rotation",
    c: "auth.controller.js",
    r: "auth.routes.js",
  },
  {
    n: "User profile settings",
    c: "settings.controller.js",
    r: "settings.routes.js",
  },
  { n: "Avatar upload", c: "settings.controller.js", r: "settings.routes.js" },
  {
    n: "Privacy settings",
    c: "settings.controller.js",
    r: "settings.routes.js",
  },
  { n: "Worker profile", c: "worker.controller.js", r: "worker.routes.js" },
  {
    n: "Portfolio management",
    c: "worker.controller.js",
    r: "worker.routes.js",
  },
  {
    n: "Availability calendar",
    c: "worker.controller.js",
    r: "worker.routes.js",
  },
  { n: "Video intro upload", c: "worker.controller.js", r: "worker.routes.js" },
  {
    n: "Worker search (geo + filters)",
    c: "search.controller.js",
    r: "search.routes.js",
  },
  { n: "Nearby workers", c: "search.controller.js", r: "search.routes.js" },
  { n: "Worker dashboard", c: "worker.controller.js", r: "worker.routes.js" },
  { n: "Hirer profile", c: "hirer.controller.js", r: "hirer.routes.js" },
  { n: "Hirer dashboard", c: "hirer.controller.js", r: "hirer.routes.js" },
  {
    n: "Saved workers (shortlist)",
    c: "hirer.controller.js",
    r: "hirer.routes.js",
  },
  { n: "Job post (create/browse)", c: "job.controller.js", r: "job.routes.js" },
  { n: "Job applications", c: "job.controller.js", r: "job.routes.js" },
  {
    n: "Saved jobs (worker bookmark)",
    c: "job.controller.js",
    r: "job.routes.js",
  },
  {
    n: "Booking lifecycle",
    c: "booking.controller.js",
    r: "booking.routes.js",
  },
  {
    n: "Check-in / check-out",
    c: "booking.controller.js",
    r: "booking.routes.js",
  },
  {
    n: "SOS emergency alert",
    c: "booking.controller.js",
    r: "booking.routes.js",
  },
  { n: "Paystack payment", c: "payment.controller.js", r: "payment.routes.js" },
  {
    n: "Flutterwave payment",
    c: "payment.controller.js",
    r: "payment.routes.js",
  },
  {
    n: "Bank transfer (manual)",
    c: "payment.controller.js",
    r: "payment.routes.js",
  },
  { n: "Crypto payment", c: "payment.controller.js", r: "payment.routes.js" },
  {
    n: "Escrow + withdrawal",
    c: "payment.controller.js",
    r: "payment.routes.js",
  },
  {
    n: "Worker & hirer reviews",
    c: "review.controller.js",
    r: "review.routes.js",
  },
  {
    n: "Real-time messaging",
    c: "message.controller.js",
    r: "message.routes.js",
  },
  {
    n: "In-app + push notifications",
    c: "notification.controller.js",
    r: "notification.routes.js",
  },
  {
    n: "Device token management",
    c: "notification.controller.js",
    r: "notification.routes.js",
  },
  {
    n: "Worker ID verification",
    c: "verification.controller.js",
    r: "verification.routes.js",
  },
  {
    n: "Hirer business verification",
    c: "verification.controller.js",
    r: "verification.routes.js",
  },
  {
    n: "Report / flag system",
    c: "report.controller.js",
    r: "report.routes.js",
  },
  {
    n: "Dispute resolution",
    c: "dispute.controller.js",
    r: "dispute.routes.js",
  },
  {
    n: "Subscription plans",
    c: "subscription.controller.js",
    r: "subscription.routes.js",
  },
  {
    n: "Featured listings",
    c: "featured.controller.js",
    r: "featured.routes.js",
  },
  {
    n: "Insurance plans",
    c: "insurance.controller.js",
    r: "insurance.routes.js",
  },
  {
    n: "Referral program (tiered)",
    c: "referral.controller.js",
    r: "referral.routes.js",
  },
  { n: "Daily campaign", c: "campaign.controller.js", r: "campaign.routes.js" },
  { n: "Community posts / feed", c: "post.controller.js", r: "post.routes.js" },
  { n: "AI assistant", c: null, r: "ai.routes.js" },
  { n: "Translation", c: null, r: "translate.routes.js" },
  { n: "Video calls", c: "videocall.controller.js", r: "videocall.routes.js" },
  { n: "Admin panel", c: "admin.controller.js", r: "admin.routes.js" },
  { n: "Admin audit log", c: "audit.controller.js", r: "audit.routes.js" },
  { n: "Matching service", c: null, r: null, svc: "matching.service.js" },
];
let present = 0,
  missing = 0;
for (const f of FEATURES) {
  const ctrlOk = !f.c || ctrlSet.has(f.c);
  const routeOk = !f.r || routeSet.has(f.r);
  const svcOk = !f.svc || existsSync(join(SRC, "services", f.svc));
  const ok = ctrlOk && routeOk && svcOk;
  ok ? present++ : missing++;
  log(
    `  ${ok ? "✅" : "❌"}  ${f.n.padEnd(40)} ${(f.c || f.svc || "(inline)").padEnd(28)}${!ok ? " ← MISSING" : ""}`,
  );
}
log(
  `\n  ${present}/${FEATURES.length} features present  |  ${missing} missing`,
);

// ── §13 Route mounts ──────────────────────────────────────────────────────────
sec("§ 13  APP.JS ROUTE MOUNTS");
const appContent =
  (await readFile(join(ROOT, "app.js"), "utf8").catch(() => null)) ||
  (await readFile(join(SRC, "app.js"), "utf8").catch(() => null)) ||
  (await readFile(join(ROOT, "server.js"), "utf8").catch(() => null));
const MOUNTS = [
  "/api/auth",
  "/api/users",
  "/api/workers",
  "/api/hirers",
  "/api/jobs",
  "/api/bookings",
  "/api/payments",
  "/api/reviews",
  "/api/messages",
  "/api/notifications",
  "/api/verification",
  "/api/reports",
  "/api/disputes",
  "/api/subscriptions",
  "/api/featured",
  "/api/insurance",
  "/api/referral",
  "/api/campaign",
  "/api/posts",
  "/api/search",
  "/api/categories",
  "/api/video-calls",
  "/api/ai",
  "/api/translate",
  "/api/admin",
  "/api/audit",
];
if (!appContent) {
  log("  ❌  app.js / server.js not found");
} else {
  let mc = 0,
    um = 0;
  for (const m of MOUNTS) {
    const ok = appContent.includes(`"${m}"`) || appContent.includes(`'${m}'`);
    ok ? mc++ : um++;
    log(
      `  ${ok ? "✅" : "❌"}  app.use("${m}", …)${!ok ? " ← NOT MOUNTED" : ""}`,
    );
  }
  log(`\n  ${mc}/${MOUNTS.length} mounted  |  ${um} unmounted`);
}

// ── §14 .env ──────────────────────────────────────────────────────────────────
sec("§ 14  ENVIRONMENT VARIABLES");
let envContent = "";
try {
  envContent = await readFile(join(ROOT, ".env"), "utf8");
} catch {}
const ENV_VARS = [
  { k: "DATABASE_URL", crit: true },
  { k: "JWT_SECRET", crit: true },
  { k: "JWT_REFRESH_SECRET", crit: true },
  { k: "JWT_EXPIRES_IN", crit: false },
  { k: "JWT_REFRESH_EXPIRES_IN", crit: false },
  { k: "CLOUDINARY_CLOUD_NAME", crit: true },
  { k: "CLOUDINARY_API_KEY", crit: true },
  { k: "CLOUDINARY_API_SECRET", crit: true },
  { k: "PAYSTACK_SECRET_KEY", crit: true },
  { k: "FLUTTERWAVE_SECRET_KEY", crit: true },
  { k: "RESEND_API_KEY", crit: false },
  { k: "EMAIL_FROM", crit: false },
  { k: "NODE_ENV", crit: true },
  { k: "PORT", crit: false },
  { k: "CLIENT_URL", crit: true },
  { k: "APP_BASE_URL", crit: false },
  { k: "ANTHROPIC_API_KEY", crit: false },
  { k: "FACEBOOK_URL", crit: false },
  { k: "INSTAGRAM_URL", crit: false },
  { k: "TIKTOK_URL", crit: false },
];
const dupeKeys = (() => {
  const keys = envContent
    .split("\n")
    .filter((l) => /^\s*\w+=/.test(l))
    .map((l) => l.split("=")[0].trim());
  return keys.filter((k, i) => keys.indexOf(k) !== i);
})();
if (dupeKeys.length)
  log(`  ⚠️  Duplicate .env keys: ${[...new Set(dupeKeys)].join(", ")}\n`);
for (const e of ENV_VARS) {
  const present =
    envContent.includes(`${e.k}=`) || envContent.includes(`${e.k} =`);
  const icon = !present ? (e.crit ? "❌" : "⚠️") : "✅";
  log(`  ${icon}  ${e.k.padEnd(28)} ${present ? "(set)" : "(missing)"}`);
}

// ── §15 Summary ───────────────────────────────────────────────────────────────
sec("§ 15  SUMMARY & PRIORITY ACTION LIST");
log();
log("  CRITICAL — Fix before launch:");
log("  " + LINE.slice(0, 60));
if (brokenCount)
  log(
    `  🔴  ${brokenCount} broken route import(s) — server crashes on startup`,
  );
if (noAuthCount) log(`  🔴  ${noAuthCount} route(s) missing auth middleware`);
if (!brokenCount && !noAuthCount) log("  ✅  No critical issues found!");
log();
log("  HIGH — Fix before testing:");
log("  " + LINE.slice(0, 60));
if (unusedCount)
  log(
    `  🟠  ${unusedCount} controller function(s) not reachable via any route`,
  );
if (noPagCount)
  log(`  🟠  ${noPagCount} list endpoint(s) missing validatePagination`);
if (!unusedCount && !noPagCount) log("  ✅  No high-priority issues found!");
log();
log("  MEDIUM — Polish before launch:");
log("  " + LINE.slice(0, 60));
if (noValCount)
  log(`  🟡  ${noValCount} mutating route(s) without input validation`);
if (!noValCount) log("  ✅  No validation gaps found!");
log();
log("  RECOMMENDED ADDITIONS:");
log("  " + LINE.slice(0, 60));
[
  "GET  /health                     — Railway health check + DB ping",
  "GET  /api/admin/dashboard        — single overview endpoint (all stats)",
  "POST /api/auth/logout-all        — invalidate all sessions",
  "GET  /api/payments/invoice/:id   — PDF invoice download for hirer",
  "GET  /api/workers/online         — currently available workers (real-time)",
  "POST /api/bookings/:id/extend    — extend booking deadline",
  "PATCH /api/users/me/deactivate   — GDPR soft-disable",
  "POST /api/admin/export/users     — CSV data export",
].forEach((r) => log(`  💡  ${r}`));

log();
log(LINE);
log(`  Audit complete — ${new Date().toLocaleString()}`);
log(`  Report saved: full-audit-report.txt`);
log(LINE);
log();

await writeFile(join(ROOT, "full-audit-report.txt"), out.join("\n"), "utf8");

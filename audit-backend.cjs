#!/usr/bin/env node
/**
 * audit-backend.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Run from your backend project root:
 *   node audit-backend.js
 *   node audit-backend.js --out ./audit-report.md   (custom output path)
 *   node audit-backend.js --json                    (also emit JSON)
 *
 * Produces:
 *   audit-report.md   – human-readable admin roadmap
 *   audit-report.json – machine-readable (optional, --json flag)
 *
 * What it reads (never writes/deletes anything):
 *   routes/**, controllers/**, models/**, middlewares/**,
 *   prisma/schema.prisma, package.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const emitJson = args.includes("--json");
const outArg = args.indexOf("--out");
const outFile =
  outArg !== -1
    ? args[outArg + 1]
    : path.join(process.cwd(), "audit-report.md");
const jsonFile = outFile.replace(/\.md$/, ".json");
const ROOT = process.cwd();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function walkDir(dir, exts = [".js", ".ts"], result = []) {
  if (!exists(dir)) return result;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walkDir(full, exts, result);
    else if (exts.some((e) => full.endsWith(e))) result.push(full);
  }
  return result;
}

function rel(p) {
  return path.relative(ROOT, p);
}

// ─── Parse routes file ────────────────────────────────────────────────────────
// Extracts: METHOD  PATH  [middleware]  handler
const ROUTE_RE =
  /router\.(get|post|put|patch|delete|head)\s*\(\s*['"`]([^'"`]+)['"`]([^)]*)\)/gi;

function parseRoutes(src) {
  const routes = [];
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const routePath = m[2];
    const rest = m[3] ?? "";
    // Grab identifiers after the path (middleware + handler)
    const fns = rest.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g) ?? [];
    const handler = fns[fns.length - 1] ?? "?";
    const middlewares = fns.slice(0, -1);
    routes.push({ method, path: routePath, handler, middlewares });
  }
  return routes;
}

// ─── Parse controller functions ───────────────────────────────────────────────
const EXPORT_FN_RE =
  /exports\.(\w+)\s*=|async function\s+(\w+)|const\s+(\w+)\s*=\s*async/g;

function parseControllerFns(src) {
  const fns = new Set();
  let m;
  EXPORT_FN_RE.lastIndex = 0;
  while ((m = EXPORT_FN_RE.exec(src)) !== null) {
    const name = m[1] || m[2] || m[3];
    if (name && !["require", "module", "exports"].includes(name)) fns.add(name);
  }
  return [...fns];
}

// ─── Parse Prisma schema ──────────────────────────────────────────────────────
function parsePrismaSchema(src) {
  const models = [];
  const modelRe = /model\s+(\w+)\s*\{([^}]+)\}/g;
  const enumRe = /enum\s+(\w+)\s*\{([^}]+)\}/g;
  let m;

  while ((m = modelRe.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const fields = [];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@"))
        continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        fields.push({
          name: parts[0],
          type: parts[1],
          modifiers: parts.slice(2),
        });
      }
    }
    models.push({ name, fields });
  }

  const enums = [];
  while ((m = enumRe.exec(src)) !== null) {
    const values = m[2]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//"));
    enums.push({ name: m[1], values });
  }
  return { models, enums };
}

// ─── Detect auth middleware ───────────────────────────────────────────────────
function detectAuth(middlewares) {
  const lower = middlewares.map((m) => m.toLowerCase());
  if (lower.some((m) => m.includes("admin"))) return "admin";
  if (
    lower.some(
      (m) => m.includes("auth") || m.includes("protect") || m.includes("verif"),
    )
  )
    return "auth";
  return "public";
}

// ─── Map route → admin concern ────────────────────────────────────────────────
const ADMIN_SECTIONS = {
  users: /\/users?|\/auth|\/profile|\/workers?/i,
  bookings: /\/bookings?/i,
  payments: /\/payments?|\/withdraw|\/earning|\/payout/i,
  jobs: /\/jobs?|\/application/i,
  reviews: /\/reviews?/i,
  disputes: /\/disputes?/i,
  categories: /\/categor/i,
  notifications: /\/notif/i,
  messages: /\/messages?|\/chat|\/conversation/i,
  insurance: /\/insurance/i,
  subscriptions: /\/subscri|\/plan|\/billing/i,
  boosts: /\/boost|\/feature|\/promo/i,
  verifications: /\/verif/i,
  reports: /\/report|\/analytic|\/stat|\/dashboard/i,
  settings: /\/setting|\/config/i,
  media: /\/upload|\/media|\/file|\/image/i,
};

function classifyRoute(routePath) {
  for (const [section, re] of Object.entries(ADMIN_SECTIONS)) {
    if (re.test(routePath)) return section;
  }
  return "other";
}

// ─── CRUD coverage detector ───────────────────────────────────────────────────
function crudCoverage(routes) {
  const has = (method, re) =>
    routes.some((r) => r.method === method && re.test(r.path));
  return {
    create: has("POST", /./) ? "✅" : "—",
    readOne: has("GET", /\/:[a-z]/i) ? "✅" : "—",
    readAll: has("GET", /^[^:]*$/) ? "✅" : "—",
    update: has("PUT", /./) || has("PATCH", /./) ? "✅" : "—",
    delete: has("DELETE", /./) ? "✅" : "—",
  };
}

// ─── Scan backend ─────────────────────────────────────────────────────────────
console.log("🔍  Scanning backend at:", ROOT);

// 1. Routes
const ROUTES_DIRS = ["routes", "src/routes", "api/routes"].map((d) =>
  path.join(ROOT, d),
);
const routeFiles = ROUTES_DIRS.flatMap((d) => walkDir(d));

// 2. Controllers
const CTRL_DIRS = ["controllers", "src/controllers", "api/controllers"].map(
  (d) => path.join(ROOT, d),
);
const ctrlFiles = CTRL_DIRS.flatMap((d) => walkDir(d));

// 3. Models / Prisma
const prismaFile = ["prisma/schema.prisma", "schema.prisma"]
  .map((f) => path.join(ROOT, f))
  .find(exists);
const MODEL_DIRS = ["models", "src/models"].map((d) => path.join(ROOT, d));
const modelFiles = MODEL_DIRS.flatMap((d) => walkDir(d));

// 4. Middleware
const MW_DIRS = ["middleware", "middlewares", "src/middleware"].map((d) =>
  path.join(ROOT, d),
);
const mwFiles = MW_DIRS.flatMap((d) => walkDir(d));

// 5. package.json
const pkgPath = path.join(ROOT, "package.json");
const pkg = exists(pkgPath) ? JSON.parse(read(pkgPath)) : {};

console.log(`   Route files found  : ${routeFiles.length}`);
console.log(`   Controller files   : ${ctrlFiles.length}`);
console.log(`   Model files        : ${modelFiles.length}`);
console.log(`   Middleware files   : ${mwFiles.length}`);
console.log(
  `   Prisma schema      : ${prismaFile ? "✅ found" : "❌ not found"}`,
);

// ─── Build audit object ───────────────────────────────────────────────────────
const audit = {
  meta: {
    project: pkg.name ?? path.basename(ROOT),
    version: pkg.version ?? "?",
    description: pkg.description ?? "",
    dependencies: Object.keys(pkg.dependencies ?? {}),
    devDependencies: Object.keys(pkg.devDependencies ?? {}),
    scannedAt: new Date().toISOString(),
    rootDir: ROOT,
  },
  schema: prismaFile
    ? parsePrismaSchema(read(prismaFile))
    : { models: [], enums: [] },
  routeFiles: [],
  controllers: [],
  middlewares: [],
  sections: {}, // grouped by admin section
};

// Parse route files
for (const file of routeFiles) {
  const src = read(file);
  const routes = parseRoutes(src);
  const name = path.basename(file, path.extname(file));
  audit.routeFiles.push({ file: rel(file), name, routes });

  // Group into sections
  for (const route of routes) {
    const section = classifyRoute(`/${name}/${route.path}`);
    if (!audit.sections[section]) {
      audit.sections[section] = { routes: [], controllers: [], models: [] };
    }
    audit.sections[section].routes.push({
      file: rel(file),
      ...route,
      auth: detectAuth(route.middlewares),
    });
  }
}

// Parse controllers
for (const file of ctrlFiles) {
  const src = read(file);
  const fns = parseControllerFns(src);
  const name = path.basename(file, path.extname(file));
  audit.controllers.push({ file: rel(file), name, functions: fns });
}

// Parse middlewares
for (const file of mwFiles) {
  const src = read(file);
  const fns = parseControllerFns(src);
  const name = path.basename(file, path.extname(file));
  const isAuth = /auth|protect|jwt|session/i.test(name);
  const isAdmin = /admin|role|permission/i.test(name);
  audit.middlewares.push({
    file: rel(file),
    name,
    functions: fns,
    isAuth,
    isAdmin,
  });
}

// Map Prisma models → sections
for (const model of audit.schema.models) {
  const section = classifyRoute(`/${model.name}`);
  if (audit.sections[section]) {
    audit.sections[section].models.push(model.name);
  }
}

// ─── Generate Markdown report ─────────────────────────────────────────────────
const lines = [];

const h1 = (t) => lines.push(`# ${t}\n`);
const h2 = (t) => lines.push(`## ${t}\n`);
const h3 = (t) => lines.push(`### ${t}\n`);
const p = (t) => lines.push(`${t}\n`);
const li = (t) => lines.push(`- ${t}`);
const row = (...cells) => lines.push("| " + cells.join(" | ") + " |");
const sep = (n) => lines.push("| " + Array(n).fill("---").join(" | ") + " |");
const hr = () => lines.push("---\n");
const br = () => lines.push("");

h1(`SkilledProz Admin — Backend Audit & Build Roadmap`);
p(
  `> Generated: ${new Date().toLocaleString()}  |  Project: **${audit.meta.project}** v${audit.meta.version}`,
);
p(`> Backend root: \`${ROOT}\``);
hr();

// ── 1. Stack ──────────────────────────────────────────────────────────────────
h2("1. Backend Stack");
const deps = audit.meta.dependencies;
const highlights = [
  [
    "Runtime",
    deps.includes("express")
      ? "Express.js"
      : deps.includes("fastify")
        ? "Fastify"
        : "Node.js",
  ],
  [
    "ORM",
    deps.includes("@prisma/client")
      ? "Prisma"
      : deps.includes("mongoose")
        ? "Mongoose"
        : deps.includes("sequelize")
          ? "Sequelize"
          : "Unknown",
  ],
  [
    "Auth",
    deps.includes("jsonwebtoken")
      ? "JWT"
      : deps.includes("passport")
        ? "Passport"
        : "?",
  ],
  [
    "Payments",
    [
      deps.includes("stripe") && "Stripe",
      deps.includes("paystack") && "Paystack",
    ]
      .filter(Boolean)
      .join(", ") || "?",
  ],
  [
    "File Upload",
    deps.includes("multer")
      ? "Multer"
      : deps.includes("busboy")
        ? "Busboy"
        : "?",
  ],
  [
    "Email",
    deps.includes("nodemailer")
      ? "Nodemailer"
      : deps.includes("@sendgrid/mail")
        ? "SendGrid"
        : "?",
  ],
  ["Realtime", deps.includes("socket.io") ? "Socket.io" : "?"],
  ["Cache", deps.includes("redis") || deps.includes("ioredis") ? "Redis" : "?"],
];
row("Concern", "Library");
sep(2);
for (const [concern, lib] of highlights) row(concern, lib);
br();

// ── 2. Database Models ────────────────────────────────────────────────────────
h2("2. Database Models (Prisma Schema)");
if (audit.schema.models.length === 0) {
  p(
    "_No Prisma schema found — check for Mongoose/Sequelize models in /models_",
  );
  for (const m of audit.controllers) {
    li(`Model file: \`${m.file}\` — functions: ${m.functions.join(", ")}`);
  }
} else {
  p(
    `**${audit.schema.models.length} models** | **${audit.schema.enums.length} enums**`,
  );
  br();
  row("Model", "Key Fields", "Enum Values / Notes");
  sep(3);
  for (const model of audit.schema.models) {
    const keyFields = model.fields
      .filter((f) => !["id", "createdAt", "updatedAt"].includes(f.name))
      .slice(0, 6)
      .map((f) => `\`${f.name}\``)
      .join(", ");
    const relatedEnum = audit.schema.enums.find((e) =>
      model.fields.some((f) => f.type === e.name),
    );
    row(
      `**${model.name}**`,
      keyFields,
      relatedEnum ? relatedEnum.values.join(", ") : "—",
    );
  }
  br();
  if (audit.schema.enums.length) {
    h3("Enums");
    for (const e of audit.schema.enums) {
      li(`\`${e.name}\`: ${e.values.join(" | ")}`);
    }
  }
}
br();

// ── 3. All API Endpoints ──────────────────────────────────────────────────────
h2("3. All API Endpoints");
p(
  `Total route files: **${audit.routeFiles.length}**  |  Total routes: **${audit.routeFiles.reduce((n, f) => n + f.routes.length, 0)}**`,
);
br();

const AUTH_ICON = { admin: "🔴 admin", auth: "🟡 auth", public: "🟢 public" };

for (const rf of audit.routeFiles.sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!rf.routes.length) continue;
  h3(`\`${rf.file}\``);
  row("Method", "Path", "Handler", "Auth", "Admin Component Needed");
  sep(5);
  for (const r of rf.routes) {
    const auth = detectAuth(r.middlewares);
    const authLabel = AUTH_ICON[auth] ?? auth;
    const section = classifyRoute(r.path);
    const component = suggestAdminComponent(r.method, r.path, rf.name);
    row(
      `\`${r.method}\``,
      `\`${r.path}\``,
      `\`${r.handler}\``,
      authLabel,
      component,
    );
  }
  br();
}

// ── 4. Admin Sections Roadmap ─────────────────────────────────────────────────
h2("4. Admin Panel — Build Roadmap by Section");
p(
  "Each section maps directly to backend route groups. Build order follows dependency chain.",
);
br();

const SECTION_META = {
  users: {
    priority: 1,
    icon: "👥",
    label: "Users & Workers",
    desc: "List, view, edit, ban, verify users. View worker profiles, categories, portfolio, certifications.",
  },
  bookings: {
    priority: 2,
    icon: "📅",
    label: "Bookings",
    desc: "All bookings table, filter by status, view detail, force-complete, cancel, assign disputes.",
  },
  payments: {
    priority: 3,
    icon: "💳",
    label: "Payments & Payouts",
    desc: "Payment records, escrow status, payout queue, manual release, refunds, fee settings.",
  },
  jobs: {
    priority: 4,
    icon: "💼",
    label: "Jobs & Applications",
    desc: "Job posts, applications per job, approve/reject, flag, delete.",
  },
  disputes: {
    priority: 5,
    icon: "⚖️",
    label: "Disputes",
    desc: "Dispute queue, assign resolver, add ruling, close dispute, link to booking.",
  },
  reviews: {
    priority: 6,
    icon: "⭐",
    label: "Reviews",
    desc: "All reviews, flag/remove, respond as platform, ratings analytics.",
  },
  categories: {
    priority: 7,
    icon: "🏷️",
    label: "Categories",
    desc: "CRUD categories, slugs, icons, worker count per category, featured toggle.",
  },
  notifications: {
    priority: 8,
    icon: "🔔",
    label: "Notifications",
    desc: "Broadcast notifications, templates, per-user history, mark read.",
  },
  messages: {
    priority: 9,
    icon: "💬",
    label: "Messages",
    desc: "Conversation list, view threads (read-only), flag abusive messages.",
  },
  verifications: {
    priority: 10,
    icon: "🛡️",
    label: "Verifications",
    desc: "Pending ID verifications, approve/reject, view documents, audit log.",
  },
  insurance: {
    priority: 11,
    icon: "🔒",
    label: "Insurance",
    desc: "Plans, active policies per booking, claims, payout triggers.",
  },
  subscriptions: {
    priority: 12,
    icon: "💎",
    label: "Subscriptions",
    desc: "Plans, active subs per user, upgrade/downgrade, cancellations, billing history.",
  },
  boosts: {
    priority: 13,
    icon: "🚀",
    label: "Boosts & Featured",
    desc: "Active boosts, approve listing boosts, featured slots management, pricing.",
  },
  reports: {
    priority: 14,
    icon: "📊",
    label: "Analytics & Reports",
    desc: "Revenue chart, user growth, booking funnel, top workers, top hirers, export CSV.",
  },
  settings: {
    priority: 15,
    icon: "⚙️",
    label: "Platform Settings",
    desc: "Fee %, platform config, feature flags, email templates, maintenance mode.",
  },
  media: {
    priority: 16,
    icon: "🖼️",
    label: "Media",
    desc: "Uploaded files, CDN management, orphaned file cleanup.",
  },
  other: {
    priority: 17,
    icon: "📦",
    label: "Other",
    desc: "Misc endpoints not categorised above.",
  },
};

const sortedSections = Object.entries(audit.sections).sort(
  ([a], [b]) =>
    (SECTION_META[a]?.priority ?? 99) - (SECTION_META[b]?.priority ?? 99),
);

for (const [sectionKey, sectionData] of sortedSections) {
  const meta = SECTION_META[sectionKey] ?? {
    icon: "📦",
    label: sectionKey,
    desc: "",
  };
  const crud = crudCoverage(sectionData.routes);

  h3(`${meta.icon} ${meta.label}`);
  p(`> ${meta.desc}`);
  br();

  // CRUD coverage
  p(
    `**CRUD coverage:** CREATE ${crud.create}  LIST ${crud.readAll}  DETAIL ${crud.readOne}  UPDATE ${crud.update}  DELETE ${crud.delete}`,
  );
  br();

  // Routes table
  if (sectionData.routes.length) {
    row("Method", "Endpoint", "Auth", "Handler");
    sep(4);
    for (const r of sectionData.routes) {
      row(
        `\`${r.method}\``,
        `\`${r.path}\``,
        AUTH_ICON[r.auth] ?? r.auth,
        `\`${r.handler}\``,
      );
    }
    br();
  }

  // Admin components to build
  p("**Admin components to build:**");
  for (const comp of suggestComponents(
    sectionKey,
    sectionData.routes,
    sectionData.models,
  )) {
    li(comp);
  }
  br();
  hr();
}

// ── 5. Middleware inventory ────────────────────────────────────────────────────
h2("5. Middleware Inventory");
row("File", "Type", "Functions");
sep(3);
for (const mw of audit.middlewares) {
  const type = mw.isAdmin
    ? "🔴 admin guard"
    : mw.isAuth
      ? "🟡 auth"
      : "🟢 general";
  row(`\`${mw.file}\``, type, mw.functions.slice(0, 6).join(", "));
}
br();

// ── 6. Controller inventory ────────────────────────────────────────────────────
h2("6. Controller Function Inventory");
for (const ctrl of audit.controllers.sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  p(`**\`${ctrl.file}\`** — ${ctrl.functions.length} functions`);
  if (ctrl.functions.length)
    p(ctrl.functions.map((f) => `\`${f}\``).join("  ·  "));
  br();
}

// ── 7. Admin Panel File Structure ─────────────────────────────────────────────
h2("7. Suggested Admin Panel File Structure");
p("```");
p("admin/");
p("├── src/");
p("│   ├── api/            # Axios client + per-section API files");
p("│   ├── components/     # Shared: Table, Modal, Badge, StatCard, Sidebar");
p("│   ├── pages/          # One folder per section");
for (const [key, meta] of Object.entries(SECTION_META)) {
  if (audit.sections[key]) {
    p(`│   │   ├── ${key}/    # ${meta.label}`);
  }
}
p("│   ├── hooks/          # useTable, useModal, useToast, useAuth");
p("│   ├── store/          # Zustand slices per section");
p("│   ├── utils/          # fmtDate, fmtCurrency, export, roleGuard");
p("│   └── App.jsx");
p("├── .env.local          # VITE_API_BASE_URL");
p(
  "└── package.json        # Vite + React + Tailwind + Tanstack Table + Recharts",
);
p("```");
br();

// ── 8. Build Order ────────────────────────────────────────────────────────────
h2("8. Recommended Build Order");
p(
  "Follow this sequence — later sections depend on earlier ones (e.g. disputes need bookings).",
);
br();
row("Phase", "Section", "Estimated Components", "Depends On");
sep(4);
const phases = [
  [
    "1 — Foundation",
    "Auth / Login",
    "LoginPage, AdminGuard, Layout, Sidebar",
    "—",
  ],
  [
    "1 — Foundation",
    "Dashboard Home",
    "StatsBar, RevenueChart, ActivityFeed",
    "all sections",
  ],
  [
    "2 — Core Data",
    "Users & Workers",
    "UsersTable, UserDetail, WorkerProfile, BanModal",
    "—",
  ],
  [
    "2 — Core Data",
    "Categories",
    "CategoryTable, CategoryForm, SlugEditor",
    "—",
  ],
  [
    "3 — Transactions",
    "Bookings",
    "BookingsTable, BookingDetail, StatusChanger",
    "Users",
  ],
  [
    "3 — Transactions",
    "Payments & Payouts",
    "PaymentsTable, PayoutQueue, ReleaseModal",
    "Bookings",
  ],
  [
    "4 — Content",
    "Jobs & Applications",
    "JobsTable, JobDetail, ApplicationsPanel",
    "Users",
  ],
  [
    "4 — Content",
    "Reviews",
    "ReviewsTable, FlagModal, RatingChart",
    "Users, Bookings",
  ],
  [
    "5 — Safety",
    "Disputes",
    "DisputeQueue, DisputeDetail, RulingForm",
    "Bookings",
  ],
  [
    "5 — Safety",
    "Verifications",
    "VerifQueue, DocViewer, ApproveRejectBar",
    "Users",
  ],
  [
    "6 — Engagement",
    "Notifications",
    "BroadcastForm, NotifHistory, TemplateEditor",
    "Users",
  ],
  ["6 — Engagement", "Messages", "ConversationList, ThreadViewer", "Users"],
  [
    "7 — Monetisation",
    "Subscriptions",
    "PlansTable, ActiveSubs, BillingHistory",
    "Users, Payments",
  ],
  [
    "7 — Monetisation",
    "Boosts",
    "BoostQueue, FeaturedSlots, PricingEditor",
    "Users",
  ],
  [
    "7 — Monetisation",
    "Insurance",
    "PoliciesTable, ClaimsQueue, PayoutTrigger",
    "Bookings",
  ],
  [
    "8 — Insights",
    "Analytics & Reports",
    "RevenueChart, UserGrowth, FunnelChart, CSV Export",
    "all",
  ],
  [
    "9 — Config",
    "Platform Settings",
    "FeeSlider, FeatureFlags, EmailTemplates",
    "—",
  ],
  ["9 — Config", "Media", "FileManager, OrphanCleaner", "—"],
];
for (const cols of phases) row(...cols);
br();

// ── 9. API Client skeleton ────────────────────────────────────────────────────
h2("9. Admin API Client Pattern");
p("Each section gets its own API file. Pattern to use:");
p("```js");
p("// src/api/bookings.js");
p("import api from './client';");
p(
  "export const getBookings = (params) => api.get('/admin/bookings', { params });",
);
p("export const getBooking  = (id)     => api.get(`/admin/bookings/${id}`);");
p(
  "export const updateBooking = (id, data) => api.patch(`/admin/bookings/${id}`, data);",
);
p(
  "export const deleteBooking = (id)   => api.delete(`/admin/bookings/${id}`);",
);
p("```");
br();

// ── 10. Gaps / Missing ────────────────────────────────────────────────────────
h2("10. Gaps & Recommendations");
const gaps = [];
if (!audit.sections.reports)
  gaps.push(
    "❌ No `/admin/analytics` or `/admin/stats` routes found — admin dashboard will need custom aggregation endpoints",
  );
if (!audit.middlewares.some((m) => m.isAdmin))
  gaps.push(
    "❌ No dedicated admin-guard middleware detected — ensure admin role check before exposing admin routes",
  );
if (!audit.sections.settings)
  gaps.push(
    "⚠️ No platform settings endpoints — consider adding `/admin/settings` for fee %, feature flags",
  );
if (!audit.meta.dependencies.includes("socket.io"))
  gaps.push(
    "⚠️ No Socket.io — real-time admin notifications (new disputes, SOS alerts) will need polling",
  );
if (
  !audit.meta.dependencies.includes("redis") &&
  !audit.meta.dependencies.includes("ioredis")
)
  gaps.push("⚠️ No Redis — consider caching admin dashboard stats");
if (!audit.schema.models.find((m) => m.name === "AuditLog"))
  gaps.push(
    "❌ No AuditLog model — recommend adding for admin action tracking (who changed what)",
  );

if (gaps.length === 0) gaps.push("✅ No critical gaps detected");
for (const g of gaps) li(g);
br();

p("---");
p(
  "*This report was generated by `audit-backend.js`. Re-run after any schema or route changes.*",
);

// ─── Helper: suggest admin component name for a route ─────────────────────────
function suggestAdminComponent(method, routePath, fileName) {
  const isId = /\/:[a-z]/i.test(routePath);
  const m = {
    GET: isId ? "DetailPage / ViewModal" : "DataTable / ListPage",
    POST: "CreateForm / CreateModal",
    PUT: "EditForm / EditModal",
    PATCH: "EditForm / StatusChanger",
    DELETE: "DeleteConfirmModal",
  };
  return m[method] ?? "Component";
}

// ─── Helper: suggest components list for a section ────────────────────────────
function suggestComponents(section, routes, models) {
  const base = {
    users: [
      "`UsersTable` — sortable/filterable list of all users + role badge",
      "`UserDetailDrawer` — full profile, edit role, ban, delete",
      "`WorkersPanel` — worker-specific: categories, portfolio, certifications, availability",
      "`UserStatsBar` — total users, new this week, banned count",
    ],
    bookings: [
      "`BookingsTable` — all bookings with status filter + date range",
      "`BookingDetailModal` — full booking view, status override, notes",
      "`BookingStatusChanger` — force accept / complete / cancel with reason",
      "`BookingStatsBar` — active, pending, completed, disputed counts",
    ],
    payments: [
      "`PaymentsTable` — all transactions, filter by status/provider",
      "`PayoutQueue` — pending worker payouts, bulk release",
      "`ReleasePaymentModal` — confirm escrow release with audit note",
      "`RefundModal` — initiate refund with reason",
      "`RevenueChart` — monthly revenue with fee breakdown",
    ],
    jobs: [
      "`JobsTable` — all job posts, filter by status/category",
      "`JobDetailModal` — full job view, flag, delete, feature",
      "`ApplicationsPanel` — per-job applications, worker info",
    ],
    disputes: [
      "`DisputeQueue` — open disputes sorted by age",
      "`DisputeDetailPanel` — full timeline, messages, evidence",
      "`RulingForm` — add admin ruling, assign winner, trigger refund/release",
      "`DisputeStatsBar` — open, resolved, avg resolution time",
    ],
    reviews: [
      "`ReviewsTable` — all reviews, rating filter, flagged filter",
      "`ReviewFlagModal` — flag reason + remove from public",
    ],
    categories: [
      "`CategoriesTable` — list with worker count per category",
      "`CategoryForm` — create/edit: name, slug, icon, parent, featured toggle",
      "`CategoryWorkerCount` — badge showing assigned workers",
    ],
    notifications: [
      "`BroadcastForm` — send to all / role / user segment",
      "`NotifHistoryTable` — sent notifications with open rate",
      "`TemplateEditor` — email / push notification templates",
    ],
    messages: [
      "`ConversationListTable` — all conversations, flagged first",
      "`ThreadViewerModal` — read-only message thread + flag",
    ],
    verifications: [
      "`VerifQueue` — pending ID verifications sorted by submitted date",
      "`DocViewerModal` — display uploaded ID documents",
      "`ApproveRejectBar` — one-click approve/reject with reason",
    ],
    insurance: [
      "`PoliciesTable` — active policies per booking",
      "`ClaimsQueue` — open claims, link to booking",
      "`ClaimPayoutTrigger` — admin-initiated payout",
    ],
    subscriptions: [
      "`PlansManager` — create/edit plans, pricing, features",
      "`ActiveSubsTable` — users on each plan, renewal dates",
      "`BillingHistoryTable` — all subscription payments",
    ],
    boosts: [
      "`BoostQueue` — pending boost requests",
      "`FeaturedSlotsManager` — which listings are featured",
      "`BoostPricingEditor` — set boost durations and prices",
    ],
    reports: [
      "`RevenueChart` — monthly/weekly with Recharts",
      "`UserGrowthChart` — new users over time",
      "`BookingFunnelChart` — conversion: posted → accepted → completed",
      "`TopWorkersTable` — by earnings / bookings",
      "`TopHirersTable` — by spend / bookings",
      "`ExportCSVButton` — export any table",
    ],
    settings: [
      "`FeeSettings` — platform fee %, payout thresholds",
      "`FeatureFlags` — toggle features on/off",
      "`MaintenanceToggle` — enable maintenance mode banner",
    ],
    media: [
      "`FileManager` — browse uploaded files by type/date",
      "`OrphanCleaner` — detect and delete unused uploads",
    ],
    other: ["`GenericApiExplorer` — raw endpoint tester for misc routes"],
  };
  return (
    base[section] ?? [
      `\`${section}Table\``,
      `\`${section}DetailModal\``,
      `\`${section}Form\``,
    ]
  );
}

// ─── Write outputs ────────────────────────────────────────────────────────────
fs.writeFileSync(outFile, lines.join("\n"), "utf8");
console.log(`\n✅  Markdown report written to: ${outFile}`);

if (emitJson) {
  fs.writeFileSync(jsonFile, JSON.stringify(audit, null, 2), "utf8");
  console.log(`✅  JSON report written to:     ${jsonFile}`);
}

console.log("\n📋  Summary:");
console.log(`   Models    : ${audit.schema.models.length}`);
console.log(`   Enums     : ${audit.schema.enums.length}`);
console.log(
  `   Routes    : ${audit.routeFiles.reduce((n, f) => n + f.routes.length, 0)}`,
);
console.log(`   Sections  : ${Object.keys(audit.sections).join(", ")}`);
console.log(`   Middlewares: ${audit.middlewares.length}`);
console.log(`   Controllers: ${audit.controllers.length}`);
console.log(
  "\n🚀  Paste the generated audit-report.md back to Claude to get the admin build started.\n",
);

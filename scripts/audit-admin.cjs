#!/usr/bin/env node
/**
 * scripts/audit-admin.js
 *
 * Read-only audit of all admin routes and admin controller functions
 * in the backend project. Generates a map you can reference while
 * wiring frontend admin components.
 *
 * Usage:
 *   node scripts/audit-admin.js
 *   node scripts/audit-admin.js --json > admin-audit.json
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const JSON_OUT = process.argv.includes("--json");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "build"].includes(entry.name))
        continue;
      walk(full, out);
    } else if (entry.isFile() && full.endsWith(".js")) {
      out.push(full);
    }
  }
  return out;
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

// ── 1. Find every admin route file ────────────────────────────────────────────
function findAdminRouteFiles(files) {
  return files.filter(
    (f) => /admin.*routes?\.js$/i.test(f) || /routes?.*admin.*\.js$/i.test(f),
  );
}

// ── 2. Find every admin controller file ───────────────────────────────────────
function findAdminControllerFiles(files) {
  return files.filter(
    (f) =>
      /admin.*controller\.js$/i.test(f) ||
      /controllers?.*admin.*\.js$/i.test(f),
  );
}

// ── 3. Extract router HTTP verb calls from a routes file ──────────────────────
function extractRoutes(filePath) {
  const src = readFileSafe(filePath);
  const routes = [];
  // Match: router.get("/path", [middleware...], handler)
  // or    router.patch("/path", ...validateUUIDParam("x"), handler)
  const re =
    /router\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]+)\2\s*,([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const [, method, , routePath, tail] = m;
    // Handler = last identifier in the tail (after the last comma)
    const parts = tail
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const handler = parts.length
      ? parts[parts.length - 1].replace(/\/\/.*$/, "").trim()
      : null;
    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      handler,
      file: filePath,
    });
  }
  // Also catch router.use(...) chains (for base auth)
  const uses = [];
  const useRe = /router\.use\s*\(([^)]+)\)/g;
  let u;
  while ((u = useRe.exec(src)) !== null) {
    uses.push(u[1].trim());
  }
  return { routes, uses, file: filePath };
}

// ── 4. Extract exported functions from a controller file ──────────────────────
function extractExports(filePath) {
  const src = readFileSafe(filePath);
  const names = new Set();
  // export const foo = ...
  let m;
  const re1 = /export\s+const\s+([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re1.exec(src)) !== null) names.add(m[1]);
  // export async function foo
  const re2 = /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  while ((m = re2.exec(src)) !== null) names.add(m[1]);
  // export { a, b, c }
  const re3 = /export\s*\{\s*([^}]+)\}/g;
  while ((m = re3.exec(src)) !== null) {
    m[1].split(",").forEach((n) => {
      const name = n
        .trim()
        .split(/\s+as\s+/)
        .pop()
        .trim();
      if (name) names.add(name);
    });
  }
  // count lines for size info
  const lines = src.split("\n").length;
  return { names: [...names], lines, file: filePath };
}

// ── 5. Find where routers are mounted in server/app ───────────────────────────
function findMounts(files) {
  const mounts = [];
  for (const f of files) {
    if (!/(server|app|index)\.js$/i.test(f)) continue;
    const src = readFileSafe(f);
    // app.use("/api/admin", adminRoutes)
    const re =
      /app\.use\s*\(\s*(["'`])([^"'`]+)\1\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      mounts.push({ mountPath: m[2], router: m[3], file: f });
    }
  }
  return mounts;
}

// ── 6. Group routes by controller ─────────────────────────────────────────────
function group(routes) {
  const byFile = {};
  for (const r of routes) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  }
  return byFile;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const allFiles = walk(SRC);
  const adminRouteFiles = findAdminRouteFiles(allFiles);
  const adminControllerFiles = findAdminControllerFiles(allFiles);
  const mounts = findMounts(allFiles);

  const output = {
    generatedAt: new Date().toISOString(),
    projectRoot: ROOT,
    mounts,
    routeFiles: [],
    controllerFiles: [],
    summary: {},
  };

  // routeFiles → routes grouped
  for (const rf of adminRouteFiles) {
    const { routes, uses } = extractRoutes(rf);
    output.routeFiles.push({
      file: path.relative(ROOT, rf),
      uses,
      routes: routes.map((r) => ({
        method: r.method,
        path: r.path,
        handler: r.handler,
      })),
    });
  }

  // controllerFiles → exports grouped
  for (const cf of adminControllerFiles) {
    const { names, lines } = extractExports(cf);
    output.controllerFiles.push({
      file: path.relative(ROOT, cf),
      lines,
      exports: names,
    });
  }

  // summary counts
  output.summary = {
    mountPoints: mounts.length,
    routeFiles: output.routeFiles.length,
    routes: output.routeFiles.reduce((s, rf) => s + rf.routes.length, 0),
    controllerFiles: output.controllerFiles.length,
    exports: output.controllerFiles.reduce((s, cf) => s + cf.exports.length, 0),
  };

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(output, null, 2));
    return;
  }

  // ── Pretty print ────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.cyan}=== ADMIN BACKEND AUDIT ===${C.reset}`);
  console.log(`${C.gray}${ROOT}${C.reset}`);
  console.log(`${C.gray}${output.generatedAt}${C.reset}\n`);

  console.log(`${C.bold}${C.yellow}MOUNTS${C.reset}`);
  if (!mounts.length)
    console.log(`  ${C.gray}(none found — check server.js path)${C.reset}`);
  for (const m of mounts) {
    console.log(
      `  ${C.green}${m.mountPath}${C.reset}  ${C.dim}←${C.reset} ${C.magenta}${m.router}${C.reset}  ${C.gray}(${path.relative(ROOT, m.file)})${C.reset}`,
    );
  }

  console.log(`\n${C.bold}${C.yellow}ROUTE FILES${C.reset}`);
  for (const rf of output.routeFiles) {
    console.log(`\n  ${C.bold}${C.blue}${rf.file}${C.reset}`);
    if (rf.uses.length) {
      console.log(`    ${C.gray}router.use: ${rf.uses.join(" | ")}${C.reset}`);
    }
    for (const r of rf.routes) {
      const methodColor =
        r.method === "GET"
          ? C.green
          : r.method === "POST"
            ? C.blue
            : r.method === "PATCH"
              ? C.yellow
              : r.method === "PUT"
                ? C.yellow
                : r.method === "DELETE"
                  ? C.red
                  : C.reset;
      console.log(
        `    ${methodColor}${r.method.padEnd(6)}${C.reset} ${r.path.padEnd(46)} ${C.dim}→${C.reset} ${r.handler || "?"}`,
      );
    }
  }

  console.log(`\n${C.bold}${C.yellow}CONTROLLER FILES${C.reset}`);
  for (const cf of output.controllerFiles) {
    console.log(
      `\n  ${C.bold}${C.blue}${cf.file}${C.reset}  ${C.gray}(${cf.lines} lines, ${cf.exports.length} exports)${C.reset}`,
    );
    for (const name of cf.exports) {
      console.log(`    ${C.dim}·${C.reset} ${name}`);
    }
  }

  console.log(`\n${C.bold}${C.yellow}SUMMARY${C.reset}`);
  console.log(`  mount points    : ${output.summary.mountPoints}`);
  console.log(`  route files     : ${output.summary.routeFiles}`);
  console.log(`  routes          : ${output.summary.routes}`);
  console.log(`  controller files: ${output.summary.controllerFiles}`);
  console.log(`  exports         : ${output.summary.exports}\n`);
}

main();

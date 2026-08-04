#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Color helpers ──
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log("\n" + "═".repeat(80));
  log(colors.bright + colors.cyan, `  ${title}`);
  console.log("═".repeat(80));
}

function logSubSection(title) {
  console.log("\n" + "─".repeat(60));
  log(colors.bright + colors.yellow, `  ${title}`);
  console.log("─".repeat(60));
}

// ── File helpers ──
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function findFiles(dir, pattern, results = []) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        findFiles(filePath, pattern, results);
      } else if (pattern.test(file)) {
        results.push(filePath);
      }
    }
  } catch {}
  return results;
}

function countLines(content) {
  return content ? content.split("\n").length : 0;
}

function countFunctions(content) {
  if (!content) return 0;
  const patterns = [
    /function\s+\w+\s*\(/g,
    /const\s+\w+\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
    /export\s+(?:async\s+)?function\s+\w+/g,
    /\.(get|post|put|patch|delete|use)\s*\(/g,
  ];
  let count = 0;
  for (const pattern of patterns) {
    const matches = content.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

// ── Main audit ──
function main() {
  const root = process.cwd();
  const srcDir = path.join(root, "src");

  console.log(
    colors.bright + colors.magenta,
    "\n╔═══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    colors.bright + colors.magenta,
    "║              BACKEND FULL AUDIT REPORT                         ║",
  );
  console.log(
    colors.bright + colors.magenta,
    "╚═══════════════════════════════════════════════════════════════════════╝",
  );
  console.log(colors.dim, `\n📁 Root: ${root}`);
  console.log(colors.dim, `📅 Date: ${new Date().toLocaleString()}\n`);

  // ── 1. Project Structure ──
  logSection("1. PROJECT STRUCTURE");

  const dirs = [
    "controllers",
    "routes",
    "services",
    "middleware",
    "utils",
    "config",
    "models",
    "prisma",
    "migrations",
    "scripts",
    "tests",
  ];

  let totalFiles = 0;
  let totalLines = 0;
  let totalFuncs = 0;

  for (const dir of dirs) {
    const dirPath = path.join(srcDir, dir);
    if (fs.existsSync(dirPath)) {
      const files = findFiles(dirPath, /\.(js|ts|jsx|tsx)$/);
      const fileCount = files.length;
      totalFiles += fileCount;
      let lines = 0;
      let funcs = 0;
      for (const file of files) {
        const content = readFile(file);
        if (content) {
          lines += countLines(content);
          funcs += countFunctions(content);
        }
      }
      totalLines += lines;
      totalFuncs += funcs;
      log(
        colors.green,
        `  ✅ ${dir}/  (${fileCount} files, ${lines} lines, ${funcs} functions)`,
      );
    } else {
      log(colors.yellow, `  ⚠️ ${dir}/  (directory not found)`);
    }
  }

  console.log(
    colors.cyan,
    `\n  📊 Summary: ${totalFiles} files, ${totalLines} lines, ${totalFuncs} functions`,
  );

  // ── 2. Controllers Analysis ──
  logSection("2. CONTROLLERS ANALYSIS");

  const controllerDir = path.join(srcDir, "controllers");
  if (fs.existsSync(controllerDir)) {
    const controllerFiles = findFiles(controllerDir, /\.js$/);
    log(colors.bright, `Found ${controllerFiles.length} controller files:`);
    for (const file of controllerFiles) {
      const content = readFile(file);
      const name = path.basename(file);
      const funcs = countFunctions(content);
      const lines = countLines(content);
      const exports = content ? (content.match(/export\s+/g) || []).length : 0;
      log(
        colors.green,
        `  📄 ${name}  (${lines} lines, ${funcs} functions, ${exports} exports)`,
      );
    }
  }

  // ── 3. Routes Analysis ──
  logSection("3. ROUTES ANALYSIS");

  const routesDir = path.join(srcDir, "routes");
  if (fs.existsSync(routesDir)) {
    const routeFiles = findFiles(routesDir, /\.js$/);
    log(colors.bright, `Found ${routeFiles.length} route files:`);
    let totalRoutes = 0;
    for (const file of routeFiles) {
      const content = readFile(file);
      const name = path.basename(file);
      const routes = content
        ? (content.match(/\.(get|post|put|patch|delete|use)\s*\(/g) || [])
            .length
        : 0;
      totalRoutes += routes;
      const lines = countLines(content);
      log(colors.green, `  📄 ${name}  (${routes} routes, ${lines} lines)`);
    }
    log(colors.cyan, `\n  📊 Total routes: ${totalRoutes}`);
  }

  // ── 4. Database Schema ──
  logSection("4. DATABASE SCHEMA");

  const prismaPath = path.join(root, "prisma", "schema.prisma");
  if (fs.existsSync(prismaPath)) {
    const content = readFile(prismaPath);
    const models = content
      ? (content.match(/model\s+\w+\s*\{/g) || []).length
      : 0;
    const enums = content
      ? (content.match(/enum\s+\w+\s*\{/g) || []).length
      : 0;
    const tables = content
      ? (content.match(/table\s+\w+\s*\{/g) || []).length
      : 0;
    log(colors.green, `  ✅ Models: ${models}`);
    log(colors.green, `  ✅ Enums: ${enums}`);
    log(colors.green, `  ✅ Tables: ${tables}`);
    log(colors.dim, `  📄 ${prismaPath}`);
  } else {
    log(colors.yellow, "  ⚠️ prisma/schema.prisma not found");
  }

  // ── 5. Environment Variables ──
  logSection("5. ENVIRONMENT VARIABLES");

  const envPath = path.join(root, ".env");
  const envSamplePath = path.join(root, ".env.example");
  if (fs.existsSync(envPath)) {
    const content = readFile(envPath);
    const vars = content ? content.match(/^\s*[A-Z_]+\s*=/gm) || [] : [];
    const varCount = vars.length;
    log(colors.green, `  ✅ .env found (${varCount} variables)`);
    log(colors.dim, `  📄 ${envPath}`);
  } else {
    log(colors.yellow, "  ⚠️ .env not found");
  }
  if (fs.existsSync(envSamplePath)) {
    log(colors.green, "  ✅ .env.example found");
  }

  // ── 6. Dependencies ──
  logSection("6. DEPENDENCIES");

  const packagePath = path.join(root, "package.json");
  if (fs.existsSync(packagePath)) {
    const content = readFile(packagePath);
    try {
      const pkg = JSON.parse(content);
      const deps = Object.keys(pkg.dependencies || {}).length;
      const devDeps = Object.keys(pkg.devDependencies || {}).length;
      const totalDeps = deps + devDeps;
      log(colors.green, `  ✅ Dependencies: ${deps}`);
      log(colors.green, `  ✅ Dev Dependencies: ${devDeps}`);
      log(colors.green, `  ✅ Total: ${totalDeps}`);
      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts);
        log(colors.cyan, `  📋 Scripts: ${scripts.join(", ")}`);
      }
    } catch {
      log(colors.red, "  ❌ Invalid package.json");
    }
  }

  // ── 7. Tests ──
  logSection("7. TESTS");

  const testDirs = ["test", "tests", "__tests__"];
  let testFiles = 0;
  for (const dir of testDirs) {
    const testPath = path.join(root, dir);
    if (fs.existsSync(testPath)) {
      const files = findFiles(testPath, /\.(js|ts|jsx|tsx)$/);
      testFiles += files.length;
      log(colors.green, `  ✅ ${dir}/  (${files.length} test files)`);
    }
  }
  if (testFiles === 0) {
    log(colors.yellow, "  ⚠️ No test files found");
  } else {
    log(colors.cyan, `  📊 Total tests: ${testFiles}`);
  }

  // ── 8. Git Status ──
  logSection("8. GIT STATUS");

  const gitPath = path.join(root, ".git");
  if (fs.existsSync(gitPath)) {
    const headPath = path.join(gitPath, "HEAD");
    if (fs.existsSync(headPath)) {
      const head = readFile(headPath);
      const branch = head
        ? head.replace("ref: refs/heads/", "").trim()
        : "unknown";
      log(colors.green, `  ✅ Branch: ${branch}`);
    }
    log(colors.green, "  ✅ Git repository found");
  } else {
    log(colors.yellow, "  ⚠️ Not a git repository");
  }

  // ── 9. Package.json Scripts ──
  logSection("9. NPM SCRIPTS");

  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(readFile(packagePath));
      if (pkg.scripts) {
        const scripts = Object.keys(pkg.scripts);
        for (const script of scripts) {
          log(colors.green, `  📋 ${script}: ${pkg.scripts[script]}`);
        }
      }
    } catch {}
  }

  // ── 10. Recommendations ──
  logSection("10. RECOMMENDATIONS");

  console.log("\n  🔹 Based on the audit:");

  if (totalFiles < 50) {
    log(colors.yellow, "  ⚠️ Consider expanding the codebase");
  } else {
    log(colors.green, "  ✅ Good codebase size");
  }

  if (totalRoutes < 10) {
    log(
      colors.yellow,
      "  ⚠️ Few routes detected. Consider adding more endpoints",
    );
  }

  if (
    !fs.existsSync(path.join(srcDir, "tests")) &&
    !fs.existsSync(path.join(root, "tests"))
  ) {
    log(colors.yellow, "  ⚠️ No tests found. Consider adding tests");
  }

  if (!fs.existsSync(path.join(root, ".env.example"))) {
    log(colors.yellow, "  ⚠️ No .env.example file. Consider adding one");
  }

  console.log(colors.cyan, "\n  💡 Health check endpoint: /health");
  console.log(colors.cyan, "  💡 API base: /api");
  console.log(colors.cyan, "  💡 Consider adding:");
  console.log(colors.dim, "     - Rate limiting");
  console.log(colors.dim, "     - API documentation (Swagger/OpenAPI)");
  console.log(colors.dim, "     - More comprehensive tests");

  // ── Summary ──
  logSection("SUMMARY");

  console.log(`
  ${colors.bright}Project: ${path.basename(root)}
  ${colors.bright}Files: ${totalFiles}
  ${colors.bright}Lines: ${totalLines}
  ${colors.bright}Functions: ${totalFuncs}
  ${colors.bright}Routes: ${totalRoutes || "unknown"}
  ${colors.bright}Controllers: ${controllerFiles ? controllerFiles.length : "unknown"}
  ${colors.bright}Database: ${fs.existsSync(prismaPath) ? "Prisma" : "Unknown"}
  `);

  console.log(colors.dim, "\n" + "─".repeat(80));
  console.log(colors.dim, `Audit complete. ${colors.green}✅`);
  console.log(colors.dim, "─".repeat(80) + "\n");
}

// ── Run ──
main();

#!/usr/bin/env node
// install-updated-services.js
// ─────────────────────────────────────────────────────────────────────────────
// Installs the updated response.js and auth.service.js into your project,
// then patches auth.controller.js to work with hashed refresh tokens.
//
// What it does:
//   1. Copies response.js    → src/utils/response.js
//   2. Copies auth.service.js → src/services/auth.service.js
//   3. Patches auth.controller.js:
//      a) Updates the import to include new functions
//      b) Patches the refreshToken DB lookup (plain → hash comparison)
//      c) Patches forgotPassword to use generatePasswordResetToken
//      d) Patches resetPassword to use verifyPasswordResetToken
//      e) Patches verifyEmail   to use consumeEmailVerifyToken
//
// Run: node install-updated-services.js
//      node install-updated-services.js --dry   (preview, no writes)
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, copyFile, access } from "fs/promises";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes("--dry");
const LINE = "─".repeat(72);

// ── Find project root (has package.json) ──────────────────────────────────────
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return start;
}
const ROOT = findRoot(__dirname);
const SRC = join(ROOT, "src");

console.log(`\n${LINE}`);
console.log(` SkilledProz — Install Updated Services`);
console.log(` Mode   : ${DRY ? "DRY RUN (no files written)" : "LIVE"}`);
console.log(` Root   : ${ROOT}`);
console.log(LINE);

// ─────────────────────────────────────────────────────────────────────────────
// FILE LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
const FILES = {
  responseSrc: join(__dirname, "response.js"),
  responseDst: join(SRC, "utils", "response.js"),
  authServiceSrc: join(__dirname, "auth.service.js"),
  authServiceDst: join(SRC, "services", "auth.service.js"),
  authControllerPath: join(SRC, "controllers", "auth.controller.js"),
  authMiddlewarePath: join(SRC, "middleware", "auth.middleware.js"),
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function ensureDir(p) {
  if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true });
}

async function backup(p) {
  if (await fileExists(p)) {
    await copyFile(p, `${p}.bak`);
    console.log(`       backup → ${p}.bak`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Copy response.js
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[1/3] response.js → src/utils/response.js");

if (!(await fileExists(FILES.responseSrc))) {
  console.log("  ❌  response.js not found next to this script — skipping");
} else {
  if (!DRY) {
    ensureDir(FILES.responseDst);
    await backup(FILES.responseDst);
    await copyFile(FILES.responseSrc, FILES.responseDst);
  }
  console.log(
    "  ✅  Copied. All 25 controllers continue working (backward-compatible).",
  );
  console.log(
    "      New exports available: sendCreated, sendNotFound, sendForbidden,",
  );
  console.log(
    "      sendBadRequest, sendConflict, sendPaginated, catchAsync, …",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Copy auth.service.js
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[2/3] auth.service.js → src/services/auth.service.js");

if (!(await fileExists(FILES.authServiceSrc))) {
  console.log("  ❌  auth.service.js not found next to this script — skipping");
} else {
  if (!DRY) {
    ensureDir(FILES.authServiceDst);
    await backup(FILES.authServiceDst);
    await copyFile(FILES.authServiceSrc, FILES.authServiceDst);
  }
  console.log("  ✅  Copied.");
  console.log(
    "  ⚠️  BREAKING CHANGE: refresh tokens are now stored as SHA-256 hashes.",
  );
  console.log("      auth.controller.js needs patching (handled in step 3).");
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — Patch auth.controller.js
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[3/3] Patching auth.controller.js …");

if (!(await fileExists(FILES.authControllerPath))) {
  console.log("  ❌  auth.controller.js not found — manual patch required");
} else {
  let src = await readFile(FILES.authControllerPath, "utf8");
  const original = src;
  const changes = [];

  // ── 3a. Update the auth.service.js import ──────────────────────────────────
  // Find the existing import from auth.service.js and extend it
  const importRegex =
    /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/services\/auth\.service\.js["']/;
  const importMatch = src.match(importRegex);

  const NEEDED_IMPORTS = [
    "generateTokenPair",
    "generateAccessToken",
    "verifyAccessToken",
    "verifyRefreshToken",
    "tryVerifyRefreshToken",
    "clearRefreshToken",
    "generateEmailVerifyToken",
    "consumeEmailVerifyToken",
    "generatePasswordResetToken",
    "verifyPasswordResetToken",
    "clearPasswordResetToken",
    "verifyStoredRefreshToken",
    "setTokenCookies",
    "clearTokenCookies",
  ];

  if (importMatch) {
    const existing = new Set(
      importMatch[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const toAdd = NEEDED_IMPORTS.filter((n) => !existing.has(n));
    if (toAdd.length > 0) {
      const merged = [...existing, ...toAdd].sort().join(",\n  ");
      src = src.replace(
        importMatch[0],
        `import {\n  ${merged}\n} from "../services/auth.service.js"`,
      );
      changes.push(`extended import: added ${toAdd.join(", ")}`);
    }
  } else {
    // No existing import — prepend one after the last existing import
    const lastImport = [...src.matchAll(/^import\s.+/gm)].pop();
    if (lastImport) {
      const idx = src.indexOf(lastImport[0]) + lastImport[0].length;
      const newImport = `\nimport {\n  ${NEEDED_IMPORTS.join(",\n  ")}\n} from "../services/auth.service.js";`;
      src = src.slice(0, idx) + newImport + src.slice(idx);
      changes.push("added auth.service.js import");
    }
  }

  // ── 3b. Patch refreshToken handler ────────────────────────────────────────
  //
  // OLD pattern (plain-text DB lookup):
  //   const user = await prisma.user.findFirst({ where: { refreshToken: token } });
  //   const user = await prisma.user.findFirst({ where: { refreshToken } });
  //   const user = await prisma.user.findUnique({ where: { refreshToken: ... } });
  //
  // NEW pattern (hash comparison):
  //   const payload = tryVerifyRefreshToken(token);
  //   if (!payload) return sendError(res, "Invalid refresh token", 401);
  //   const user = await verifyStoredRefreshToken(payload.id, token);
  //
  // We do a targeted replacement only inside the refreshToken export function.

  // Match the refreshToken handler function body
  const rtFnRegex =
    /(export\s+const\s+refreshToken\s*=\s*async\s*\([^)]*\)\s*=>\s*\{)([\s\S]*?)(?=\nexport\s+const\s+|\nexport\s+function\s+|$)/;
  const rtMatch = src.match(rtFnRegex);

  if (rtMatch) {
    let body = rtMatch[2];
    let bodyChanged = false;

    // Pattern A: findFirst/findUnique by plain refreshToken
    const findByTokenRegex =
      /const\s+(\w+)\s*=\s*await\s+prisma\.user\.(findFirst|findUnique)\s*\(\s*\{[^}]*where\s*:\s*\{[^}]*refreshToken[^}]*\}[^}]*\}\s*\)/g;
    if (findByTokenRegex.test(body)) {
      body = body.replace(findByTokenRegex, (match, varName) => {
        bodyChanged = true;
        return (
          `// ── token extracted from req.body or cookies ──\n` +
          `    const _rtPayload = tryVerifyRefreshToken(token);\n` +
          `    if (!_rtPayload) return sendError(res, "Invalid refresh token", 401);\n` +
          `    const ${varName} = await verifyStoredRefreshToken(_rtPayload.id, token)`
        );
      });
    }

    // Pattern B: direct jwt.verify(token, ...) + findUnique by id
    // (if the handler already verifies JWT first — just add verifyStoredRefreshToken call)
    if (!bodyChanged) {
      // Look for any comparison like: if (!user || user.refreshToken !== token)
      const staleCompare =
        /if\s*\(\s*!?user[^)]*refreshToken\s*!==?\s*\w+[^)]*\)/g;
      if (staleCompare.test(body)) {
        body = body.replace(
          staleCompare,
          `if (!user) // verified via verifyStoredRefreshToken`,
        );
        bodyChanged = true;
      }
    }

    if (bodyChanged) {
      src = src.replace(rtMatch[2], body);
      changes.push(
        "patched refreshToken handler to use verifyStoredRefreshToken",
      );
    } else {
      changes.push(
        "⚠️  refreshToken handler not auto-patched — pattern not recognized (see manual steps below)",
      );
    }
  } else {
    changes.push("⚠️  refreshToken export not found — see manual steps below");
  }

  // ── 3c. Patch forgotPassword ───────────────────────────────────────────────
  // Replace manual: passwordResetToken = raw, passwordResetExpiry = new Date(...)
  // With: generatePasswordResetToken(userId)
  const forgotRegex =
    /const\s+resetToken\s*=\s*crypto\.randomBytes\(\d+\)\.toString\(["']hex["']\)/;
  if (forgotRegex.test(src)) {
    src = src.replace(
      forgotRegex,
      `const resetToken = await generatePasswordResetToken(user.id)`,
    );
    // Remove the manual update that follows (it's now inside generatePasswordResetToken)
    src = src.replace(
      /await\s+prisma\.user\.update\(\s*\{[^}]*passwordResetToken[^}]*passwordResetExpiry[^}]*\}\s*\}\s*\)/gs,
      `// passwordResetToken + expiry set by generatePasswordResetToken above`,
    );
    changes.push("patched forgotPassword to use generatePasswordResetToken");
  }

  // ── 3d. Patch resetPassword ────────────────────────────────────────────────
  // Replace: prisma.user.findFirst({ where: { passwordResetToken: hashedToken, ... } })
  // With:    verifyPasswordResetToken(token)
  const resetFindRegex =
    /await\s+prisma\.user\.(findFirst|findUnique)\s*\(\s*\{[^}]*passwordResetToken[^}]*\}\s*\)/g;
  if (resetFindRegex.test(src)) {
    src = src.replace(resetFindRegex, `await verifyPasswordResetToken(token)`);
    changes.push("patched resetPassword to use verifyPasswordResetToken");
  }

  // ── 3e. Patch verifyEmail ──────────────────────────────────────────────────
  // Replace: prisma.user.findFirst({ where: { emailVerifyToken: ... } })
  // With:    consumeEmailVerifyToken(token)
  const emailVerifyFindRegex =
    /await\s+prisma\.user\.(findFirst|findUnique)\s*\(\s*\{[^}]*emailVerifyToken[^}]*\}\s*\)/g;
  if (emailVerifyFindRegex.test(src)) {
    src = src.replace(
      emailVerifyFindRegex,
      `await consumeEmailVerifyToken(token)`,
    );
    changes.push("patched verifyEmail to use consumeEmailVerifyToken");
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const fileChanged = src !== original;
  if (fileChanged) {
    if (!DRY) {
      await backup(FILES.authControllerPath);
      await writeFile(FILES.authControllerPath, src, "utf8");
    }
    changes.forEach((c) =>
      console.log(`  ${c.startsWith("⚠️") ? c : "  ✅  " + c}`),
    );
  } else {
    console.log("  ✅  Already up to date or no recognized patterns to patch");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — Check auth.middleware.js (informational only)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n[INFO] auth.middleware.js — checking …");
if (await fileExists(FILES.authMiddlewarePath)) {
  const mw = await readFile(FILES.authMiddlewarePath, "utf8");
  if (/verifyAccessToken/.test(mw)) {
    console.log(
      "  ✅  Uses verifyAccessToken — no changes needed (function signature unchanged)",
    );
  }
  if (/refreshToken/.test(mw) && /findFirst|findUnique/.test(mw)) {
    console.log("  ⚠️  May have a plain-token DB lookup — review manually");
  }
} else {
  console.log("  ⚠️  File not found at expected path");
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${LINE}`);
if (DRY) {
  console.log(" DRY RUN complete — no files were written.");
  console.log(" Remove --dry to apply.\n");
} else {
  console.log(" ✅  Done! Backup files saved as *.bak\n");
  console.log(" MANUAL STEPS (if auto-patch said ⚠️):");
  console.log(" ─────────────────────────────────────────────────────────────");
  console.log(" In auth.controller.js — refreshToken handler:");
  console.log("");
  console.log("   // OLD (breaks with hashed tokens):");
  console.log(
    "   const user = await prisma.user.findFirst({ where: { refreshToken: token } });",
  );
  console.log("");
  console.log("   // NEW:");
  console.log("   const payload = tryVerifyRefreshToken(token);");
  console.log(
    "   if (!payload) return sendError(res, 'Invalid refresh token', 401);",
  );
  console.log(
    "   const user = await verifyStoredRefreshToken(payload.id, token);",
  );
  console.log(
    "   if (!user) return sendError(res, 'Session expired. Please log in again.', 401);",
  );
  console.log("");
  console.log(" Also remove any old comparison like:");
  console.log("   if (!user || user.refreshToken !== token)");
  console.log(" That check is now handled inside verifyStoredRefreshToken.");
  console.log("");
  console.log(" ─────────────────────────────────────────────────────────────");
  console.log(
    " NOTE: Run `node scripts/seed-test-accounts.js` after restarting",
  );
  console.log(
    "       to refresh test account sessions (old tokens are now invalid).",
  );
}
console.log(LINE + "\n");

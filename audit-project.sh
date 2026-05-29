#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SkilledProz Backend — Full Project Audit Script
# Usage:  chmod +x audit-project.sh && ./audit-project.sh
# Output: audit-report.txt  (full report saved next to this script)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
ROOT="${1:-.}"                        # pass a path or default to cwd
OUT="$(pwd)/audit-report.txt"
LINE="─────────────────────────────────────────────────────────────────────────────"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
ORANGE="\033[38;5;214m"
RED="\033[31m"
BOLD="\033[1m"
RESET="\033[0m"

# Directories to skip entirely
SKIP_DIRS="node_modules|.git|dist|build|.cache|coverage|.nyc_output|.next|__pycache__|.venv"

# ── Helpers ───────────────────────────────────────────────────────────────────
header() { echo -e "\n${BOLD}${CYAN}$1${RESET}"; echo "$LINE"; }
sub()    { echo -e "${YELLOW}▸ $1${RESET}"; }
ok()     { echo -e "  ${GREEN}✓${RESET} $1"; }
info()   { echo -e "  ${DIM}$1${RESET}"; }
warn()   { echo -e "  ${YELLOW}⚠  $1${RESET}"; }
err()    { echo -e "  ${RED}✗  $1${RESET}"; }
sep()    { echo -e "${DIM}$LINE${RESET}"; }

# ── Banner ────────────────────────────────────────────────────────────────────
clear
echo -e "${BOLD}${ORANGE}"
cat << 'BANNER'
  ____  _    _ _ _          _ _____             
 / ___|| | _(_) | | ___  __| |  _ \ _ __ ___ ____
 \___ \| |/ / | | |/ _ \/ _` | |_) | '__/ _ \_  /
  ___) |   <| | | |  __/ (_| |  __/| | | (_) / / 
 |____/|_|\_\_|_|_|\___|\__,_|_|   |_|  \___/___|
      Backend Project Audit — $(date "+%A, %d %B %Y %H:%M:%S")
BANNER
echo -e "${RESET}"
echo -e "${DIM}Scanning: ${BOLD}$(cd "$ROOT" && pwd)${RESET}"
echo -e "${DIM}Output  : ${BOLD}$OUT${RESET}\n"

# ── Tee everything to file ────────────────────────────────────────────────────
exec > >(tee -a "$OUT") 2>&1
> "$OUT"   # clear previous report

echo "SkilledProz Backend — Full Project Audit"
echo "Generated : $(date "+%A, %d %B %Y %H:%M:%S")"
echo "Directory : $(cd "$ROOT" && pwd)"
echo "$LINE"

# ─────────────────────────────────────────────────────────────────────────────
# § 1  DIRECTORY TREE
# ─────────────────────────────────────────────────────────────────────────────
header "§ 1  FULL DIRECTORY TREE"
if command -v tree &>/dev/null; then
  tree "$ROOT" \
    --dirsfirst \
    -I "$SKIP_DIRS" \
    --charset utf-8 \
    -a \
    --filelimit 200 \
    2>/dev/null || true
else
  # Fallback: pure find-based tree
  find "$ROOT" \
    -not \( -type d \( \
      -name "node_modules" -o -name ".git" -o -name "dist" -o -name "build" \
      -o -name ".cache"    -o -name "coverage" -o -name ".next" \
    \) -prune \) \
    -print | sort | sed \
      -e 's|[^/]*/|  |g' \
      -e 's|  \([^  ]\)|└── \1|' 2>/dev/null | head -500
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 2  ALL FILES — FLAT LIST WITH SIZES
# ─────────────────────────────────────────────────────────────────────────────
header "§ 2  ALL PROJECT FILES (flat, with sizes)"

find "$ROOT" \
  -not \( -type d \( \
    -name "node_modules" -o -name ".git"  -o -name "dist"     \
    -o -name "build"     -o -name ".cache" -o -name "coverage" \
    -o -name ".next"     -o -name "__pycache__" -o -name ".venv" \
    -o -name ".nyc_output" \
  \) -prune \) \
  -type f \
  | sort \
  | while IFS= read -r f; do
      rel="${f#$ROOT/}"
      size=$(wc -c < "$f" 2>/dev/null || echo 0)
      if   [ "$size" -ge 1048576 ]; then sstr="$(( size / 1048576 )) MB"
      elif [ "$size" -ge 1024 ];    then sstr="$(( size / 1024 )) KB"
      else                               sstr="${size} B"
      fi
      printf "  %-68s %8s\n" "$rel" "$sstr"
    done

# ─────────────────────────────────────────────────────────────────────────────
# § 3  FILE COUNT BY EXTENSION
# ─────────────────────────────────────────────────────────────────────────────
header "§ 3  FILE COUNT BY EXTENSION"

find "$ROOT" \
  -not \( -type d \( \
    -name "node_modules" -o -name ".git" -o -name "dist" \
    -o -name "build" -o -name ".cache" -o -name "coverage" \
    -o -name ".next" -o -name ".venv" \
  \) -prune \) \
  -type f \
  | sed 's/.*\.//' \
  | sort \
  | uniq -c \
  | sort -rn \
  | awk '{printf "  %-6s  %s\n", $2, $1}' \
  | head -40

# ─────────────────────────────────────────────────────────────────────────────
# § 4  PROJECT SIZE SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
header "§ 4  SIZE SUMMARY"

sub "Total project (excl. node_modules, .git, dist)"
total=$(find "$ROOT" \
  -not \( -type d \( \
    -name "node_modules" -o -name ".git" -o -name "dist" \
    -o -name "build" -o -name ".cache" -o -name "coverage" \
    -o -name ".next" -o -name ".venv" \
  \) -prune \) \
  -type f \
  -exec cat {} \; 2>/dev/null | wc -c)
printf "  Total bytes  : %d\n"  "$total"
printf "  Total KB     : %d\n"  "$(( total / 1024 ))"
printf "  Total MB     : %.2f\n" "$(echo "scale=2; $total / 1048576" | bc 2>/dev/null || echo "?")"

echo ""
sub "Top 15 largest files"
find "$ROOT" \
  -not \( -type d \( \
    -name "node_modules" -o -name ".git" -o -name "dist" \
    -o -name "build" -o -name ".cache" -o -name "coverage" \
  \) -prune \) \
  -type f \
  -exec wc -c {} \; 2>/dev/null \
  | sort -rn \
  | head -15 \
  | while read -r size file; do
      rel="${file#$ROOT/}"
      if   [ "$size" -ge 1048576 ]; then sstr="$(( size / 1048576 )) MB"
      elif [ "$size" -ge 1024 ];    then sstr="$(( size / 1024 )) KB"
      else                               sstr="${size} B"
      fi
      printf "  %-68s %8s\n" "$rel" "$sstr"
    done

echo ""
sub "Lines of code (JS/TS/JSON/CSS/HTML only)"
find "$ROOT" \
  -not \( -type d \( \
    -name "node_modules" -o -name ".git" -o -name "dist" \
    -o -name "build" -o -name ".cache" -o -name "coverage" \
  \) -prune \) \
  -type f \
  \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
     -o -name "*.json" -o -name "*.css" -o -name "*.html" -o -name "*.mjs" \) \
  -exec wc -l {} \; 2>/dev/null \
  | awk '{sum += $1} END {printf "  %d total lines across JS/TS/JSON/CSS/HTML files\n", sum}'

# ─────────────────────────────────────────────────────────────────────────────
# § 5  PACKAGE.JSON — DEPENDENCIES
# ─────────────────────────────────────────────────────────────────────────────
header "§ 5  PACKAGE.JSON"

PKG="$ROOT/package.json"
if [ -f "$PKG" ]; then
  sub "Project info"
  node -e "
    const p = require('$PKG');
    console.log('  name     :', p.name    || '—');
    console.log('  version  :', p.version || '—');
    console.log('  type     :', p.type    || '—');
    console.log('  main     :', p.main    || '—');
    console.log('  engines  :', JSON.stringify(p.engines || {}));
  " 2>/dev/null || cat "$PKG" | grep -E '"name"|"version"|"type"|"main"' | head -8

  echo ""
  sub "Scripts"
  node -e "
    const p = require('$PKG');
    const s = p.scripts || {};
    Object.entries(s).forEach(([k,v]) => console.log('  ' + k.padEnd(20) + v));
  " 2>/dev/null || true

  echo ""
  sub "Production dependencies"
  node -e "
    const p = require('$PKG');
    const d = p.dependencies || {};
    Object.entries(d).forEach(([k,v]) => console.log('  ' + k.padEnd(40) + v));
    console.log('\n  Total:', Object.keys(d).length);
  " 2>/dev/null || true

  echo ""
  sub "Dev dependencies"
  node -e "
    const p = require('$PKG');
    const d = p.devDependencies || {};
    Object.entries(d).forEach(([k,v]) => console.log('  ' + k.padEnd(40) + v));
    console.log('\n  Total:', Object.keys(d).length);
  " 2>/dev/null || true
else
  warn "No package.json found at project root"
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 6  ENVIRONMENT — .env FILES (keys only, values hidden)
# ─────────────────────────────────────────────────────────────────────────────
header "§ 6  ENVIRONMENT FILES (keys only — values redacted)"

find "$ROOT" \
  -not \( -type d -name "node_modules" -prune \) \
  -type f \
  \( -name ".env" -o -name ".env.*" -o -name "*.env" \) \
  | sort \
  | while IFS= read -r envfile; do
      rel="${envfile#$ROOT/}"
      echo ""
      sub "$rel"
      grep -vE '^\s*#|^\s*$' "$envfile" 2>/dev/null \
        | sed 's/=.*/=<REDACTED>/' \
        | sort \
        | while IFS= read -r line; do echo "  $line"; done \
        || warn "Could not read $rel"
    done

# ─────────────────────────────────────────────────────────────────────────────
# § 7  SOURCE DIRECTORY — src/
# ─────────────────────────────────────────────────────────────────────────────
header "§ 7  SOURCE DIRECTORY BREAKDOWN (src/)"

SRC="$ROOT/src"
if [ -d "$SRC" ]; then
  # List every sub-directory with file count
  find "$SRC" -mindepth 1 -maxdepth 3 -type d \
    | sort \
    | while IFS= read -r d; do
        rel="${d#$ROOT/}"
        count=$(find "$d" -maxdepth 1 -type f | wc -l)
        printf "  %-55s %3d file(s)\n" "$rel" "$count"
      done

  echo ""
  sub "All source files (grouped by folder)"
  find "$SRC" -type f | sort | while IFS= read -r f; do
    rel="${f#$ROOT/}"
    lines=$(wc -l < "$f" 2>/dev/null || echo "?")
    bytes=$(wc -c < "$f" 2>/dev/null || echo 0)
    if   [ "$bytes" -ge 1024 ]; then sstr="$(( bytes / 1024 ))KB"
    else                              sstr="${bytes}B"
    fi
    printf "  %-65s %6s  %5d lines\n" "$rel" "$sstr" "$lines"
  done
else
  warn "No src/ directory found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 8  PRISMA SCHEMA
# ─────────────────────────────────────────────────────────────────────────────
header "§ 8  PRISMA SCHEMA"

PRISMA_FILE=$(find "$ROOT" -not -path "*/node_modules/*" -name "schema.prisma" | head -1)
if [ -f "$PRISMA_FILE" ]; then
  rel="${PRISMA_FILE#$ROOT/}"
  ok "Found: $rel"

  echo ""
  sub "Datasource / Generator"
  grep -A3 'datasource\|generator' "$PRISMA_FILE" | grep -v '^--$' | head -20

  echo ""
  sub "Models defined"
  grep '^\s*model ' "$PRISMA_FILE" | awk '{print "  " $2}' | sort

  echo ""
  sub "Enums defined"
  grep '^\s*enum ' "$PRISMA_FILE" | awk '{print "  " $2}' | sort

  echo ""
  lines=$(wc -l < "$PRISMA_FILE")
  info "Schema file: $lines lines"
else
  warn "No schema.prisma found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 9  ROUTE MAP
# ─────────────────────────────────────────────────────────────────────────────
header "§ 9  ROUTE MAP (all HTTP verbs)"

sub "Scanning route files for HTTP methods..."
echo ""
find "$ROOT/src" -type f \( -name "*.routes.js" -o -name "*.routes.ts" -o -name "router.js" -o -name "router.ts" \) \
  -not -path "*/node_modules/*" \
  | sort \
  | while IFS= read -r f; do
      rel="${f#$ROOT/}"
      echo "  ── $rel"
      grep -nE 'router\.(get|post|put|patch|delete|use)\(' "$f" 2>/dev/null \
        | sed "s|.*router\.\([a-z]*\)(\(['\"/][^'\"]*['\"/]\).*|    \1  \2|" \
        | head -60 \
        || true
      echo ""
    done

# Also check main app.js / index.js for app.use() mounts
sub "API prefix mounts (app.use / app.get etc.)"
for f in "$ROOT/src/app.js" "$ROOT/src/index.js" "$ROOT/app.js" "$ROOT/index.js" "$ROOT/server.js" "$ROOT/src/server.js"; do
  if [ -f "$f" ]; then
    rel="${f#$ROOT/}"
    echo "  ── $rel"
    grep -nE 'app\.(use|get|post|put|patch|delete)\(' "$f" 2>/dev/null \
      | head -40 \
      | while IFS= read -r line; do echo "    $line"; done
    echo ""
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# § 10  CONTROLLER MAP
# ─────────────────────────────────────────────────────────────────────────────
header "§ 10  CONTROLLER MAP (exported functions)"

find "$ROOT/src" -type f \( -name "*.controller.js" -o -name "*.controller.ts" \) \
  -not -path "*/node_modules/*" \
  | sort \
  | while IFS= read -r f; do
      rel="${f#$ROOT/}"
      count=$(grep -cE '^export (const|async function|function)' "$f" 2>/dev/null || echo 0)
      echo ""
      sub "$rel  ($count exports)"
      grep -nE '^export (const|async function|function)' "$f" 2>/dev/null \
        | sed 's/export const \([a-zA-Z_]*\).*/  \1/' \
        | sed 's/export async function \([a-zA-Z_]*\).*/  \1/' \
        | sed 's/export function \([a-zA-Z_]*\).*/  \1/' \
        | head -60 \
        || true
    done

# ─────────────────────────────────────────────────────────────────────────────
# § 11  MIDDLEWARE FILES
# ─────────────────────────────────────────────────────────────────────────────
header "§ 11  MIDDLEWARE"

find "$ROOT/src" -type f \( -name "*.middleware.js" -o -name "*.middleware.ts" \) \
  -not -path "*/node_modules/*" \
  | sort \
  | while IFS= read -r f; do
      rel="${f#$ROOT/}"
      echo ""
      sub "$rel"
      grep -nE '^export (const|function|async function)' "$f" 2>/dev/null \
        | head -20 \
        | while IFS= read -r line; do echo "    $line"; done
    done

# ─────────────────────────────────────────────────────────────────────────────
# § 12  SERVICES, UTILS, CONFIG
# ─────────────────────────────────────────────────────────────────────────────
header "§ 12  SERVICES / UTILS / CONFIG"

for folder in services utils config helpers; do
  DIR="$ROOT/src/$folder"
  [ -d "$DIR" ] || continue
  sub "src/$folder/"
  find "$DIR" -type f | sort | while IFS= read -r f; do
    rel="${f#$ROOT/}"
    lines=$(wc -l < "$f" 2>/dev/null || echo "?")
    printf "  %-60s  %5d lines\n" "$rel" "$lines"
  done
  echo ""
done

# ─────────────────────────────────────────────────────────────────────────────
# § 13  MIGRATION / DATABASE SCRIPTS
# ─────────────────────────────────────────────────────────────────────────────
header "§ 13  MIGRATIONS & DATABASE SCRIPTS"

for folder in migrations prisma/migrations scripts; do
  DIR="$ROOT/$folder"
  [ -d "$DIR" ] || continue
  sub "$folder/"
  find "$DIR" -type f | sort | while IFS= read -r f; do
    rel="${f#$ROOT/}"
    lines=$(wc -l < "$f" 2>/dev/null || echo "?")
    printf "  %-65s  %5d lines\n" "$rel" "$lines"
  done
  echo ""
done

# ─────────────────────────────────────────────────────────────────────────────
# § 14  CONFIG FILES (non-source)
# ─────────────────────────────────────────────────────────────────────────────
header "§ 14  CONFIG & TOOLING FILES"

for fname in \
  .eslintrc.js .eslintrc.json .eslintrc.cjs \
  .prettierrc .prettierrc.json .prettierrc.js \
  jest.config.js jest.config.cjs vitest.config.js \
  babel.config.js tsconfig.json tsconfig.base.json \
  .babelrc nodemon.json pm2.config.cjs pm2.ecosystem.config.js \
  Dockerfile docker-compose.yml docker-compose.yaml \
  .dockerignore .gitignore \
  README.md CHANGELOG.md; do
  f="$ROOT/$fname"
  [ -f "$f" ] || continue
  rel="${f#$ROOT/}"
  lines=$(wc -l < "$f" 2>/dev/null || echo "?")
  printf "  %-45s  %5d lines\n" "$rel" "$lines"
done

# ─────────────────────────────────────────────────────────────────────────────
# § 15  POTENTIAL ISSUES SCAN
# ─────────────────────────────────────────────────────────────────────────────
header "§ 15  POTENTIAL ISSUES SCAN"

sub "TODO / FIXME / HACK / PLACEHOLDER comments"
find "$ROOT/src" -type f \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \) \
  -not -path "*/node_modules/*" \
  | sort \
  | xargs grep -rn --include="*.js" --include="*.ts" \
      -E 'TODO|FIXME|HACK|PLACEHOLDER|XXX|BUG|TEMP' 2>/dev/null \
  | head -40 \
  | while IFS= read -r line; do echo "  $line"; done \
  || info "None found"

echo ""
sub "Hardcoded localhost / 127.0.0.1 URLs (should use env vars)"
find "$ROOT/src" -type f \( -name "*.js" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  | xargs grep -rn 'localhost:[0-9]\+\|127\.0\.0\.1' 2>/dev/null \
  | grep -v '\.env\|process\.env\|//\s' \
  | head -20 \
  | while IFS= read -r line; do echo "  $line"; done \
  || info "None found"

echo ""
sub "console.log statements in source (should be removed/replaced)"
find "$ROOT/src" -type f \( -name "*.js" -o -name "*.ts" \) \
  -not -path "*/node_modules/*" \
  | xargs grep -cE 'console\.log' 2>/dev/null \
  | grep -v ':0$' \
  | sort -t: -k2 -rn \
  | head -15 \
  | while IFS= read -r line; do echo "  $line"; done \
  || info "None found"

echo ""
sub "Missing .env example keys check"
DOTENV="$ROOT/.env"
EXAMPLE=$(find "$ROOT" -maxdepth 2 -name ".env.example" -o -name ".env.sample" | head -1)
if [ -f "$DOTENV" ] && [ -f "$EXAMPLE" ]; then
  while IFS= read -r key; do
    k="${key%%=*}"
    [ -z "$k" ] || grep -q "^${k}=" "$DOTENV" 2>/dev/null || warn "Key in example but missing in .env: $k"
  done < <(grep -v '^\s*#' "$EXAMPLE" | grep '=')
  ok "Compared .env against $(basename "$EXAMPLE")"
elif [ ! -f "$EXAMPLE" ]; then
  warn "No .env.example / .env.sample found — consider creating one"
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 16  GIT STATUS
# ─────────────────────────────────────────────────────────────────────────────
header "§ 16  GIT STATUS"

if [ -d "$ROOT/.git" ]; then
  sub "Current branch"
  git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null | awk '{print "  " $0}'

  echo ""
  sub "Last 10 commits"
  git -C "$ROOT" log --oneline -10 2>/dev/null | while IFS= read -r line; do echo "  $line"; done

  echo ""
  sub "Uncommitted changes"
  changed=$(git -C "$ROOT" status --porcelain 2>/dev/null | wc -l)
  if [ "$changed" -gt 0 ]; then
    git -C "$ROOT" status --short 2>/dev/null | head -30 | while IFS= read -r line; do echo "  $line"; done
    warn "  $changed file(s) with uncommitted changes"
  else
    ok "Working tree is clean"
  fi

  echo ""
  sub "Remote"
  git -C "$ROOT" remote -v 2>/dev/null | head -4 | while IFS= read -r line; do echo "  $line"; done || info "No remotes configured"
else
  warn "Not a git repository (no .git directory)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# § 17  NODE / NPM / RUNTIME INFO
# ─────────────────────────────────────────────────────────────────────────────
header "§ 17  RUNTIME & TOOLING VERSIONS"

for cmd in node npm npx prisma; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" --version 2>/dev/null || echo "?")
    printf "  %-12s %s\n" "$cmd" "$ver"
  else
    printf "  %-12s %s\n" "$cmd" "(not found)"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# § 18  FULL FILE CONTENTS (src only, ≤ 500 lines per file)
# ─────────────────────────────────────────────────────────────────────────────
header "§ 18  FULL SOURCE FILE CONTENTS (src/, truncated at 500 lines)"

find "$ROOT/src" -type f \
  \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
     -o -name "*.json" -o -name "*.prisma" -o -name "*.env.example" \) \
  -not -path "*/node_modules/*" \
  | sort \
  | while IFS= read -r f; do
      rel="${f#$ROOT/}"
      lines=$(wc -l < "$f" 2>/dev/null || echo 0)
      bytes=$(wc -c < "$f" 2>/dev/null || echo 0)
      echo ""
      echo "$LINE"
      printf "FILE : %s\n" "$rel"
      printf "SIZE : %d bytes  |  %d lines\n" "$bytes" "$lines"
      echo "$LINE"
      if [ "$lines" -le 500 ]; then
        cat "$f"
      else
        head -500 "$f"
        echo ""
        echo "  ... [TRUNCATED — file has $lines lines, showing first 500] ..."
      fi
      echo ""
    done

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "$LINE"
echo "  AUDIT COMPLETE"
printf "  Report saved to: %s\n" "$OUT"
printf "  Report size    : %s lines\n" "$(wc -l < "$OUT" 2>/dev/null || echo "?")"
printf "  Finished at    : %s\n" "$(date "+%H:%M:%S")"
echo "$LINE"
echo ""
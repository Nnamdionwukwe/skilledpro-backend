#!/usr/bin/env node
// scripts/show-vscode-files.js
// Run: node scripts/show-vscode-files.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  log('\n' + '═'.repeat(60), 'cyan');
  log(`  ${title}`, 'bright');
  log('═'.repeat(60), 'cyan');
}

function listFiles(dir, prefix = '', isLast = true, maxDepth = 3, currentDepth = 0) {
  if (currentDepth > maxDepth) return;
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    const filtered = items.filter(item => {
      const name = item.name;
      // Skip node_modules, .git, .env, etc.
      if (name === 'node_modules' || name === '.git' || name === '.env' || name === '.cache') return false;
      if (name.startsWith('.')) return false;
      return true;
    });
    
    // Sort: directories first, then files
    filtered.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });
    
    for (let i = 0; i < filtered.length; i++) {
      const item = filtered[i];
      const isLastItem = i === filtered.length - 1;
      const prefixSymbol = isLast ? '└── ' : '├── ';
      const indent = prefix + (isLast ? '    ' : '│   ');
      
      if (item.isDirectory()) {
        log(`${indent}${prefixSymbol}${colors.blue}${item.name}/${colors.reset}`, 'reset');
        listFiles(path.join(dir, item.name), indent, isLastItem, maxDepth, currentDepth + 1);
      } else {
        const ext = path.extname(item.name);
        let color = 'reset';
        if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) color = 'yellow';
        else if (['.json'].includes(ext)) color = 'green';
        else if (['.css', '.scss', '.less'].includes(ext)) color = 'magenta';
        else if (['.html', '.ejs'].includes(ext)) color = 'cyan';
        else if (['.md', '.txt'].includes(ext)) color = 'dim';
        
        const size = (fs.statSync(path.join(dir, item.name)).size / 1024).toFixed(1);
        log(`${indent}${prefixSymbol}${colors[color]}${item.name}${colors.reset} ${colors.dim}(${size}KB)${colors.reset}`, 'reset');
      }
    }
  } catch (e) {
    // Ignore permission errors
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

section('📁 SKILLEDPROZ - PROJECT FILES');

log(`\n📂 Root: ${ROOT}`, 'cyan');
log(`📅 Date: ${new Date().toLocaleString()}`, 'dim');

// ─── Project Structure ──────────────────────────────────────────────────

section('📁 Project Structure');

const mainDirs = ['src', 'scripts', 'prisma', 'backups', 'migrations'];
for (const dir of mainDirs) {
  const dirPath = path.join(ROOT, dir);
  if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
    log(`\n📁 ${dir}/`, 'blue');
    listFiles(dirPath, '', true, 2);
  }
}

// ─── File Count Summary ──────────────────────────────────────────────────

section('📊 File Count Summary');

function countFiles(dir, depth = 0) {
  let total = 0;
  let files = {};
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === '.env' || item.startsWith('.')) continue;
      const itemPath = path.join(dir, item);
      if (fs.statSync(itemPath).isDirectory()) {
        const result = countFiles(itemPath, depth + 1);
        total += result.total;
        for (const [key, val] of Object.entries(result.files)) {
          files[key] = (files[key] || 0) + val;
        }
      } else {
        const ext = path.extname(item) || '(no extension)';
        files[ext] = (files[ext] || 0) + 1;
        total++;
      }
    }
  } catch (e) {}
  return { total, files };
}

const srcStats = countFiles(path.join(ROOT, 'src'));
const scriptStats = countFiles(path.join(ROOT, 'scripts'));

log(`\n📊 Source Files (src/): ${srcStats.total} files`, 'green');
for (const [ext, count] of Object.entries(srcStats.files).sort((a, b) => b[1] - a[1])) {
  log(`  ${ext.padEnd(10)}: ${count}`, 'yellow');
}

log(`\n📊 Script Files (scripts/): ${scriptStats.total} files`, 'green');
for (const [ext, count] of Object.entries(scriptStats.files).sort((a, b) => b[1] - a[1])) {
  log(`  ${ext.padEnd(10)}: ${count}`, 'yellow');
}

// ─── Important Files ──────────────────────────────────────────────────

section('📄 Important Files');

const important = [
  'package.json',
  'server.js',
  'app.js',
  'prisma/schema.prisma',
  '.env.example',
  'README.md',
];

for (const file of important) {
  const filePath = path.join(ROOT, file);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    log(`  ✅ ${file.padEnd(30)} ${(stats.size / 1024).toFixed(1)}KB`, 'green');
  } else {
    log(`  ❌ ${file.padEnd(30)} Not found`, 'red');
  }
}

// ─── Dependencies ──────────────────────────────────────────────────

section('📦 Dependencies');

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  
  log(`\n📊 Total Dependencies: ${deps.length + devDeps.length}`, 'green');
  log(`  📦 Dependencies: ${deps.length}`, 'cyan');
  deps.slice(0, 10).forEach(d => log(`    - ${d}`, 'yellow'));
  if (deps.length > 10) log(`    ... and ${deps.length - 10} more`, 'dim');
  
  log(`\n  🔧 Dev Dependencies: ${devDeps.length}`, 'cyan');
  devDeps.slice(0, 5).forEach(d => log(`    - ${d}`, 'yellow'));
  if (devDeps.length > 5) log(`    ... and ${devDeps.length - 5} more`, 'dim');
} catch (e) {
  log('  ⚠️ Could not read package.json', 'red');
}

// ─── Scripts ──────────────────────────────────────────────────

section('📋 NPM Scripts');

try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    log(`  ${name.padEnd(15)} → ${cmd}`, 'green');
  }
} catch (e) {
  log('  ⚠️ Could not read package.json', 'red');
}

// ─── End ──────────────────────────────────────────────────

log('\n' + '═'.repeat(60), 'cyan');
log('  ✅ Done!', 'green');
log('═'.repeat(60), 'cyan');
log('');

// ─── Helpful Commands ──────────────────────────────────────────────────

log('📋 Useful Commands:', 'cyan');
log('  npm run dev          - Start development server', 'yellow');
log('  npm run db:studio    - Open Prisma Studio', 'yellow');
log('  npm run db:generate  - Generate Prisma client', 'yellow');
log('  node scripts/show-vscode-files.js - Show this file list', 'yellow');
log('  pm2 status           - Check server status', 'yellow');
log('  pm2 logs             - View server logs', 'yellow');
log('');


const fs = require('fs');
const path = require('path');

// 1. Read the Prisma Schema (Source of Truth)
const schemaPath = './prisma/schema.prisma';
const schemaContent = fs.readFileSync(schemaPath, 'utf8');
const schemaModels = new Set();
const modelRegex = /model\s+(\w+)\s+\{/g;
let match;
while ((match = modelRegex.exec(schemaContent)) !== null) {
  // Prisma models are capitalized (e.g., User), db access is camelCase (e.g., user)
  schemaModels.add(match[1]); 
}

// 2. Read the DB Scripts directory
const dbScriptsDir = './db-scripts/controllers';
const existingDbScripts = new Set();
if (fs.existsSync(dbScriptsDir)) {
  const files = fs.readdirSync(dbScriptsDir);
  files.forEach(file => {
    if (file.endsWith('.sql')) {
      // e.g., "02-user.sql" -> "User"
      const modelName = file.replace(/^\d+-/, '').replace('.sql', '');
      // Capitalize first letter to match Prisma
      existingDbScripts.add(modelName.charAt(0).toUpperCase() + modelName.slice(1));
    }
  });
}

// 3. Read Controllers to find used models
const controllersDir = './src/controllers';
const missingScripts = new Set();
const usedModels = new Set();

if (fs.existsSync(controllersDir)) {
  const files = fs.readdirSync(controllersDir);
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
      // Match prisma.modelName (e.g. prisma.user, prisma.workerProfile)
      const prismaRegex = /prisma\.(\w+)\./g;
      let pMatch;
      while ((pMatch = prismaRegex.exec(content)) !== null) {
        const accessName = pMatch[1];
        // Capitalize to match Prisma schema names
        const modelName = accessName.charAt(0).toUpperCase() + accessName.slice(1);
        
        usedModels.add(modelName);
        
        // If a controller uses this model, but we don't have a SQL script for it
        if (schemaModels.has(modelName) && !existingDbScripts.has(modelName)) {
           missingScripts.add(modelName);
        }
      }
    }
  });
}

// 4. Report Results
console.log("══════════════════════════════════════════════════");
console.log("📊 DB SCRIPT AUDIT RESULTS");
console.log("══════════════════════════════════════════════════\n");

console.log(`✅ Found ${existingDbScripts.size} existing SQL scripts in db-scripts/controllers/`);
console.log(`✅ Found ${schemaModels.size} models in prisma/schema.prisma\n`);

if (missingScripts.size > 0) {
  console.log("❌ MISSING DB SCRIPTS FOR THESE TABLES:");
  console.log("   (These tables are used in your project but have no .sql file in db-scripts/controllers/)\n");
  Array.from(missingScripts).sort().forEach(model => {
    // Convert "WorkerProfile" to "workerProfile"
    const camelCase = model.charAt(0).toLowerCase() + model.slice(1);
    console.log(`   🔴 ${model} (prisma.${camelCase})`);
  });
  console.log("\n👉 ACTION REQUIRED: Run `npx prisma migrate diff` or generate the missing SQL files.");
} else {
  console.log("🎉 GREAT NEWS! Every table used by your controllers has a matching SQL script.");
  console.log("   Your migration scripts are fully in sync.");
}
console.log("\n══════════════════════════════════════════════════");

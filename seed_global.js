import { PrismaClient } from "./src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const newCategories = [
  // Construction & Trades (expanded)
  { name: "Scaffolder", slug: "scaffolder", icon: "🏗️" },
  { name: "Glazier & Glass Installer", slug: "glazier", icon: "🪟" },
  { name: "Insulation Installer", slug: "insulation-installer", icon: "🧱" },
  { name: "Waterproofing Specialist", slug: "waterproofing", icon: "💧" },
  { name: "Floor Sanding & Polishing", slug: "floor-sanding", icon: "🪵" },
  { name: "Staircase Installer", slug: "staircase-installer", icon: "🪜" },
  { name: "Ceiling & Drywall Installer", slug: "drywall-installer", icon: "🏠" },
  { name: "Concrete & Screeding", slug: "concrete-screeding", icon: "🧱" },
  { name: "Fencing & Gates Installer", slug: "fencing-installer", icon: "🚧" },
  { name: "Swimming Pool Builder", slug: "pool-builder", icon: "🏊" },
  { name: "Demolition Specialist", slug: "demolition", icon: "⛏️" },
  { name: "Fire Safety Installer", slug: "fire-safety", icon: "🔥" },
  { name: "Lift & Elevator Technician", slug: "lift-technician", icon: "🛗" },
  { name: "Boiler & Heating Engineer", slug: "boiler-engineer", icon: "🔥" },
  { name: "Gas Engineer", slug: "gas-engineer", icon: "⛽" },

  // Healthcare & Medical (global expanded)
  { name: "Midwife", slug: "midwife", icon: "👶" },
  { name: "Pharmacist", slug: "pharmacist", icon: "💊" },
  { name: "Optician", slug: "optician", icon: "👓" },
  { name: "Dental Assistant", slug: "dental-assistant", icon: "🦷" },
  { name: "Dentist", slug: "dentist", icon: "🦷" },
  { name: "Home Care Aide", slug: "home-care-aide", icon: "🏠" },
  { name: "Occupational Therapist", slug: "occupational-therapist", icon: "🩺" },
  { name: "Speech Therapist", slug: "speech-therapist", icon: "🗣️" },
  { name: "Dietitian", slug: "dietitian", icon: "🥗" },
  { name: "Radiographer", slug: "radiographer", icon: "🩻" },
  { name: "Lab Technician", slug: "lab-technician", icon: "🔬" },
  { name: "Community Health Worker", slug: "community-health-worker", icon: "❤️" },
  { name: "Traditional Medicine Practitioner", slug: "traditional-medicine", icon: "🌿" },
  { name: "Acupuncturist", slug: "acupuncturist", icon: "📍" },
  { name: "Chiropractor", slug: "chiropractor", icon: "🦴" },
  { name: "Paramedic & First Aider", slug: "paramedic", icon: "🚑" },

  // Beauty & Personal Care (expanded)
  { name: "Eyebrow Technician", slug: "eyebrow-technician", icon: "👁️" },
  { name: "Eyelash Technician", slug: "eyelash-technician", icon: "✨" },
  { name: "Henna & Body Art Artist", slug: "henna-artist", icon: "🎨" },
  { name: "Cosmetologist", slug: "cosmetologist", icon: "💅" },
  { name: "Permanent Makeup Artist", slug: "permanent-makeup", icon: "💄" },
  { name: "Hair Braiding Specialist", slug: "hair-braiding", icon: "💇" },
  { name: "Wig Maker & Stylist", slug: "wig-maker", icon: "👱" },
  { name: "Skincare Specialist", slug: "skincare-specialist", icon: "✨" },
  { name: "Waxing Specialist", slug: "waxing-specialist", icon: "🌸" },

  // Fashion & Textiles
  { name: "Tailor & Seamstress", slug: "tailor-seamstress", icon: "🧵" },
  { name: "Fashion Designer", slug: "fashion-designer", icon: "👗" },
  { name: "Shoe Cobbler & Repair", slug: "shoe-cobbler", icon: "👟" },
  { name: "Dry Cleaner", slug: "dry-cleaner", icon: "👔" },
  { name: "Embroidery Specialist", slug: "embroidery", icon: "🪡" },
  { name: "Fabric & Textile Designer", slug: "textile-designer", icon: "🎨" },
  { name: "Leather Craftsman", slug: "leather-craftsman", icon: "👜" },

  // Agriculture & Farming (global)
  { name: "Irrigation Specialist", slug: "irrigation-specialist", icon: "💧" },
  { name: "Crop Consultant & Agronomist", slug: "agronomist", icon: "🌾" },
  { name: "Poultry Farmer", slug: "poultry-farmer", icon: "🐔" },
  { name: "Fish Farmer & Aquaculture", slug: "fish-farmer", icon: "🐟" },
  { name: "Beekeeper", slug: "beekeeper", icon: "🐝" },
  { name: "Greenhouse Farmer", slug: "greenhouse-farmer", icon: "🌱" },
  { name: "Tractor & Farm Equipment Operator", slug: "tractor-operator", icon: "🚜" },
  { name: "Soil Scientist", slug: "soil-scientist", icon: "🌍" },

  // Oil & Gas & Energy (Africa-focused, global)
  { name: "HSE Officer", slug: "hse-officer", icon: "⚠️" },
  { name: "Rig Technician", slug: "rig-technician", icon: "⛽" },
  { name: "Pipeline Inspector", slug: "pipeline-inspector", icon: "🔧" },
  { name: "Petroleum Engineer", slug: "petroleum-engineer", icon: "🛢️" },
  { name: "Energy Auditor", slug: "energy-auditor", icon: "⚡" },
  { name: "Wind Turbine Technician", slug: "wind-turbine-technician", icon: "💨" },
  { name: "Power Line Technician", slug: "power-line-technician", icon: "⚡" },

  // Manufacturing & Industrial
  { name: "Machine Operator", slug: "machine-operator", icon: "⚙️" },
  { name: "Quality Control Inspector", slug: "quality-inspector", icon: "✅" },
  { name: "Forklift Operator", slug: "forklift-operator", icon: "🏭" },
  { name: "Factory Technician", slug: "factory-technician", icon: "🏭" },
  { name: "CNC Machine Operator", slug: "cnc-operator", icon: "🔩" },
  { name: "Industrial Cleaner", slug: "industrial-cleaner", icon: "🧹" },
  { name: "Crane Operator", slug: "crane-operator", icon: "🏗️" },

  // Real Estate & Property
  { name: "Quantity Surveyor", slug: "quantity-surveyor", icon: "📐" },
  { name: "Property Valuer & Appraiser", slug: "property-valuer", icon: "🏠" },
  { name: "Estate Agent & Realtor", slug: "estate-agent", icon: "🔑" },
  { name: "Mortgage Broker", slug: "mortgage-broker", icon: "🏦" },
  { name: "Building Inspector", slug: "building-inspector", icon: "🔍" },
  { name: "Architect", slug: "architect", icon: "📐" },
  { name: "Civil Engineer", slug: "civil-engineer", icon: "🏗️" },
  { name: "Structural Engineer", slug: "structural-engineer", icon: "🏢" },

  // Sports & Recreation
  { name: "Football Coach", slug: "football-coach", icon: "⚽" },
  { name: "Basketball Coach", slug: "basketball-coach", icon: "🏀" },
  { name: "Tennis Coach", slug: "tennis-coach", icon: "🎾" },
  { name: "Yoga Instructor", slug: "yoga-instructor", icon: "🧘" },
  { name: "Gym Instructor & Fitness Coach", slug: "gym-instructor", icon: "💪" },
  { name: "Sports Referee & Umpire", slug: "referee", icon: "🏅" },
  { name: "Martial Arts Instructor", slug: "martial-arts-instructor", icon: "🥋" },
  { name: "Dance Instructor", slug: "dance-instructor", icon: "💃" },
  { name: "Athletics Coach", slug: "athletics-coach", icon: "🏃" },
  { name: "Cycling Coach", slug: "cycling-coach", icon: "🚴" },

  // Childcare & Education (expanded)
  { name: "Babysitter & Nanny", slug: "babysitter-nanny", icon: "👶" },
  { name: "Au Pair", slug: "au-pair", icon: "👩‍👧" },
  { name: "Crèche & Daycare Worker", slug: "daycare-worker", icon: "🏫" },
  { name: "Special Needs Educator", slug: "special-needs-educator", icon: "❤️" },
  { name: "Early Childhood Educator", slug: "early-childhood-educator", icon: "🎒" },
  { name: "Home School Tutor", slug: "homeschool-tutor", icon: "📚" },
  { name: "Test Prep Coach", slug: "test-prep-coach", icon: "📝" },

  // Printing & Signage
  { name: "Printer & Print Specialist", slug: "printer", icon: "🖨️" },
  { name: "Banner & Signage Maker", slug: "signage-maker", icon: "🪧" },
  { name: "Vehicle Wrap Specialist", slug: "vehicle-wrap", icon: "🚗" },
  { name: "T-Shirt & Merch Printer", slug: "merch-printer", icon: "👕" },

  // Logistics & Warehousing (expanded)
  { name: "Warehouse Manager", slug: "warehouse-manager", icon: "📦" },
  { name: "Freight & Cargo Handler", slug: "freight-handler", icon: "✈️" },
  { name: "Customs Agent & Broker", slug: "customs-broker", icon: "🛃" },
  { name: "Last Mile Delivery Agent", slug: "last-mile-delivery", icon: "🛵" },
  { name: "Cold Chain Logistics", slug: "cold-chain-logistics", icon: "❄️" },

  // Maritime & Water
  { name: "Boat & Marine Mechanic", slug: "marine-mechanic", icon: "⚓" },
  { name: "Marine Engineer", slug: "marine-engineer", icon: "🚢" },
  { name: "Fisherman & Seafarer", slug: "fisherman", icon: "🎣" },
  { name: "Diver & Underwater Technician", slug: "diver", icon: "🤿" },

  // Religious & Ceremonial
  { name: "Wedding Officiant & Celebrant", slug: "wedding-officiant", icon: "💍" },
  { name: "Event Decorator", slug: "event-decorator", icon: "🎊" },
  { name: "Florist", slug: "florist", icon: "💐" },
  { name: "Cake Designer & Baker", slug: "cake-designer", icon: "🎂" },
  { name: "Wedding Planner", slug: "wedding-planner", icon: "👰" },

  // Food & Hospitality (expanded)
  { name: "Private Chef", slug: "private-chef", icon: "👨‍🍳" },
  { name: "Bartender & Mixologist", slug: "bartender", icon: "🍹" },
  { name: "Baker & Pastry Chef", slug: "baker", icon: "🥐" },
  { name: "Food Vendor & Caterer", slug: "food-vendor", icon: "🍱" },
  { name: "Butcher", slug: "butcher", icon: "🥩" },
  { name: "Hotel & Hospitality Staff", slug: "hospitality-staff", icon: "🏨" },

  // Digital & Tech (expanded)
  { name: "SEO Specialist", slug: "seo-specialist", icon: "🔍" },
  { name: "Digital Marketing Specialist", slug: "digital-marketing", icon: "📣" },
  { name: "Email Marketing Specialist", slug: "email-marketing", icon: "📧" },
  { name: "WordPress Developer", slug: "wordpress-developer", icon: "💻" },
  { name: "E-commerce Specialist", slug: "ecommerce-specialist", icon: "🛒" },
  { name: "Blockchain Developer", slug: "blockchain-developer", icon: "⛓️" },
  { name: "AI & Machine Learning Engineer", slug: "ai-ml-engineer", icon: "🤖" },
  { name: "Cloud Engineer", slug: "cloud-engineer", icon: "☁️" },
  { name: "DevOps Engineer", slug: "devops-engineer", icon: "⚙️" },
  { name: "Database Administrator", slug: "dba", icon: "🗄️" },
  { name: "Game Developer", slug: "game-developer", icon: "🎮" },
  { name: "3D Artist & Modeller", slug: "3d-artist", icon: "🎮" },
  { name: "Drone Operator & Pilot", slug: "drone-operator", icon: "🚁" },

  // Business & Finance (expanded)
  { name: "Business Consultant", slug: "business-consultant", icon: "💼" },
  { name: "Startup Advisor", slug: "startup-advisor", icon: "🚀" },
  { name: "Auditor", slug: "auditor", icon: "📋" },
  { name: "Insurance Agent & Broker", slug: "insurance-broker", icon: "🛡️" },
  { name: "Grant Writer", slug: "grant-writer", icon: "✍️" },
  { name: "Investment Advisor", slug: "investment-advisor", icon: "📈" },
  { name: "Payroll Specialist", slug: "payroll-specialist", icon: "💰" },

  // Legal (expanded)
  { name: "Immigration Lawyer", slug: "immigration-lawyer", icon: "✈️" },
  { name: "Corporate Lawyer", slug: "corporate-lawyer", icon: "⚖️" },
  { name: "Patent & IP Attorney", slug: "patent-attorney", icon: "📜" },
  { name: "Paralegal", slug: "paralegal", icon: "📋" },
  { name: "Court Interpreter & Translator", slug: "court-interpreter", icon: "🗣️" },

  // Translation & Languages
  { name: "Translator & Interpreter", slug: "translator", icon: "🌍" },
  { name: "Transcription Specialist", slug: "transcription", icon: "⌨️" },
  { name: "Sign Language Interpreter", slug: "sign-language-interpreter", icon: "🤟" },

  // Environment & Sustainability
  { name: "Environmental Consultant", slug: "environmental-consultant", icon: "🌍" },
  { name: "Waste Management Specialist", slug: "waste-management", icon: "♻️" },
  { name: "Water Treatment Technician", slug: "water-treatment", icon: "💧" },
  { name: "Sanitation Worker", slug: "sanitation-worker", icon: "🧹" },

  // Security & Investigation
  { name: "Private Investigator", slug: "private-investigator", icon: "🔍" },
  { name: "Cybersecurity Analyst", slug: "cybersecurity-analyst", icon: "🔐" },
  { name: "Bouncer & Crowd Controller", slug: "bouncer", icon: "🛡️" },
  { name: "Fire Safety Officer", slug: "fire-safety-officer", icon: "🚒" },
];

async function seed() {
  console.log("🌍 Seeding global categories to Railway...");
  let added = 0;
  let skipped = 0;

  for (const cat of newCategories) {
    try {
      const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
      if (existing) { skipped++; continue; }
      await prisma.category.create({
        data: { name: cat.name, slug: cat.slug, icon: cat.icon, description: cat.name + " services" },
      });
      added++;
      process.stdout.write("\r✅ Added: " + added + " | Skipped: " + skipped);
    } catch (e) {
      skipped++;
    }
  }

  const total = await prisma.category.count();
  console.log("\n\n🎉 Done!");
  console.log("   New categories added: " + added);
  console.log("   Skipped (already exist): " + skipped);
  console.log("   Total categories in DB: " + total);
  await prisma.$disconnect();
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });

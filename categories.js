// This mirrors your app's database configuration from src/config/database.js
const { PrismaClient } = require("./src/generated/prisma/index.js");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");
require("dotenv").config();

const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://skilledproz_user:ChangeMe123!@localhost:5432/skilledproz?schema=public",
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  // ── AGRICULTURE & FARMING ──────────────────────────────────────────
  { name: "Poultry Farmer", slug: "poultry-farmer", icon: "🐔" },
  { name: "Fish Farmer", slug: "fish-farmer", icon: "🐟" },
  { name: "Bee Keeper", slug: "bee-keeper", icon: "🐝" },
  { name: "Mushroom Cultivator", slug: "mushroom-cultivator", icon: "🍄" },
  {
    name: "Hydroponics Specialist",
    slug: "hydroponics-specialist",
    icon: "🌿",
  },
  { name: "Aquaponics Specialist", slug: "aquaponics-specialist", icon: "🌊" },
  { name: "Soil Scientist", slug: "soil-scientist", icon: "🌱" },
  { name: "Irrigation Specialist", slug: "irrigation-specialist", icon: "💧" },
  { name: "Greenhouse Manager", slug: "greenhouse-manager", icon: "🌿" },
  { name: "Orchard Manager", slug: "orchard-manager", icon: "🍎" },
  { name: "Vineyard Manager", slug: "vineyard-manager", icon: "🍇" },
  { name: "Coffee Farmer", slug: "coffee-farmer", icon: "☕" },
  {
    name: "Tea Plantation Manager",
    slug: "tea-plantation-manager",
    icon: "🍵",
  },
  { name: "Rubber Tapper", slug: "rubber-tapper", icon: "🌳" },
  { name: "Forestry Technician", slug: "forestry-technician", icon: "🌲" },

  // ── FOOD & BEVERAGE ────────────────────────────────────────────────
  { name: "Chef de Cuisine", slug: "chef-de-cuisine", icon: "👨‍🍳" },
  { name: "Pastry Chef", slug: "pastry-chef", icon: "🎂" },
  { name: "Sous Chef", slug: "sous-chef", icon: "🍳" },
  { name: "Line Cook", slug: "line-cook", icon: "🍔" },
  { name: "Prep Cook", slug: "prep-cook", icon: "🥬" },
  { name: "Baker", slug: "baker", icon: "🍞" },
  { name: "Butcher", slug: "butcher", icon: "🥩" },
  { name: "Fishmonger", slug: "fishmonger", icon: "🐟" },
  { name: "Cheesemaker", slug: "cheesemaker", icon: "🧀" },
  { name: "Brewmaster", slug: "brewmaster", icon: "🍺" },
  { name: "Wine Maker", slug: "wine-maker", icon: "🍷" },
  { name: "Distiller", slug: "distiller", icon: "🥃" },
  { name: "Food Stylist", slug: "food-stylist", icon: "📸" },
  { name: "Recipe Developer", slug: "recipe-developer", icon: "📝" },
  { name: "Catering Manager", slug: "catering-manager", icon: "🎉" },

  // ── RETAIL & SALES ──────────────────────────────────────────────────
  { name: "Retail Store Manager", slug: "retail-store-manager", icon: "🏪" },
  { name: "Department Manager", slug: "department-manager", icon: "🛍️" },
  { name: "Sales Associate", slug: "sales-associate", icon: "👔" },
  { name: "Visual Merchandiser", slug: "visual-merchandiser", icon: "🪞" },
  { name: "Buyer", slug: "buyer", icon: "🛒" },
  { name: "Inventory Manager", slug: "inventory-manager", icon: "📦" },
  { name: "Warehouse Manager", slug: "warehouse-manager", icon: "🏗️" },
  { name: "Forklift Operator", slug: "forklift-operator", icon: "🛠️" },
  { name: "Grocery Store Manager", slug: "grocery-store-manager", icon: "🥫" },
  { name: "Pharmacy Manager", slug: "pharmacy-manager", icon: "💊" },
  { name: "Optician", slug: "optician", icon: "👓" },
  { name: "Jeweler", slug: "jeweler", icon: "💎" },
  { name: "Florist", slug: "florist", icon: "💐" },
  { name: "Bookstore Manager", slug: "bookstore-manager", icon: "📚" },
  { name: "Pet Store Manager", slug: "pet-store-manager", icon: "🐾" },

  // ── CONSTRUCTION & BUILDING ──────────────────────────────────────
  { name: "Site Foreman", slug: "site-foreman", icon: "👷" },
  { name: "Building Inspector", slug: "building-inspector", icon: "🔍" },
  { name: "Quantity Surveyor", slug: "quantity-surveyor", icon: "📐" },
  { name: "Construction Manager", slug: "construction-manager", icon: "🏗️" },
  { name: "Crane Operator", slug: "crane-operator", icon: "🏗️" },
  { name: "Excavator Operator", slug: "excavator-operator", icon: "🚜" },
  { name: "Bulldozer Operator", slug: "bulldozer-operator", icon: "🚜" },
  { name: "Concrete Finisher", slug: "concrete-finisher", icon: "🧱" },
  { name: "Rebar Worker", slug: "rebar-worker", icon: "🔩" },
  { name: "Roofing Specialist", slug: "roofing-specialist", icon: "🏠" },
  { name: "Gutter Installer", slug: "gutter-installer", icon: "💧" },
  { name: "Siding Installer", slug: "siding-installer", icon: "🧱" },
  { name: "Insulation Installer", slug: "insulation-installer", icon: "🧊" },
  { name: "Drywall Installer", slug: "drywall-installer", icon: "🪚" },
  { name: "Flooring Installer", slug: "flooring-installer", icon: "🪚" },

  // ── FINISHING & DETAILING ─────────────────────────────────────────
  {
    name: "Custom Furniture Maker",
    slug: "custom-furniture-maker",
    icon: "🪑",
  },
  { name: "Cabinetry Specialist", slug: "cabinetry-specialist", icon: "🚪" },
  { name: "Wood Finisher", slug: "wood-finisher", icon: "🪚" },
  { name: "Metal Fabricator", slug: "metal-fabricator", icon: "🔩" },
  {
    name: "Wrought Iron Specialist",
    slug: "wrought-iron-specialist",
    icon: "⚙️",
  },
  { name: "Glass Installer", slug: "glass-installer", icon: "🪟" },
  { name: "Mirror Specialist", slug: "mirror-specialist", icon: "🪞" },
  { name: "Wallpaper Hanger", slug: "wallpaper-hanger", icon: "🧱" },
  { name: "Interior Decorator", slug: "interior-decorator", icon: "🖼️" },
  { name: "Home Staging Professional", slug: "home-staging", icon: "🏠" },
  { name: "Upholsterer", slug: "upholsterer", icon: "🪑" },
  { name: "Curtain Maker", slug: "curtain-maker", icon: "🪟" },
  { name: "Blinds Installer", slug: "blinds-installer", icon: "🪟" },
  { name: "Faux Painting Specialist", slug: "faux-painting", icon: "🎨" },
  {
    name: "Decorative Finishes Expert",
    slug: "decorative-finishes",
    icon: "✨",
  },

  // ── PLUMBING & PIPING ─────────────────────────────────────────────
  { name: "Pipefitter", slug: "pipefitter", icon: "🔧" },
  { name: "Sprinkler Installer", slug: "sprinkler-installer", icon: "💧" },
  { name: "Irrigation Technician", slug: "irrigation-technician", icon: "🌿" },
  { name: "Backflow Specialist", slug: "backflow-specialist", icon: "💧" },
  {
    name: "Water Heater Specialist",
    slug: "water-heater-specialist",
    icon: "🔥",
  },
  { name: "Boiler Technician", slug: "boiler-technician", icon: "🔥" },
  { name: "Drain Cleaner", slug: "drain-cleaner", icon: "🧹" },
  { name: "Sewer Specialist", slug: "sewer-specialist", icon: "🚽" },
  { name: "Gas Fitter", slug: "gas-fitter", icon: "🔥" },
  {
    name: "Water Treatment Specialist",
    slug: "water-treatment-specialist",
    icon: "💧",
  },

  // ── ELECTRICAL & LIGHTING ─────────────────────────────────────────
  {
    name: "Commercial Electrician",
    slug: "commercial-electrician",
    icon: "⚡",
  },
  {
    name: "Industrial Electrician",
    slug: "industrial-electrician",
    icon: "⚡",
  },
  {
    name: "Residential Electrician",
    slug: "residential-electrician",
    icon: "⚡",
  },
  { name: "Solar Panel Installer", slug: "solar-panel-installer", icon: "☀️" },
  { name: "Lighting Designer", slug: "lighting-designer", icon: "💡" },
  { name: "Smart Home Technician", slug: "smart-home-technician", icon: "🏠" },
  {
    name: "Security System Installer",
    slug: "security-system-installer",
    icon: "🔒",
  },
  { name: "Fire Alarm Technician", slug: "fire-alarm-technician", icon: "🔥" },
  {
    name: "Data Cabling Specialist",
    slug: "data-cabling-specialist",
    icon: "🖥️",
  },
  { name: "Generator Technician", slug: "generator-technician", icon: "⚡" },
  {
    name: "Electric Vehicle Charger Installer",
    slug: "ev-charger-installer",
    icon: "🔌",
  },
  {
    name: "Home Automation Specialist",
    slug: "home-automation-specialist",
    icon: "🏠",
  },

  // ── HVAC & COOLING ─────────────────────────────────────────────────
  {
    name: "Refrigeration Technician",
    slug: "refrigeration-technician",
    icon: "🧊",
  },
  { name: "Air Conditioning Installer", slug: "ac-installer", icon: "❄️" },
  { name: "Heat Pump Specialist", slug: "heat-pump-specialist", icon: "🔥" },
  {
    name: "Ventilation Specialist",
    slug: "ventilation-specialist",
    icon: "💨",
  },
  { name: "Ductwork Installer", slug: "ductwork-installer", icon: "🔧" },
  { name: "Commercial HVAC Technician", slug: "commercial-hvac", icon: "🏢" },
  { name: "Residential HVAC Technician", slug: "residential-hvac", icon: "🏠" },
  { name: "Boiler Service Technician", slug: "boiler-service", icon: "🔥" },

  // ── HEALTH & WELLNESS ─────────────────────────────────────────────
  { name: "Wellness Coach", slug: "wellness-coach", icon: "🧘" },
  { name: "Holistic Health Practitioner", slug: "holistic-health", icon: "🌿" },
  { name: "Naturopath", slug: "naturopath", icon: "🌱" },
  { name: "Homeopath", slug: "homeopath", icon: "💊" },
  { name: "Chiropractor", slug: "chiropractor", icon: "🦴" },
  { name: "Acupuncturist", slug: "acupuncturist", icon: "💉" },
  { name: "Massage Therapist", slug: "massage-therapist", icon: "💆" },
  { name: "Sports Massage Therapist", slug: "sports-massage", icon: "💪" },
  {
    name: "Deep Tissue Specialist",
    slug: "deep-tissue-specialist",
    icon: "💆",
  },
  {
    name: "Reflexology Specialist",
    slug: "reflexology-specialist",
    icon: "🦶",
  },
  { name: "Aromatherapist", slug: "aromatherapist", icon: "🌿" },
  { name: "Herbalist", slug: "herbalist", icon: "🌿" },
  { name: "Nutritional Therapist", slug: "nutritional-therapist", icon: "🥗" },
  { name: "Dietitian", slug: "dietitian", icon: "🥗" },
  { name: "Personal Trainer", slug: "personal-trainer", icon: "🏋️" },
  { name: "Yoga Instructor", slug: "yoga-instructor", icon: "🧘" },

  // ── BEAUTY & GROOMING ─────────────────────────────────────────────
  { name: "Esthetician", slug: "esthetician", icon: "✨" },
  { name: "Facial Specialist", slug: "facial-specialist", icon: "✨" },
  { name: "Skin Care Specialist", slug: "skin-care-specialist", icon: "✨" },
  { name: "Makeup Artist", slug: "makeup-artist", icon: "💄" },
  { name: "Hair Stylist", slug: "hair-stylist", icon: "💇" },
  { name: "Barber", slug: "barber", icon: "💇" },
  { name: "Color Specialist", slug: "color-specialist", icon: "💇" },
  {
    name: "Hair Extension Specialist",
    slug: "hair-extension-specialist",
    icon: "💇",
  },
  { name: "Nail Technician", slug: "nail-technician", icon: "💅" },
  { name: "Waxing Specialist", slug: "waxing-specialist", icon: "✨" },
  { name: "Permanent Makeup Artist", slug: "permanent-makeup", icon: "💄" },
  {
    name: "Microblading Specialist",
    slug: "microblading-specialist",
    icon: "✍️",
  },
  { name: "Lash Technician", slug: "lash-technician", icon: "👁️" },
  { name: "Tattoo Artist", slug: "tattoo-artist", icon: "🎨" },
  { name: "Body Piercer", slug: "body-piercer", icon: "💎" },

  // ── FASHION & WEARABLES ───────────────────────────────────────────
  { name: "Fashion Designer", slug: "fashion-designer", icon: "👗" },
  { name: "Fashion Stylist", slug: "fashion-stylist", icon: "👗" },
  { name: "Seamstress", slug: "seamstress", icon: "🧵" },
  { name: "Tailor", slug: "tailor", icon: "🧵" },
  { name: "Shoe Designer", slug: "shoe-designer", icon: "👟" },
  { name: "Handbag Maker", slug: "handbag-maker", icon: "👜" },
  { name: "Hat Maker", slug: "hat-maker", icon: "🎩" },
  { name: "Jewelry Designer", slug: "jewelry-designer", icon: "💍" },
  { name: "Textile Designer", slug: "textile-designer", icon: "🧶" },
  { name: "Knitting Specialist", slug: "knitting-specialist", icon: "🧶" },
  { name: "Quilter", slug: "quilter", icon: "🧵" },

  // ── HOME & GARDEN ──────────────────────────────────────────────────
  { name: "Landscape Architect", slug: "landscape-architect", icon: "🌳" },
  { name: "Landscape Designer", slug: "landscape-designer", icon: "🌿" },
  { name: "Groundskeeper", slug: "groundskeeper", icon: "🌿" },
  { name: "Tree Surgeon", slug: "tree-surgeon", icon: "🌳" },
  {
    name: "Pest Control Specialist",
    slug: "pest-control-specialist",
    icon: "🐜",
  },
  { name: "Termite Specialist", slug: "termite-specialist", icon: "🪲" },
  {
    name: "Weed Control Specialist",
    slug: "weed-control-specialist",
    icon: "🌿",
  },
  { name: "Lawn Care Specialist", slug: "lawn-care-specialist", icon: "🌱" },
  { name: "Pool Maintenance Technician", slug: "pool-maintenance", icon: "🏊" },
  { name: "Hot Tub Specialist", slug: "hot-tub-specialist", icon: "🛁" },
  { name: "Sauna Installer", slug: "sauna-installer", icon: "🔥" },
  { name: "Outdoor Lighting Specialist", slug: "outdoor-lighting", icon: "💡" },
  { name: "Patio Builder", slug: "patio-builder", icon: "🏠" },
  { name: "Deck Builder", slug: "deck-builder", icon: "🪵" },
  { name: "Fence Installer", slug: "fence-installer", icon: "🚧" },
  { name: "Gate Installer", slug: "gate-installer", icon: "🚧" },
  { name: "Shed Builder", slug: "shed-builder", icon: "🏗️" },
  { name: "Garage Door Installer", slug: "garage-door-installer", icon: "🚪" },

  // ── AUTOMOTIVE & TRANSPORT ────────────────────────────────────────
  { name: "Auto Mechanic", slug: "auto-mechanic", icon: "🔧" },
  { name: "Heavy Diesel Mechanic", slug: "heavy-diesel-mechanic", icon: "🔧" },
  { name: "Motorcycle Mechanic", slug: "motorcycle-mechanic", icon: "🏍️" },
  { name: "ATV Mechanic", slug: "atv-mechanic", icon: "🚜" },
  { name: "Marine Mechanic", slug: "marine-mechanic", icon: "🚤" },
  { name: "Small Engine Repair", slug: "small-engine-repair", icon: "🔧" },
  { name: "Auto Body Repair", slug: "auto-body-repair", icon: "🚗" },
  { name: "Auto Painter", slug: "auto-painter", icon: "🎨" },
  { name: "Windshield Repair", slug: "windshield-repair", icon: "🚗" },
  { name: "Auto Glass Installer", slug: "auto-glass-installer", icon: "🚗" },
  { name: "Tire Technician", slug: "tire-technician", icon: "🔧" },
  { name: "Car Detailer", slug: "car-detailer", icon: "🧼" },
  { name: "Mobile Mechanic", slug: "mobile-mechanic", icon: "🔧" },
  { name: "Tow Truck Driver", slug: "tow-truck-driver", icon: "🚗" },
  { name: "Auto Electrician", slug: "auto-electrician", icon: "⚡" },
  {
    name: "Transmission Specialist",
    slug: "transmission-specialist",
    icon: "🔧",
  },
  { name: "Brake Specialist", slug: "brake-specialist", icon: "🔧" },
  { name: "Engine Rebuilder", slug: "engine-rebuilder", icon: "🔧" },

  // ── MARITIME & WATER TRANSPORT ────────────────────────────────────
  { name: "Boat Captain", slug: "boat-captain", icon: "🚤" },
  { name: "Ship Captain", slug: "ship-captain", icon: "🚢" },
  { name: "Marine Engineer", slug: "marine-engineer", icon: "⚙️" },
  { name: "Deckhand", slug: "deckhand", icon: "🚤" },
  { name: "Fisherman", slug: "fisherman", icon: "🎣" },
  { name: "Scuba Diver", slug: "scuba-diver", icon: "🤿" },
  { name: "Underwater Welder", slug: "underwater-welder", icon: "🤿" },
  { name: "Harbor Pilot", slug: "harbor-pilot", icon: "🚢" },
  { name: "Shipwright", slug: "shipwright", icon: "🛠️" },
  { name: "Boat Builder", slug: "boat-builder", icon: "🚤" },
  { name: "Sail Maker", slug: "sail-maker", icon: "⛵" },

  // ── AVIATION & FLIGHT ─────────────────────────────────────────────
  { name: "Flight Engineer", slug: "flight-engineer", icon: "✈️" },
  { name: "Helicopter Pilot", slug: "helicopter-pilot", icon: "🚁" },
  { name: "Flight Instructor", slug: "flight-instructor", icon: "✈️" },
  { name: "Aviation Mechanic", slug: "aviation-mechanic", icon: "🔧" },
  { name: "Aircraft Painter", slug: "aircraft-painter", icon: "🎨" },
  { name: "Aircraft Upholsterer", slug: "aircraft-upholsterer", icon: "🪑" },
  { name: "Airport Manager", slug: "airport-manager", icon: "🏛️" },

  // ── LOGISTICS & SUPPLY CHAIN ──────────────────────────────────────
  { name: "Supply Chain Manager", slug: "supply-chain-manager", icon: "🔗" },
  { name: "Purchasing Manager", slug: "purchasing-manager", icon: "🛒" },
  { name: "Shipping Manager", slug: "shipping-manager", icon: "🚢" },
  { name: "Receiving Manager", slug: "receiving-manager", icon: "📦" },
  {
    name: "Quality Control Specialist",
    slug: "quality-control-specialist",
    icon: "✅",
  },
  { name: "Packaging Specialist", slug: "packaging-specialist", icon: "📦" },
  { name: "Forklift Trainer", slug: "forklift-trainer", icon: "🛠️" },

  // ── BUSINESS SERVICES ─────────────────────────────────────────────
  { name: "Business Consultant", slug: "business-consultant", icon: "💼" },
  { name: "Management Consultant", slug: "management-consultant", icon: "📈" },
  { name: "Financial Consultant", slug: "financial-consultant", icon: "💰" },
  { name: "Tax Consultant", slug: "tax-consultant", icon: "🧾" },
  { name: "Insurance Agent", slug: "insurance-agent", icon: "🛡️" },
  { name: "Real Estate Agent", slug: "real-estate-agent", icon: "🏠" },
  { name: "Property Manager", slug: "property-manager", icon: "🏢" },
  { name: "Real Estate Developer", slug: "real-estate-developer", icon: "🏗️" },
  { name: "Property Appraiser", slug: "property-appraiser", icon: "📊" },
  { name: "Title Specialist", slug: "title-specialist", icon: "📋" },
  { name: "Escrow Officer", slug: "escrow-officer", icon: "🔐" },

  // ── MARKETING & ADVERTISING ──────────────────────────────────────
  {
    name: "Digital Marketing Strategist",
    slug: "digital-marketing-strategist",
    icon: "📱",
  },
  { name: "SEO Specialist", slug: "seo-specialist", icon: "🔍" },
  {
    name: "Content Marketing Strategist",
    slug: "content-marketing-strategist",
    icon: "✍️",
  },
  {
    name: "Email Marketing Specialist",
    slug: "email-marketing-specialist",
    icon: "📧",
  },
  {
    name: "Social Media Marketing Manager",
    slug: "social-media-marketing-manager",
    icon: "📱",
  },
  { name: "Pay Per Click Specialist", slug: "ppc-specialist", icon: "💲" },
  {
    name: "Affiliate Marketing Manager",
    slug: "affiliate-marketing-manager",
    icon: "🔗",
  },
  { name: "Brand Manager", slug: "brand-manager", icon: "🎯" },
  {
    name: "Event Marketing Specialist",
    slug: "event-marketing-specialist",
    icon: "🎉",
  },
  {
    name: "Trade Show Coordinator",
    slug: "trade-show-coordinator",
    icon: "🏛️",
  },

  // ── TECHNOLOGY & INNOVATION ──────────────────────────────────────
  { name: "AI/ML Engineer", slug: "aiml-engineer", icon: "🤖" },
  { name: "Blockchain Developer", slug: "blockchain-developer", icon: "⛓️" },
  {
    name: "Smart Contract Developer",
    slug: "smart-contract-developer",
    icon: "📜",
  },
  {
    name: "Cloud Solutions Architect",
    slug: "cloud-solutions-architect",
    icon: "☁️",
  },
  { name: "DevOps Engineer", slug: "devops-engineer", icon: "🔄" },
  {
    name: "Site Reliability Engineer",
    slug: "site-reliability-engineer",
    icon: "🛡️",
  },
  {
    name: "Database Administrator",
    slug: "database-administrator",
    icon: "🗄️",
  },
  { name: "System Administrator", slug: "system-administrator", icon: "🖥️" },
  { name: "Network Engineer", slug: "network-engineer", icon: "🌐" },
  {
    name: "Network Security Specialist",
    slug: "network-security-specialist",
    icon: "🔐",
  },
  { name: "Cybersecurity Analyst", slug: "cybersecurity-analyst", icon: "🛡️" },
  { name: "Penetration Tester", slug: "penetration-tester", icon: "🔒" },
  {
    name: "Information Security Manager",
    slug: "information-security-manager",
    icon: "🛡️",
  },
  { name: "Compliance Specialist", slug: "compliance-specialist", icon: "✅" },

  // ── DATA & RESEARCH ──────────────────────────────────────────────
  { name: "Data Analyst", slug: "data-analyst", icon: "📊" },
  {
    name: "Data Quality Specialist",
    slug: "data-quality-specialist",
    icon: "✅",
  },
  { name: "Market Researcher", slug: "market-researcher", icon: "🔍" },
  {
    name: "User Experience Researcher",
    slug: "user-experience-researcher",
    icon: "👤",
  },
  { name: "Product Researcher", slug: "product-researcher", icon: "🔬" },
  { name: "Survey Researcher", slug: "survey-researcher", icon: "📋" },
  {
    name: "Focus Group Facilitator",
    slug: "focus-group-facilitator",
    icon: "👥",
  },

  // ── DESIGN & CREATIVE ────────────────────────────────────────────
  { name: "Game Designer", slug: "game-designer", icon: "🎮" },
  { name: "Level Designer", slug: "level-designer", icon: "🎮" },
  { name: "Character Designer", slug: "character-designer", icon: "👤" },
  { name: "3D Modeler", slug: "3d-modeler", icon: "🎨" },
  { name: "Animator", slug: "animator", icon: "🎬" },
  { name: "Stop Motion Animator", slug: "stop-motion-animator", icon: "🎬" },
  { name: "VFX Artist", slug: "vfx-artist", icon: "🎬" },
  { name: "Sound Designer", slug: "sound-designer", icon: "🎵" },
  { name: "Voice Over Artist", slug: "voice-over-artist", icon: "🎙️" },
  { name: "Dubbing Artist", slug: "dubbing-artist", icon: "🎙️" },
  { name: "Screenwriter", slug: "screenwriter", icon: "✍️" },
  { name: "Playwright", slug: "playwright", icon: "✍️" },
  { name: "Poet", slug: "poet", icon: "✍️" },
  { name: "Author", slug: "author", icon: "📚" },
  { name: "Journalist", slug: "journalist", icon: "📰" },

  // ── PERFORMING ARTS ──────────────────────────────────────────────
  { name: "Dancer", slug: "dancer", icon: "💃" },
  { name: "Ballet Dancer", slug: "ballet-dancer", icon: "🩰" },
  { name: "Contemporary Dancer", slug: "contemporary-dancer", icon: "💃" },
  { name: "Hip Hop Dancer", slug: "hip-hop-dancer", icon: "💃" },
  { name: "Tap Dancer", slug: "tap-dancer", icon: "🎵" },
  { name: "Opera Singer", slug: "opera-singer", icon: "🎤" },
  { name: "Choral Singer", slug: "choral-singer", icon: "🎤" },
  { name: "Orchestra Conductor", slug: "orchestra-conductor", icon: "🎵" },
  { name: "Bandleader", slug: "bandleader", icon: "🎵" },
  { name: "Music Director", slug: "music-director", icon: "🎵" },

  // ── CRAFTS & ARTISANS ─────────────────────────────────────────────
  { name: "Potter", slug: "potter", icon: "🏺" },
  { name: "Glass Blower", slug: "glass-blower", icon: "🔮" },
  { name: "Blacksmith", slug: "blacksmith", icon: "🔨" },
  { name: "Tool Maker", slug: "tool-maker", icon: "🔧" },
  { name: "Diamond Cutter", slug: "diamond-cutter", icon: "💎" },
  { name: "Gold Smith", slug: "gold-smith", icon: "💎" },
  { name: "Silversmith", slug: "silversmith", icon: "💎" },
  { name: "Clock Maker", slug: "clock-maker", icon: "🕰️" },
  { name: "Watch Maker", slug: "watch-maker", icon: "⌚" },
  { name: "Musical Instrument Repair", slug: "instrument-repair", icon: "🎵" },
  { name: "Piano Tuner", slug: "piano-tuner", icon: "🎹" },
  { name: "Organ Builder", slug: "organ-builder", icon: "🎵" },
  { name: "Canvas Maker", slug: "canvas-maker", icon: "🖼️" },
  { name: "Brush Maker", slug: "brush-maker", icon: "🖌️" },

  // ── TRADES & SERVICES ─────────────────────────────────────────────
  { name: "Mover", slug: "mover", icon: "🚛" },
  { name: "Piano Mover", slug: "piano-mover", icon: "🎹" },
  { name: "Safecracker", slug: "safecracker", icon: "🔐" },
  { name: "Locksmith", slug: "locksmith", icon: "🔑" },
  { name: "Sharpening Specialist", slug: "sharpening-specialist", icon: "🔪" },
  { name: "Shoe Repair", slug: "shoe-repair", icon: "👞" },
  { name: "VCR/DVD Repair", slug: "electronics-repair", icon: "📼" },
  { name: "Computer Repair", slug: "computer-repair", icon: "💻" },
  { name: "Phone Repair", slug: "phone-repair", icon: "📱" },
  { name: "Guitar Repair", slug: "guitar-repair", icon: "🎸" },
  { name: "Bike Repair", slug: "bike-repair", icon: "🚲" },
  {
    name: "Ski/Snowboard Technician",
    slug: "ski-snowboard-technician",
    icon: "⛷️",
  },
  { name: "Golf Club Repair", slug: "golf-club-repair", icon: "🏌️" },
  { name: "Camera Repair", slug: "camera-repair", icon: "📷" },
  { name: "Wheelwright", slug: "wheelwright", icon: "⚙️" },
  { name: "Harness Maker", slug: "harness-maker", icon: "🐴" },
  { name: "Tack Maker", slug: "tack-maker", icon: "🐴" },

  // ── NATURE & ENVIRONMENT ──────────────────────────────────────────
  { name: "Park Ranger", slug: "park-ranger", icon: "🏞️" },
  { name: "Zookeeper", slug: "zookeeper", icon: "🦁" },
  { name: "Animal Behaviorist", slug: "animal-behaviorist", icon: "🐾" },
  { name: "Wildlife Photographer", slug: "wildlife-photographer", icon: "📸" },
  { name: "Marine Biologist", slug: "marine-biologist", icon: "🐠" },
  { name: "Botanist", slug: "botanist", icon: "🌿" },
  {
    name: "Conservation Scientist",
    slug: "conservation-scientist",
    icon: "🌍",
  },
  { name: "Limnologist", slug: "limnologist", icon: "💧" },
  { name: "Hydrologist", slug: "hydrologist", icon: "💧" },

  // ── SPORTS & RECREATION ──────────────────────────────────────────
  { name: "Sports Coach", slug: "sports-coach", icon: "🏅" },
  { name: "Fitness Instructor", slug: "fitness-instructor", icon: "🏋️" },
  { name: "Team Manager", slug: "team-manager", icon: "👥" },
  { name: "Referee", slug: "referee", icon: "🏅" },
  { name: "Scout (Sports)", slug: "sports-scout", icon: "🔍" },

  // ── EMERGENCY SERVICES ────────────────────────────────────────────
  {
    name: "Emergency Medical Technician",
    slug: "emergency-medical-technician",
    icon: "🚑",
  },
  { name: "Paramedic", slug: "paramedic", icon: "🚑" },
  { name: "Firefighter", slug: "firefighter", icon: "🚒" },
  { name: "Police Officer", slug: "police-officer", icon: "👮" },
  { name: "Security Guard", slug: "security-guard", icon: "🛡️" },
  { name: "Bodyguard", slug: "bodyguard", icon: "🛡️" },
  { name: "Emergency Dispatcher", slug: "emergency-dispatcher", icon: "📞" },

  // ── RELIGIOUS & SPIRITUAL ────────────────────────────────────────
  { name: "Clergy", slug: "clergy", icon: "⛪" },
  { name: "Minister", slug: "minister", icon: "⛪" },
  { name: "Priest", slug: "priest", icon: "⛪" },
  { name: "Rabbi", slug: "rabbi", icon: "✡️" },
  { name: "Imam", slug: "imam", icon: "🕌" },
  { name: "Monk", slug: "monk", icon: "🧘" },
  { name: "Nun", slug: "nun", icon: "⛪" },
  { name: "Chaplain", slug: "chaplain", icon: "⛪" },
  { name: "Pastoral Counselor", slug: "pastoral-counselor", icon: "🤝" },

  // ── SOCIAL & COMMUNITY SERVICES ──────────────────────────────────
  { name: "Career Counselor", slug: "career-counselor", icon: "💼" },
  {
    name: "Substance Abuse Counselor",
    slug: "substance-abuse-counselor",
    icon: "💊",
  },
  { name: "Crisis Counselor", slug: "crisis-counselor", icon: "🆘" },
  { name: "Immigration Counselor", slug: "immigration-counselor", icon: "✈️" },
  { name: "Housing Counselor", slug: "housing-counselor", icon: "🏠" },
  {
    name: "Community Outreach Worker",
    slug: "community-outreach-worker",
    icon: "👥",
  },
  { name: "Patient Advocate", slug: "patient-advocate", icon: "🏥" },
  { name: "Victim Advocate", slug: "victim-advocate", icon: "🛡️" },
  { name: "Children's Advocate", slug: "childrens-advocate", icon: "👶" },

  // ── EDUCATION & TRAINING ──────────────────────────────────────────
  { name: "Online Tutor", slug: "online-tutor", icon: "💻" },
  { name: "Test Prep Tutor", slug: "test-prep-tutor", icon: "📝" },
  { name: "Language Teacher", slug: "language-teacher", icon: "🗣️" },
  { name: "ESL Instructor", slug: "esl-instructor", icon: "🗣️" },
  {
    name: "Sign Language Interpreter",
    slug: "sign-language-interpreter",
    icon: "🤟",
  },
  { name: "Music Teacher", slug: "music-teacher", icon: "🎵" },
  { name: "Art Teacher", slug: "art-teacher", icon: "🎨" },
  { name: "Dance Instructor", slug: "dance-instructor", icon: "💃" },
  { name: "Driving Instructor", slug: "driving-instructor", icon: "🚗" },
  { name: "Flight Instructor", slug: "flight-instructor", icon: "✈️" },
  { name: "First Aid Instructor", slug: "first-aid-instructor", icon: "🚑" },
  { name: "Trainer (Corporate)", slug: "corporate-trainer", icon: "📊" },
  { name: "Workshop Facilitator", slug: "workshop-facilitator", icon: "👥" },
  { name: "Seminar Speaker", slug: "seminar-speaker", icon: "🎤" },
  { name: "Keynote Speaker", slug: "keynote-speaker", icon: "🎤" },

  // ── WRITING & MEDIA ──────────────────────────────────────────────
  { name: "Blogger", slug: "blogger", icon: "✍️" },
  { name: "Content Creator", slug: "content-creator", icon: "📱" },
  { name: "YouTuber", slug: "youtuber", icon: "🎥" },
  { name: "Podcaster", slug: "podcaster", icon: "🎙️" },
  { name: "Influencer", slug: "influencer", icon: "📱" },
  { name: "Public Speaker", slug: "public-speaker", icon: "🎤" },
  { name: "Motivational Speaker", slug: "motivational-speaker", icon: "🔥" },
  { name: "Comedian", slug: "comedian", icon: "😂" },
  { name: "Stand Up Comedian", slug: "stand-up-comedian", icon: "🎤" },
  { name: "Improv Artist", slug: "improv-artist", icon: "🎭" },
  { name: "Voice Actor", slug: "voice-actor", icon: "🎙️" },
  { name: "Radio Host", slug: "radio-host", icon: "📻" },
  { name: "TV Host", slug: "tv-host", icon: "📺" },
  { name: "Disc Jockey (DJ)", slug: "disc-jockey", icon: "🎧" },
  { name: "Videographer", slug: "videographer", icon: "🎥" },
  { name: "Editor (Film/Video)", slug: "film-editor", icon: "🎞️" },
  { name: "Colorist", slug: "colorist", icon: "🎨" },
  { name: "Special Effects Artist", slug: "sfx-artist", icon: "🎬" },
];

async function seed() {
  console.log(
    `\n🌍 Seeding ${categories.length} additional categories to Digital Ocean...\n`,
  );

  let added = 0;
  let skipped = 0;

  for (const cat of categories) {
    try {
      const exists = await prisma.category.findUnique({
        where: { slug: cat.slug },
      });

      if (exists) {
        skipped++;
        continue;
      }

      await prisma.category.create({
        data: {
          name: cat.name,
          slug: cat.slug,
          icon: cat.icon || "🔧",
          description: `${cat.name} services`,
        },
      });
      added++;

      if (added % 50 === 0) {
        console.log(`✅ Added: ${added} | Skipped: ${skipped}`);
      }
    } catch (error) {
      console.error(`❌ Failed to add "${cat.name}":`, error.message);
    }
  }

  const total = await prisma.category.count();
  console.log(`\n\n🎉 Complete!`);
  console.log(`   Added: ${added} | Skipped: ${skipped}`);
  console.log(`   Total in database: ${total}`);
}

seed()
  .catch((e) => {
    console.error("❌ Fatal error:", e.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    console.log("✅ Database connection closed");
  });
EOF;

// node seed-more-categories.cjs

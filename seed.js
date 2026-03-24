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

const categories = [
  { name: "Electrician", slug: "electrician", icon: "⚡" },
  { name: "Plumber", slug: "plumber", icon: "🔧" },
  { name: "Carpenter", slug: "carpenter", icon: "🪚" },
  { name: "Mason & Bricklayer", slug: "mason-bricklayer", icon: "🧱" },
  { name: "Painter & Decorator", slug: "painter-decorator", icon: "🎨" },
  { name: "Welder & Fabricator", slug: "welder-fabricator", icon: "🔥" },
  { name: "Roofer", slug: "roofer", icon: "🏠" },
  { name: "Tiler", slug: "tiler", icon: "🟦" },
  { name: "General Contractor", slug: "general-contractor", icon: "🏗️" },
  { name: "HVAC Technician", slug: "hvac-technician", icon: "❄️" },
  { name: "House Cleaner", slug: "house-cleaner", icon: "🧹" },
  { name: "Laundry & Ironing", slug: "laundry-ironing", icon: "👕" },
  { name: "Deep Cleaning", slug: "deep-cleaning", icon: "🧽" },
  { name: "Office Cleaner", slug: "office-cleaner", icon: "🏢" },
  { name: "Window Cleaner", slug: "window-cleaner", icon: "🪟" },
  { name: "Web Developer", slug: "web-developer", icon: "💻" },
  { name: "Mobile App Developer", slug: "mobile-app-developer", icon: "📱" },
  { name: "IT Support & Repair", slug: "it-support-repair", icon: "🖥️" },
  { name: "Network Engineer", slug: "network-engineer", icon: "🌐" },
  { name: "UI/UX Designer", slug: "ui-ux-designer", icon: "🎯" },
  { name: "Data Analyst", slug: "data-analyst", icon: "📊" },
  { name: "Cybersecurity Specialist", slug: "cybersecurity", icon: "🔒" },
  { name: "CCTV & Security Installer", slug: "cctv-installer", icon: "📷" },
  { name: "Nurse", slug: "nurse", icon: "🏥" },
  { name: "Caregiver", slug: "caregiver", icon: "🤲" },
  { name: "Physiotherapist", slug: "physiotherapist", icon: "💪" },
  { name: "Personal Trainer", slug: "personal-trainer", icon: "🏋️" },
  { name: "Nutritionist", slug: "nutritionist", icon: "🥗" },
  { name: "Mental Health Counselor", slug: "mental-health-counselor", icon: "🧠" },
  { name: "Massage Therapist", slug: "massage-therapist", icon: "💆" },
  { name: "Hairstylist", slug: "hairstylist", icon: "💇" },
  { name: "Barber", slug: "barber", icon: "✂️" },
  { name: "Makeup Artist", slug: "makeup-artist", icon: "💄" },
  { name: "Nail Technician", slug: "nail-technician", icon: "💅" },
  { name: "Tattoo Artist", slug: "tattoo-artist", icon: "🖊️" },
  { name: "Spa Therapist", slug: "spa-therapist", icon: "🛁" },
  { name: "Photographer", slug: "photographer", icon: "📸" },
  { name: "Videographer", slug: "videographer", icon: "🎥" },
  { name: "Graphic Designer", slug: "graphic-designer", icon: "🖼️" },
  { name: "Content Writer", slug: "content-writer", icon: "✍️" },
  { name: "Video Editor", slug: "video-editor", icon: "🎬" },
  { name: "Music Producer", slug: "music-producer", icon: "🎵" },
  { name: "Voice Over Artist", slug: "voice-over", icon: "🎙️" },
  { name: "Animator", slug: "animator", icon: "🎞️" },
  { name: "Math Tutor", slug: "math-tutor", icon: "📐" },
  { name: "English Tutor", slug: "english-tutor", icon: "📚" },
  { name: "Science Tutor", slug: "science-tutor", icon: "🔬" },
  { name: "Music Teacher", slug: "music-teacher", icon: "🎹" },
  { name: "Language Instructor", slug: "language-instructor", icon: "🗣️" },
  { name: "Driving Instructor", slug: "driving-instructor", icon: "🚗" },
  { name: "Swimming Coach", slug: "swimming-coach", icon: "🏊" },
  { name: "Lawyer", slug: "lawyer", icon: "⚖️" },
  { name: "Accountant", slug: "accountant", icon: "💰" },
  { name: "Financial Advisor", slug: "financial-advisor", icon: "📈" },
  { name: "Tax Consultant", slug: "tax-consultant", icon: "🧾" },
  { name: "Notary", slug: "notary", icon: "📋" },
  { name: "Mechanic", slug: "mechanic", icon: "🔩" },
  { name: "Auto Electrician", slug: "auto-electrician", icon: "🚘" },
  { name: "Car Detailer", slug: "car-detailer", icon: "🚙" },
  { name: "Tyre Fitter", slug: "tyre-fitter", icon: "⭕" },
  { name: "Panel Beater", slug: "panel-beater", icon: "🔨" },
  { name: "Farmer", slug: "farmer", icon: "🌾" },
  { name: "Landscaper & Gardener", slug: "landscaper-gardener", icon: "🌿" },
  { name: "Pest Control", slug: "pest-control", icon: "🐛" },
  { name: "Veterinarian", slug: "veterinarian", icon: "🐾" },
  { name: "Animal Trainer", slug: "animal-trainer", icon: "🐕" },
  { name: "Driver", slug: "driver", icon: "🚖" },
  { name: "Delivery & Courier", slug: "delivery-courier", icon: "📦" },
  { name: "Mover & Packer", slug: "mover-packer", icon: "📫" },
  { name: "Event Planner", slug: "event-planner", icon: "🎉" },
  { name: "Caterer & Chef", slug: "caterer-chef", icon: "👨‍🍳" },
  { name: "Waiter & Server", slug: "waiter-server", icon: "��️" },
  { name: "DJ", slug: "dj", icon: "🎧" },
  { name: "MC & Host", slug: "mc-host", icon: "🎤" },
  { name: "Security Guard", slug: "security-guard", icon: "🛡️" },
  { name: "Interior Designer", slug: "interior-designer", icon: "🛋️" },
  { name: "Furniture Assembler", slug: "furniture-assembler", icon: "🪑" },
  { name: "AC Repair & Installation", slug: "ac-repair", icon: "🌡️" },
  { name: "Generator Repair", slug: "generator-repair", icon: "⚙️" },
  { name: "Solar Installer", slug: "solar-installer", icon: "☀️" },
  { name: "Appliance Repair", slug: "appliance-repair", icon: "🔌" },
  { name: "Locksmith", slug: "locksmith", icon: "🔑" },
  { name: "Pool Maintenance", slug: "pool-maintenance", icon: "🏊" },
  { name: "Virtual Assistant", slug: "virtual-assistant", icon: "🖱️" },
  { name: "Data Entry Specialist", slug: "data-entry", icon: "⌨️" },
  { name: "Social Media Manager", slug: "social-media-manager", icon: "📲" },
  { name: "Customer Service Agent", slug: "customer-service", icon: "🎧" },
  { name: "HR Consultant", slug: "hr-consultant", icon: "👥" },
  { name: "Project Manager", slug: "project-manager", icon: "📌" },
];

async function seed() {
  console.log("Seeding categories to Railway...");
  let count = 0;
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: { name: cat.name, slug: cat.slug, icon: cat.icon, description: cat.name + " services" },
    });
    count++;
    process.stdout.write("\r✅ " + count + "/" + categories.length + " categories seeded");
  }
  console.log("\n🎉 Done! " + count + " categories in Railway.");
  await prisma.$disconnect();
  await pool.end();
}

seed().catch(e => { console.error(e); process.exit(1); });

import { PrismaClient } from "./src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString:
    "postgresql://postgres:fEWRzooUrCKKwRPHStLWAoJFCMtfRhyF@centerbeam.proxy.rlwy.net:17141/railway",
  ssl: false,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  // ── GOVERNMENT & PUBLIC SECTOR ───────────────────────────────────
  {
    name: "Government Relations Consultant",
    slug: "government-relations",
    icon: "🏛️",
  },
  { name: "Policy Analyst", slug: "policy-analyst", icon: "📜" },
  { name: "Legislative Assistant", slug: "legislative-assistant", icon: "⚖️" },
  { name: "Urban Planner", slug: "urban-planner", icon: "🏙️" },
  { name: "Public Health Officer", slug: "public-health-officer", icon: "🏥" },
  { name: "Customs & Excise Officer", slug: "customs-excise", icon: "🛃" },
  { name: "Census Field Agent", slug: "census-agent", icon: "📋" },
  { name: "Electoral Officer", slug: "electoral-officer", icon: "🗳️" },
  { name: "Treasury Analyst", slug: "treasury-analyst", icon: "💰" },
  {
    name: "Diplomatic Protocol Officer",
    slug: "diplomatic-protocol",
    icon: "🤝",
  },
  { name: "Intelligence Analyst", slug: "intelligence-analyst", icon: "🔍" },
  { name: "Compliance Officer", slug: "compliance-officer", icon: "✅" },
  { name: "Records & Archives Manager", slug: "records-manager", icon: "📂" },
  { name: "Procurement Officer", slug: "procurement-officer", icon: "📦" },
  { name: "Grant Administrator", slug: "grant-administrator", icon: "💼" },

  // ── CORPORATE & OFFICE ────────────────────────────────────────────
  { name: "Executive Assistant", slug: "executive-assistant", icon: "💼" },
  { name: "Office Manager", slug: "office-manager", icon: "🏢" },
  { name: "Corporate Trainer", slug: "corporate-trainer", icon: "📊" },
  {
    name: "Change Management Consultant",
    slug: "change-management",
    icon: "🔄",
  },
  { name: "Operations Manager", slug: "operations-manager", icon: "⚙️" },
  { name: "Strategy Consultant", slug: "strategy-consultant", icon: "♟️" },
  { name: "Management Consultant", slug: "management-consultant", icon: "📈" },
  { name: "Risk Analyst", slug: "risk-analyst", icon: "⚠️" },
  { name: "Supply Chain Manager", slug: "supply-chain-manager", icon: "🔗" },
  { name: "Logistics Coordinator", slug: "logistics-coordinator", icon: "📦" },
  { name: "Corporate Secretary", slug: "corporate-secretary", icon: "📋" },
  { name: "Board Advisor", slug: "board-advisor", icon: "🏛️" },
  { name: "Mergers & Acquisitions Advisor", slug: "ma-advisor", icon: "🤝" },
  {
    name: "Corporate Communications Manager",
    slug: "corp-communications",
    icon: "📣",
  },
  { name: "Internal Auditor", slug: "internal-auditor", icon: "🔍" },

  // ── BANKING & FINANCE ─────────────────────────────────────────────
  { name: "Bank Teller", slug: "bank-teller", icon: "🏦" },
  { name: "Credit Analyst", slug: "credit-analyst", icon: "💳" },
  { name: "Forex Trader", slug: "forex-trader", icon: "💱" },
  { name: "Fund Manager", slug: "fund-manager", icon: "📈" },
  { name: "Pension Administrator", slug: "pension-administrator", icon: "👴" },
  { name: "Actuarial Analyst", slug: "actuarial-analyst", icon: "📊" },
  { name: "Underwriter", slug: "underwriter", icon: "🖊️" },
  { name: "Claims Adjuster", slug: "claims-adjuster", icon: "📋" },
  { name: "KYC & AML Analyst", slug: "kyc-aml-analyst", icon: "🔐" },
  { name: "Commodity Broker", slug: "commodity-broker", icon: "⚖️" },
  { name: "Stock Broker", slug: "stock-broker", icon: "📊" },
  { name: "Microfinance Officer", slug: "microfinance-officer", icon: "💰" },
  { name: "Financial Modeller", slug: "financial-modeller", icon: "📉" },

  // ── HEALTHCARE EXPANDED ───────────────────────────────────────────
  { name: "Surgeon", slug: "surgeon", icon: "🔪" },
  { name: "Anaesthesiologist", slug: "anaesthesiologist", icon: "💉" },
  { name: "Cardiologist", slug: "cardiologist", icon: "❤️" },
  { name: "Neurologist", slug: "neurologist", icon: "🧠" },
  { name: "Oncologist", slug: "oncologist", icon: "🏥" },
  { name: "Psychiatrist", slug: "psychiatrist", icon: "🧠" },
  { name: "Paediatrician", slug: "paediatrician", icon: "👶" },
  { name: "Gynaecologist", slug: "gynaecologist", icon: "🩺" },
  { name: "Urologist", slug: "urologist", icon: "🩺" },
  { name: "Dermatologist", slug: "dermatologist", icon: "✨" },
  { name: "Endocrinologist", slug: "endocrinologist", icon: "🩺" },
  { name: "Gastroenterologist", slug: "gastroenterologist", icon: "🩺" },
  { name: "Rheumatologist", slug: "rheumatologist", icon: "🦴" },
  { name: "Pulmonologist", slug: "pulmonologist", icon: "🫁" },
  { name: "Nephrologist", slug: "nephrologist", icon: "🩺" },
  {
    name: "Medical Laboratory Scientist",
    slug: "medical-lab-scientist",
    icon: "🔬",
  },
  { name: "Clinical Psychologist", slug: "clinical-psychologist", icon: "🧠" },
  { name: "Art Therapist", slug: "art-therapist", icon: "🎨" },
  { name: "Music Therapist", slug: "music-therapist", icon: "🎵" },
  { name: "Play Therapist", slug: "play-therapist", icon: "🎮" },
  {
    name: "Rehabilitation Specialist",
    slug: "rehabilitation-specialist",
    icon: "💪",
  },
  {
    name: "Hospital Administrator",
    slug: "hospital-administrator",
    icon: "🏥",
  },
  { name: "Medical Coder & Biller", slug: "medical-coder", icon: "💻" },
  {
    name: "Sterile Processing Technician",
    slug: "sterile-processing",
    icon: "🧪",
  },
  {
    name: "Infection Control Nurse",
    slug: "infection-control-nurse",
    icon: "🦠",
  },
  { name: "Dialysis Technician", slug: "dialysis-technician", icon: "💧" },

  // ── EDUCATION EXPANDED ────────────────────────────────────────────
  { name: "University Lecturer", slug: "university-lecturer", icon: "🎓" },
  { name: "Secondary School Teacher", slug: "secondary-teacher", icon: "📚" },
  { name: "Primary School Teacher", slug: "primary-teacher", icon: "✏️" },
  { name: "Curriculum Developer", slug: "curriculum-developer", icon: "📖" },
  {
    name: "Educational Psychologist",
    slug: "educational-psychologist",
    icon: "🧠",
  },
  { name: "School Counselor", slug: "school-counselor", icon: "🤝" },
  { name: "Librarian", slug: "librarian", icon: "📚" },
  { name: "E-learning Developer", slug: "elearning-developer", icon: "💻" },
  {
    name: "Instructional Designer",
    slug: "instructional-designer",
    icon: "🎯",
  },
  { name: "STEM Educator", slug: "stem-educator", icon: "🔬" },
  {
    name: "Special Education Teacher",
    slug: "special-education-teacher",
    icon: "❤️",
  },
  {
    name: "Vocational Training Instructor",
    slug: "vocational-instructor",
    icon: "🔧",
  },
  { name: "Life Coach", slug: "life-coach", icon: "🌟" },
  { name: "Career Coach", slug: "career-coach", icon: "💼" },
  { name: "Academic Advisor", slug: "academic-advisor", icon: "🎓" },
  { name: "IELTS / TOEFL Instructor", slug: "ielts-instructor", icon: "🗣️" },
  { name: "Scholarship Advisor", slug: "scholarship-advisor", icon: "📜" },
  { name: "Literacy Coach", slug: "literacy-coach", icon: "📖" },

  // ── ENGINEERING EXPANDED ──────────────────────────────────────────
  { name: "Mechanical Engineer", slug: "mechanical-engineer", icon: "⚙️" },
  { name: "Electrical Engineer", slug: "electrical-engineer", icon: "⚡" },
  { name: "Chemical Engineer", slug: "chemical-engineer", icon: "🧪" },
  { name: "Aerospace Engineer", slug: "aerospace-engineer", icon: "✈️" },
  { name: "Biomedical Engineer", slug: "biomedical-engineer", icon: "🏥" },
  {
    name: "Environmental Engineer",
    slug: "environmental-engineer",
    icon: "🌍",
  },
  { name: "Geotechnical Engineer", slug: "geotechnical-engineer", icon: "🪨" },
  {
    name: "Marine Engineer Consultant",
    slug: "marine-engineer-consultant",
    icon: "🚢",
  },
  { name: "Nuclear Engineer", slug: "nuclear-engineer", icon: "☢️" },
  { name: "Transport Engineer", slug: "transport-engineer", icon: "🚗" },
  { name: "Traffic Engineer", slug: "traffic-engineer", icon: "🚦" },
  { name: "Hydraulic Engineer", slug: "hydraulic-engineer", icon: "💧" },
  { name: "Surveyor", slug: "surveyor", icon: "📐" },
  { name: "CAD Draughtsman", slug: "cad-draughtsman", icon: "✏️" },
  { name: "BIM Specialist", slug: "bim-specialist", icon: "🏗️" },

  // ── IT & TECH EXPANDED ────────────────────────────────────────────
  { name: "Full Stack Developer", slug: "fullstack-developer", icon: "💻" },
  { name: "Backend Developer", slug: "backend-developer", icon: "🖥️" },
  { name: "Frontend Developer", slug: "frontend-developer", icon: "🌐" },
  { name: "React Developer", slug: "react-developer", icon: "⚛️" },
  { name: "Python Developer", slug: "python-developer", icon: "🐍" },
  { name: "Java Developer", slug: "java-developer", icon: "☕" },
  { name: "PHP Developer", slug: "php-developer", icon: "🐘" },
  { name: "iOS Developer", slug: "ios-developer", icon: "🍎" },
  { name: "Android Developer", slug: "android-developer", icon: "🤖" },
  { name: "QA & Test Engineer", slug: "qa-engineer", icon: "🧪" },
  { name: "Scrum Master", slug: "scrum-master", icon: "🔄" },
  { name: "Product Manager", slug: "product-manager", icon: "🎯" },
  { name: "Solutions Architect", slug: "solutions-architect", icon: "🏗️" },
  { name: "Systems Administrator", slug: "systems-administrator", icon: "🖥️" },
  { name: "Network Administrator", slug: "network-administrator", icon: "🌐" },
  { name: "Penetration Tester", slug: "penetration-tester", icon: "🔐" },
  { name: "Data Engineer", slug: "data-engineer", icon: "🗄️" },
  { name: "Data Scientist", slug: "data-scientist", icon: "📊" },
  { name: "Business Intelligence Analyst", slug: "bi-analyst", icon: "📈" },
  { name: "Computer Vision Engineer", slug: "computer-vision", icon: "👁️" },
  { name: "NLP Engineer", slug: "nlp-engineer", icon: "🗣️" },
  { name: "Robotics Engineer", slug: "robotics-engineer", icon: "🤖" },
  { name: "IoT Developer", slug: "iot-developer", icon: "📡" },
  { name: "AR/VR Developer", slug: "ar-vr-developer", icon: "🥽" },
  { name: "Embedded Systems Engineer", slug: "embedded-systems", icon: "⚙️" },
  { name: "Technical Writer", slug: "technical-writer", icon: "📝" },
  { name: "IT Project Manager", slug: "it-project-manager", icon: "📋" },
  { name: "ERP Consultant", slug: "erp-consultant", icon: "💼" },
  { name: "SAP Consultant", slug: "sap-consultant", icon: "🖥️" },
  { name: "Salesforce Developer", slug: "salesforce-developer", icon: "☁️" },

  // ── MEDIA & COMMUNICATIONS ────────────────────────────────────────
  { name: "Journalist", slug: "journalist", icon: "📰" },
  { name: "News Anchor", slug: "news-anchor", icon: "📺" },
  { name: "Radio Presenter", slug: "radio-presenter", icon: "📻" },
  { name: "Podcast Producer", slug: "podcast-producer", icon: "🎙️" },
  { name: "Public Relations Specialist", slug: "pr-specialist", icon: "📣" },
  { name: "Brand Strategist", slug: "brand-strategist", icon: "🎯" },
  { name: "Copywriter", slug: "copywriter", icon: "✍️" },
  {
    name: "Social Media Influencer Manager",
    slug: "influencer-manager",
    icon: "📲",
  },
  { name: "Community Manager", slug: "community-manager", icon: "👥" },
  { name: "Media Buyer", slug: "media-buyer", icon: "📺" },
  { name: "Market Research Analyst", slug: "market-research", icon: "📊" },
  {
    name: "Advertising Creative Director",
    slug: "creative-director",
    icon: "🎨",
  },
  { name: "Script Writer", slug: "script-writer", icon: "📝" },
  {
    name: "Subtitling & Captioning Specialist",
    slug: "subtitling",
    icon: "💬",
  },
  { name: "Documentary Filmmaker", slug: "documentary-filmmaker", icon: "🎬" },
  { name: "Film Director", slug: "film-director", icon: "🎬" },
  { name: "Casting Director", slug: "casting-director", icon: "🎭" },
  { name: "Stage Manager", slug: "stage-manager", icon: "🎭" },

  // ── CREATIVE ARTS EXPANDED ────────────────────────────────────────
  { name: "Illustrator", slug: "illustrator", icon: "🖊️" },
  { name: "Comic Artist", slug: "comic-artist", icon: "💬" },
  { name: "Fine Artist & Painter", slug: "fine-artist", icon: "🖼️" },
  { name: "Sculptor", slug: "sculptor", icon: "🗿" },
  { name: "Ceramics Artist", slug: "ceramics-artist", icon: "🏺" },
  { name: "Printmaker", slug: "printmaker", icon: "🖨️" },
  { name: "Muralist", slug: "muralist", icon: "🎨" },
  { name: "Street Artist", slug: "street-artist", icon: "🎨" },
  { name: "NFT & Digital Artist", slug: "nft-artist", icon: "🖼️" },
  { name: "Logo Designer", slug: "logo-designer", icon: "✏️" },
  { name: "Brand Identity Designer", slug: "brand-designer", icon: "🎯" },
  { name: "Motion Graphics Designer", slug: "motion-graphics", icon: "🎞️" },
  { name: "Typographer", slug: "typographer", icon: "🔤" },
  { name: "Exhibition Designer", slug: "exhibition-designer", icon: "🖼️" },
  { name: "Theatre Director", slug: "theatre-director", icon: "🎭" },
  { name: "Choreographer", slug: "choreographer", icon: "💃" },
  { name: "Costume Designer", slug: "costume-designer", icon: "👗" },
  { name: "Set Designer", slug: "set-designer", icon: "🎭" },

  // ── MUSIC & ENTERTAINMENT ─────────────────────────────────────────
  { name: "Musician", slug: "musician", icon: "🎵" },
  { name: "Singer", slug: "singer", icon: "🎤" },
  { name: "Guitarist", slug: "guitarist", icon: "🎸" },
  { name: "Drummer", slug: "drummer", icon: "🥁" },
  { name: "Pianist", slug: "pianist", icon: "🎹" },
  { name: "Violinist", slug: "violinist", icon: "🎻" },
  { name: "Saxophonist", slug: "saxophonist", icon: "🎷" },
  { name: "Conductor", slug: "conductor", icon: "🎵" },
  { name: "Sound Engineer", slug: "sound-engineer", icon: "🎚️" },
  { name: "Lighting Technician", slug: "lighting-technician", icon: "💡" },
  { name: "Audio Visual Technician", slug: "av-technician", icon: "📹" },
  { name: "Concert Manager", slug: "concert-manager", icon: "🎤" },
  { name: "Artist Manager", slug: "artist-manager", icon: "🎵" },
  { name: "Comedian & Stand-Up", slug: "comedian", icon: "😂" },
  { name: "Magician", slug: "magician", icon: "🎩" },
  { name: "Circus Performer", slug: "circus-performer", icon: "🎪" },
  { name: "Stuntman", slug: "stuntman", icon: "🎬" },
  { name: "Actor & Actress", slug: "actor", icon: "🎭" },
  { name: "Model", slug: "model", icon: "👗" },

  // ── TRANSPORT & AVIATION ──────────────────────────────────────────
  { name: "Pilot", slug: "pilot", icon: "✈️" },
  {
    name: "Air Traffic Controller",
    slug: "air-traffic-controller",
    icon: "🗼",
  },
  {
    name: "Aircraft Maintenance Engineer",
    slug: "aircraft-engineer",
    icon: "✈️",
  },
  { name: "Flight Attendant", slug: "flight-attendant", icon: "✈️" },
  { name: "Train Driver", slug: "train-driver", icon: "🚂" },
  { name: "Bus Driver", slug: "bus-driver", icon: "🚌" },
  { name: "Taxi & Ride-share Driver", slug: "taxi-rideshare", icon: "🚕" },
  { name: "Heavy Truck Driver", slug: "truck-driver", icon: "🚛" },
  { name: "Motorcycle Courier", slug: "motorcycle-courier", icon: "🏍️" },
  { name: "Logistics Dispatcher", slug: "logistics-dispatcher", icon: "📡" },
  { name: "Fleet Manager", slug: "fleet-manager", icon: "🚗" },
  { name: "Auto Inspector & Surveyor", slug: "auto-inspector", icon: "🔍" },
  { name: "Vehicle Tracking Specialist", slug: "vehicle-tracking", icon: "📍" },

  // ── HOSPITALITY EXPANDED ──────────────────────────────────────────
  { name: "Hotel Manager", slug: "hotel-manager", icon: "🏨" },
  { name: "Front Desk Officer", slug: "front-desk", icon: "🏨" },
  { name: "Concierge", slug: "concierge", icon: "🗝️" },
  { name: "Housekeeper", slug: "housekeeper", icon: "🧹" },
  { name: "Restaurant Manager", slug: "restaurant-manager", icon: "🍽️" },
  { name: "Sommelier", slug: "sommelier", icon: "🍷" },
  { name: "Barista", slug: "barista", icon: "☕" },
  { name: "Food Safety Inspector", slug: "food-safety-inspector", icon: "✅" },
  { name: "Travel Agent", slug: "travel-agent", icon: "✈️" },
  { name: "Tour Guide", slug: "tour-guide", icon: "🗺️" },
  { name: "Event Coordinator", slug: "event-coordinator", icon: "🎉" },
  { name: "Conference Manager", slug: "conference-manager", icon: "🏛️" },
  { name: "Protocol Officer", slug: "protocol-officer", icon: "🤝" },

  // ── SOCIAL SERVICES & NGO ─────────────────────────────────────────
  { name: "Social Worker", slug: "social-worker", icon: "🤝" },
  {
    name: "Community Development Officer",
    slug: "community-development",
    icon: "🏘️",
  },
  { name: "Humanitarian Aid Worker", slug: "humanitarian-worker", icon: "❤️" },
  { name: "Refugee Support Specialist", slug: "refugee-support", icon: "🏳️" },
  { name: "Youth Worker", slug: "youth-worker", icon: "👦" },
  { name: "Disability Support Worker", slug: "disability-support", icon: "♿" },
  { name: "Child Welfare Officer", slug: "child-welfare", icon: "👶" },
  { name: "Elder Care Specialist", slug: "elder-care", icon: "👴" },
  { name: "NGO Programme Manager", slug: "ngo-programme-manager", icon: "📋" },
  {
    name: "Fundraising Specialist",
    slug: "fundraising-specialist",
    icon: "💰",
  },
  { name: "Volunteer Coordinator", slug: "volunteer-coordinator", icon: "🤝" },

  // ── SCIENCE & RESEARCH ────────────────────────────────────────────
  { name: "Research Scientist", slug: "research-scientist", icon: "🔬" },
  { name: "Biologist", slug: "biologist", icon: "🧬" },
  { name: "Chemist", slug: "chemist", icon: "🧪" },
  { name: "Physicist", slug: "physicist", icon: "⚛️" },
  { name: "Geologist", slug: "geologist", icon: "🪨" },
  { name: "Meteorologist", slug: "meteorologist", icon: "🌤️" },
  { name: "Oceanographer", slug: "oceanographer", icon: "🌊" },
  { name: "Astronomer", slug: "astronomer", icon: "🔭" },
  { name: "Microbiologist", slug: "microbiologist", icon: "🦠" },
  { name: "Geneticist", slug: "geneticist", icon: "🧬" },
  { name: "Forensic Scientist", slug: "forensic-scientist", icon: "🔍" },
  { name: "Epidemiologist", slug: "epidemiologist", icon: "📊" },
  { name: "Toxicologist", slug: "toxicologist", icon: "☠️" },

  // ── SPORTS MANAGEMENT ─────────────────────────────────────────────
  { name: "Sports Agent", slug: "sports-agent", icon: "🏅" },
  { name: "Sports Nutritionist", slug: "sports-nutritionist", icon: "🥗" },
  { name: "Sports Psychologist", slug: "sports-psychologist", icon: "🧠" },
  {
    name: "Sports Physiotherapist",
    slug: "sports-physiotherapist",
    icon: "💪",
  },
  { name: "Stadium Manager", slug: "stadium-manager", icon: "🏟️" },
  { name: "Sports Broadcaster", slug: "sports-broadcaster", icon: "📺" },
  { name: "Sports Data Analyst", slug: "sports-data-analyst", icon: "📊" },
  {
    name: "Fitness Equipment Technician",
    slug: "fitness-equipment-tech",
    icon: "🏋️",
  },

  // ── ENVIRONMENT & CLIMATE ─────────────────────────────────────────
  { name: "Climate Change Analyst", slug: "climate-analyst", icon: "🌍" },
  { name: "Carbon Credit Specialist", slug: "carbon-credit", icon: "🌱" },
  {
    name: "Sustainability Manager",
    slug: "sustainability-manager",
    icon: "♻️",
  },
  { name: "Forest Ranger", slug: "forest-ranger", icon: "🌳" },
  {
    name: "Wildlife Conservationist",
    slug: "wildlife-conservationist",
    icon: "🐘",
  },
  { name: "Renewable Energy Consultant", slug: "renewable-energy", icon: "☀️" },
  { name: "Green Building Consultant", slug: "green-building", icon: "🏡" },
  { name: "Ecologist", slug: "ecologist", icon: "🌿" },

  // ── LEGAL EXPANDED ────────────────────────────────────────────────
  { name: "Criminal Defense Lawyer", slug: "criminal-lawyer", icon: "⚖️" },
  { name: "Family Lawyer", slug: "family-lawyer", icon: "👨‍👩‍👧" },
  { name: "Human Rights Lawyer", slug: "human-rights-lawyer", icon: "✊" },
  { name: "Labour Lawyer", slug: "labour-lawyer", icon: "👷" },
  { name: "Land & Property Lawyer", slug: "property-lawyer", icon: "🏠" },
  { name: "Tax Lawyer", slug: "tax-lawyer", icon: "💰" },
  { name: "Arbitrator & Mediator", slug: "arbitrator", icon: "🤝" },
  { name: "Forensic Accountant", slug: "forensic-accountant", icon: "🔍" },
  { name: "Legal Researcher", slug: "legal-researcher", icon: "📚" },

  // ── AGRICULTURE EXPANDED ──────────────────────────────────────────
  { name: "Livestock Farmer", slug: "livestock-farmer", icon: "🐄" },
  { name: "Goat & Sheep Farmer", slug: "goat-farmer", icon: "🐐" },
  { name: "Pig Farmer", slug: "pig-farmer", icon: "🐖" },
  { name: "Crop Farmer", slug: "crop-farmer", icon: "🌾" },
  { name: "Horticulturist", slug: "horticulturist", icon: "🌸" },
  {
    name: "Agricultural Extension Officer",
    slug: "agri-extension",
    icon: "🌾",
  },
  { name: "Food Processing Technician", slug: "food-processing", icon: "🏭" },
  { name: "Organic Farming Specialist", slug: "organic-farming", icon: "🌱" },
  { name: "Agritech Specialist", slug: "agritech", icon: "📡" },
  { name: "Animal Nutritionist", slug: "animal-nutritionist", icon: "🐄" },
  { name: "Veterinary Assistant", slug: "vet-assistant", icon: "🐾" },
  { name: "Cashew / Cocoa Processing", slug: "cashew-cocoa", icon: "🌰" },
  { name: "Palm Oil Processor", slug: "palm-oil", icon: "🌴" },

  // ── HOME & DOMESTIC EXPANDED ──────────────────────────────────────
  { name: "House Manager / Majordomo", slug: "house-manager", icon: "🏠" },
  { name: "Cook & Domestic Chef", slug: "domestic-chef", icon: "🍳" },
  { name: "Personal Shopper", slug: "personal-shopper", icon: "🛍️" },
  { name: "Chauffeur", slug: "chauffeur", icon: "🚗" },
  { name: "Butler", slug: "butler", icon: "🎩" },
  { name: "Estate Caretaker", slug: "estate-caretaker", icon: "🏡" },
  { name: "Errand Runner", slug: "errand-runner", icon: "🏃" },
  { name: "Elderly Companion", slug: "elderly-companion", icon: "👴" },
  { name: "Home Organiser", slug: "home-organiser", icon: "🗂️" },
  { name: "Gardener", slug: "gardener", icon: "🌻" },
  { name: "Home Security Installer", slug: "home-security", icon: "🔒" },
  { name: "Furniture Upcycler", slug: "furniture-upcycler", icon: "🪑" },
  { name: "Antique Restorer", slug: "antique-restorer", icon: "🏺" },

  // ── MINING & RESOURCES ────────────────────────────────────────────
  { name: "Mining Engineer", slug: "mining-engineer", icon: "⛏️" },
  { name: "Geophysicist", slug: "geophysicist", icon: "🌍" },
  { name: "Blasting Technician", slug: "blasting-technician", icon: "💥" },
  { name: "Mineral Surveyor", slug: "mineral-surveyor", icon: "📐" },
  { name: "Mining Safety Officer", slug: "mining-safety", icon: "⛑️" },

  // ── DEFENCE & SECURITY EXPANDED ───────────────────────────────────
  { name: "Armed Forces Trainer", slug: "military-trainer", icon: "🎖️" },
  { name: "Close Protection Officer", slug: "close-protection", icon: "🛡️" },
  { name: "Armoured Vehicle Driver", slug: "armoured-driver", icon: "🚗" },
  {
    name: "Corporate Security Manager",
    slug: "corporate-security-manager",
    icon: "🏢",
  },
  { name: "K9 Handler", slug: "k9-handler", icon: "🐕" },
  {
    name: "Surveillance Specialist",
    slug: "surveillance-specialist",
    icon: "📷",
  },

  // ── MISCELLANEOUS GLOBAL ──────────────────────────────────────────
  { name: "Auctioneer", slug: "auctioneer", icon: "🔨" },
  { name: "Pawnbroker", slug: "pawnbroker", icon: "💍" },
  { name: "Private Tutor (General)", slug: "private-tutor", icon: "📚" },
  { name: "Genealogy Researcher", slug: "genealogy-researcher", icon: "🌳" },
  { name: "Handwriting Analyst", slug: "handwriting-analyst", icon: "✍️" },
  { name: "Feng Shui Consultant", slug: "feng-shui", icon: "🏮" },
  { name: "Astrologer", slug: "astrologer", icon: "⭐" },
  { name: "Personal Stylist", slug: "personal-stylist", icon: "👗" },
  { name: "Image Consultant", slug: "image-consultant", icon: "🪞" },
  { name: "Etiquette Coach", slug: "etiquette-coach", icon: "🤝" },
  { name: "Dating Coach", slug: "dating-coach", icon: "💕" },
  {
    name: "Relationship Counselor",
    slug: "relationship-counselor",
    icon: "💑",
  },
  { name: "Funeral Director", slug: "funeral-director", icon: "🕊️" },
  { name: "Embalmer", slug: "embalmer", icon: "🕊️" },
  { name: "Cemetery Manager", slug: "cemetery-manager", icon: "⛪" },
  { name: "Notary Public", slug: "notary-public", icon: "📋" },
  {
    name: "Company Registration Agent",
    slug: "company-registration",
    icon: "📜",
  },
  {
    name: "Immigration Consultant",
    slug: "immigration-consultant",
    icon: "✈️",
  },
  { name: "Visa Application Agent", slug: "visa-agent", icon: "🛂" },
  { name: "International Shipping Agent", slug: "shipping-agent", icon: "🚢" },
  { name: "Freight Forwarder", slug: "freight-forwarder", icon: "📦" },
  { name: "Trade Compliance Specialist", slug: "trade-compliance", icon: "📋" },
  { name: "Export/Import Consultant", slug: "export-import", icon: "🌍" },
  { name: "Wellness Coach", slug: "wellness-coach", icon: "🌟" },
  { name: "Hypnotherapist", slug: "hypnotherapist", icon: "🌀" },
  { name: "Reflexologist", slug: "reflexologist", icon: "🦶" },
  { name: "Reiki Practitioner", slug: "reiki", icon: "🙌" },
  { name: "Meditation Instructor", slug: "meditation-instructor", icon: "🧘" },
  { name: "Pilates Instructor", slug: "pilates-instructor", icon: "🤸" },
  { name: "Zumba Instructor", slug: "zumba-instructor", icon: "💃" },
  { name: "CrossFit Trainer", slug: "crossfit-trainer", icon: "🏋️" },
  { name: "Outdoor Adventure Guide", slug: "adventure-guide", icon: "⛰️" },
  { name: "Diving Instructor", slug: "diving-instructor", icon: "🤿" },
  { name: "Surfing Instructor", slug: "surfing-instructor", icon: "🏄" },
  { name: "Ski Instructor", slug: "ski-instructor", icon: "⛷️" },
  { name: "Equestrian Instructor", slug: "equestrian", icon: "🐴" },
  { name: "Rock Climbing Instructor", slug: "rock-climbing", icon: "🧗" },
  { name: "Dog Walker & Pet Sitter", slug: "dog-walker", icon: "🐕" },
  { name: "Pet Groomer", slug: "pet-groomer", icon: "✂️" },
  { name: "Aquarium Specialist", slug: "aquarium-specialist", icon: "🐠" },
  { name: "Reptile Handler", slug: "reptile-handler", icon: "🦎" },
  { name: "Wedding Photographer", slug: "wedding-photographer", icon: "💍" },
  {
    name: "Real Estate Photographer",
    slug: "real-estate-photographer",
    icon: "🏠",
  },
  { name: "Product Photographer", slug: "product-photographer", icon: "📦" },
  { name: "Food Photographer", slug: "food-photographer", icon: "🍽️" },
  { name: "Portrait Photographer", slug: "portrait-photographer", icon: "📸" },
  { name: "Photo Editor & Retoucher", slug: "photo-editor", icon: "🖼️" },
  { name: "Drone Photographer", slug: "drone-photographer", icon: "🚁" },
  { name: "360° Virtual Tour Creator", slug: "virtual-tour", icon: "🌐" },
  { name: "Live Streaming Technician", slug: "live-streaming", icon: "📡" },
  { name: "Subtitler & Translator", slug: "subtitler", icon: "💬" },
  {
    name: "Interpreter (Conference)",
    slug: "conference-interpreter",
    icon: "🎙️",
  },
  { name: "Proof Reader", slug: "proof-reader", icon: "✍️" },
  { name: "Ghostwriter", slug: "ghostwriter", icon: "✍️" },
  { name: "Book Author", slug: "book-author", icon: "📚" },
  { name: "Editor (Publishing)", slug: "publishing-editor", icon: "📖" },
  { name: "Indexer", slug: "indexer", icon: "📋" },
  { name: "Fact Checker", slug: "fact-checker", icon: "✅" },
  { name: "Research Assistant", slug: "research-assistant", icon: "🔬" },
  { name: "Statistician", slug: "statistician", icon: "📊" },
  { name: "Economist", slug: "economist", icon: "📈" },
  { name: "Demographer", slug: "demographer", icon: "👥" },
  { name: "Anthropologist", slug: "anthropologist", icon: "🌍" },
  { name: "Archaeologist", slug: "archaeologist", icon: "🏺" },
  { name: "Psychometrician", slug: "psychometrician", icon: "📊" },
  { name: "Neuropsychologist", slug: "neuropsychologist", icon: "🧠" },
  { name: "Organizational Psychologist", slug: "org-psychologist", icon: "🏢" },
  {
    name: "Recruitment Consultant",
    slug: "recruitment-consultant",
    icon: "👥",
  },
  { name: "Head Hunter", slug: "head-hunter", icon: "🎯" },
  { name: "Outplacement Counselor", slug: "outplacement", icon: "💼" },
  { name: "Benefits Administrator", slug: "benefits-admin", icon: "📋" },
  {
    name: "Occupational Safety Officer",
    slug: "occupational-safety",
    icon: "⛑️",
  },
  { name: "Labour Relations Specialist", slug: "labour-relations", icon: "🤝" },
];

async function seed() {
  console.log(`\n🌍 Seeding ${categories.length} global categories...\n`);
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
      process.stdout.write(`\r✅ Added: ${added} | Skipped: ${skipped}`);
    } catch {
      skipped++;
    }
  }

  const total = await prisma.category.count();
  console.log(`\n\n🎉 Complete!`);
  console.log(`   Added: ${added} | Skipped: ${skipped}`);
  console.log(`   Total in database: ${total}`);
  await prisma.$disconnect();
  await pool.end();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});

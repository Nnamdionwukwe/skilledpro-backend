const { PrismaClient } = require("../../src/generated/prisma/index.js");
const { PrismaPg } = require("@prisma/adapter-pg");
const pg = require("pg");
require("dotenv").config({ path: "../../.env" });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const categories = [
  // ── GOVERNMENT & PUBLIC ADMINISTRATION ────────────────────────────
  { name: "Cabinet Secretary", slug: "cabinet-secretary", icon: "🏛️" },
  { name: "Permanent Secretary", slug: "permanent-secretary", icon: "📋" },
  { name: "Director General", slug: "director-general", icon: "👔" },
  { name: "Government Minister", slug: "government-minister", icon: "👤" },
  { name: "Parliamentarian", slug: "parliamentarian", icon: "🏛️" },
  { name: "Senator", slug: "senator", icon: "🏛️" },
  { name: "Member of Parliament", slug: "member-of-parliament", icon: "🗳️" },
  { name: "Ambassador", slug: "ambassador", icon: "🌍" },
  { name: "Consul", slug: "consul", icon: "🌍" },
  { name: "Diplomat", slug: "diplomat", icon: "🤝" },
  {
    name: "Foreign Service Officer",
    slug: "foreign-service-officer",
    icon: "🌐",
  },
  { name: "Trade Commissioner", slug: "trade-commissioner", icon: "💼" },
  { name: "High Commissioner", slug: "high-commissioner", icon: "🏛️" },
  { name: "Chief of Protocol", slug: "chief-of-protocol", icon: "🎖️" },
  {
    name: "Government Spokesperson",
    slug: "government-spokesperson",
    icon: "📣",
  },
  {
    name: "Public Affairs Officer",
    slug: "public-affairs-officer",
    icon: "📢",
  },
  {
    name: "Government Relations Director",
    slug: "government-relations-director",
    icon: "🤝",
  },
  {
    name: "Intergovernmental Affairs Coordinator",
    slug: "intergovernmental-affairs",
    icon: "🔄",
  },
  { name: "Municipal Clerk", slug: "municipal-clerk", icon: "📋" },
  { name: "City Manager", slug: "city-manager", icon: "🏙️" },
  { name: "County Administrator", slug: "county-administrator", icon: "🏛️" },
  { name: "Town Planner", slug: "town-planner", icon: "🏗️" },
  { name: "Zoning Administrator", slug: "zoning-administrator", icon: "📐" },
  { name: "Building Inspector", slug: "building-inspector", icon: "🔍" },
  {
    name: "Code Enforcement Officer",
    slug: "code-enforcement-officer",
    icon: "✅",
  },
  { name: "Permit Specialist", slug: "permit-specialist", icon: "📄" },
  { name: "Licensing Officer", slug: "licensing-officer", icon: "📜" },
  { name: "Land Use Planner", slug: "land-use-planner", icon: "🗺️" },
  { name: "Environmental Planner", slug: "environmental-planner", icon: "🌍" },
  {
    name: "Economic Development Officer",
    slug: "economic-development-officer",
    icon: "💰",
  },
  {
    name: "Community Development Director",
    slug: "community-development-director",
    icon: "🏘️",
  },
  {
    name: "Housing Authority Director",
    slug: "housing-authority-director",
    icon: "🏠",
  },
  { name: "Public Works Director", slug: "public-works-director", icon: "🛠️" },
  {
    name: "Transportation Planner",
    slug: "transportation-planner",
    icon: "🚗",
  },
  {
    name: "Transit Authority Manager",
    slug: "transit-authority-manager",
    icon: "🚌",
  },
  {
    name: "Port Authority Director",
    slug: "port-authority-director",
    icon: "🚢",
  },
  {
    name: "Airport Authority Director",
    slug: "airport-authority-director",
    icon: "✈️",
  },
  {
    name: "Water Authority Director",
    slug: "water-authority-director",
    icon: "💧",
  },
  {
    name: "Electric Utility Manager",
    slug: "electric-utility-manager",
    icon: "⚡",
  },
  { name: "Sanitation Director", slug: "sanitation-director", icon: "🗑️" },
  {
    name: "Recycling Program Coordinator",
    slug: "recycling-coordinator",
    icon: "♻️",
  },
  { name: "Parks and Recreation Director", slug: "parks-director", icon: "🌳" },
  { name: "Museum Director", slug: "museum-director", icon: "🏛️" },
  { name: "Librarian", slug: "librarian", icon: "📚" },
  { name: "Archivist", slug: "archivist", icon: "📂" },
  { name: "Records Manager", slug: "records-manager", icon: "📋" },
  { name: "Freedom of Information Officer", slug: "foi-officer", icon: "📄" },
  { name: "Privacy Officer", slug: "privacy-officer", icon: "🔐" },
  { name: "Ombudsman", slug: "ombudsman", icon: "⚖️" },
  { name: "Election Commissioner", slug: "election-commissioner", icon: "🗳️" },
  {
    name: "Voter Registration Officer",
    slug: "voter-registration-officer",
    icon: "📋",
  },
  { name: "Census Officer", slug: "census-officer", icon: "📊" },
  { name: "Statistical Analyst", slug: "statistical-analyst", icon: "📊" },
  { name: "Economic Analyst", slug: "economic-analyst", icon: "📈" },
  { name: "Policy Advisor", slug: "policy-advisor", icon: "📜" },
  { name: "Legislative Counsel", slug: "legislative-counsel", icon: "⚖️" },
  { name: "Parliamentary Drafter", slug: "parliamentary-drafter", icon: "✍️" },
  { name: "Committee Clerk", slug: "committee-clerk", icon: "📋" },
  { name: "Hansard Reporter", slug: "hansard-reporter", icon: "✍️" },

  // ── LEGAL & JUDICIAL ──────────────────────────────────────────────
  { name: "Chief Justice", slug: "chief-justice", icon: "⚖️" },
  { name: "Judge", slug: "judge", icon: "⚖️" },
  { name: "Magistrate", slug: "magistrate", icon: "⚖️" },
  { name: "Prosecutor", slug: "prosecutor", icon: "⚖️" },
  { name: "Public Defender", slug: "public-defender", icon: "🛡️" },
  { name: "Attorney General", slug: "attorney-general", icon: "⚖️" },
  { name: "Solicitor General", slug: "solicitor-general", icon: "⚖️" },
  { name: "State Attorney", slug: "state-attorney", icon: "⚖️" },
  { name: "District Attorney", slug: "district-attorney", icon: "⚖️" },
  { name: "Crown Counsel", slug: "crown-counsel", icon: "⚖️" },
  { name: "Legal Advisor", slug: "legal-advisor", icon: "⚖️" },
  { name: "Corporate Counsel", slug: "corporate-counsel", icon: "💼" },
  { name: "General Counsel", slug: "general-counsel", icon: "🏢" },
  { name: "Chief Legal Officer", slug: "chief-legal-officer", icon: "⚖️" },
  { name: "Legal Specialist", slug: "legal-specialist", icon: "📋" },
  { name: "Court Administrator", slug: "court-administrator", icon: "🏛️" },
  { name: "Court Reporter", slug: "court-reporter", icon: "✍️" },
  { name: "Judicial Assistant", slug: "judicial-assistant", icon: "📋" },
  { name: "Law Clerk", slug: "law-clerk", icon: "📚" },
  { name: "Legal Secretary", slug: "legal-secretary", icon: "📋" },
  { name: "Paralegal", slug: "paralegal", icon: "📚" },
  { name: "Mediator", slug: "mediator", icon: "🤝" },
  { name: "Arbitrator", slug: "arbitrator", icon: "⚖️" },
  { name: "Notary Public", slug: "notary-public", icon: "📜" },
  { name: "Deputy Sheriff", slug: "deputy-sheriff", icon: "⭐" },
  { name: "Court Bailiff", slug: "court-bailiff", icon: "⚖️" },

  // ── LAW ENFORCEMENT ──────────────────────────────────────────────
  { name: "Police Chief", slug: "police-chief", icon: "👮" },
  { name: "Police Commissioner", slug: "police-commissioner", icon: "👮" },
  { name: "Detective", slug: "detective", icon: "🔍" },
  {
    name: "Crime Scene Investigator",
    slug: "crime-scene-investigator",
    icon: "🔬",
  },
  { name: "Forensic Analyst", slug: "forensic-analyst", icon: "🔍" },
  { name: "Fingerprint Examiner", slug: "fingerprint-examiner", icon: "🖐️" },
  {
    name: "Criminal Intelligence Analyst",
    slug: "criminal-intelligence-analyst",
    icon: "🧠",
  },
  {
    name: "Internal Affairs Investigator",
    slug: "internal-affairs",
    icon: "🔍",
  },
  { name: "Special Agent", slug: "special-agent", icon: "🕵️" },
  { name: "Secret Service Agent", slug: "secret-service-agent", icon: "🛡️" },
  { name: "Customs Officer", slug: "customs-officer", icon: "🛃" },
  { name: "Border Patrol Agent", slug: "border-patrol-agent", icon: "🚧" },
  { name: "Immigration Officer", slug: "immigration-officer", icon: "🛂" },
  { name: "Correctional Officer", slug: "correctional-officer", icon: "🔒" },
  { name: "Probation Officer", slug: "probation-officer", icon: "📋" },
  { name: "Parole Officer", slug: "parole-officer", icon: "📋" },
  {
    name: "Juvenile Probation Officer",
    slug: "juvenile-probation-officer",
    icon: "👦",
  },
  { name: "Security Manager", slug: "security-manager", icon: "🛡️" },
  { name: "Safety Officer", slug: "safety-officer", icon: "⛑️" },

  // ── FINANCE & ACCOUNTING ──────────────────────────────────────────
  { name: "Chief Financial Officer", slug: "cfo", icon: "💰" },
  { name: "Finance Director", slug: "finance-director", icon: "📊" },
  { name: "Accounting Manager", slug: "accounting-manager", icon: "📒" },
  { name: "Senior Accountant", slug: "senior-accountant", icon: "📊" },
  { name: "Certified Public Accountant", slug: "cpa", icon: "📊" },
  { name: "Chartered Accountant", slug: "chartered-accountant", icon: "📊" },
  { name: "Tax Accountant", slug: "tax-accountant", icon: "🧾" },
  { name: "Audit Manager", slug: "audit-manager", icon: "🔍" },
  { name: "Internal Auditor", slug: "internal-auditor", icon: "🔍" },
  { name: "Forensic Accountant", slug: "forensic-accountant", icon: "🔍" },
  { name: "Financial Analyst", slug: "financial-analyst", icon: "📈" },
  { name: "Budget Analyst", slug: "budget-analyst", icon: "📊" },
  { name: "Financial Controller", slug: "financial-controller", icon: "📊" },
  { name: "Treasury Manager", slug: "treasury-manager", icon: "🏦" },
  { name: "Risk Manager", slug: "risk-manager", icon: "⚠️" },
  { name: "Investment Advisor", slug: "investment-advisor", icon: "📈" },
  { name: "Portfolio Manager", slug: "portfolio-manager", icon: "💼" },
  { name: "Wealth Manager", slug: "wealth-manager", icon: "💰" },
  { name: "Credit Analyst", slug: "credit-analyst", icon: "💳" },
  { name: "Loan Officer", slug: "loan-officer", icon: "💰" },
  { name: "Mortgage Broker", slug: "mortgage-broker", icon: "🏠" },
  { name: "Insurance Underwriter", slug: "insurance-underwriter", icon: "🖊️" },
  { name: "Claims Adjuster", slug: "claims-adjuster", icon: "📋" },
  { name: "Actuary", slug: "actuary", icon: "📊" },
  { name: "Tax Preparer", slug: "tax-preparer", icon: "🧾" },
  { name: "Payroll Administrator", slug: "payroll-administrator", icon: "💰" },
  {
    name: "Accounts Receivable Specialist",
    slug: "accounts-receivable",
    icon: "💰",
  },
  { name: "Accounts Payable Specialist", slug: "accounts-payable", icon: "💰" },
  { name: "Bookkeeper", slug: "bookkeeper", icon: "📒" },

  // ── HUMAN RESOURCES ──────────────────────────────────────────────
  { name: "HR Director", slug: "hr-director", icon: "👥" },
  { name: "Human Resources Manager", slug: "hr-manager", icon: "👥" },
  { name: "HR Business Partner", slug: "hr-business-partner", icon: "🤝" },
  { name: "Recruitment Manager", slug: "recruitment-manager", icon: "🔍" },
  {
    name: "Talent Acquisition Specialist",
    slug: "talent-acquisition",
    icon: "🎯",
  },
  { name: "Onboarding Specialist", slug: "onboarding-specialist", icon: "👤" },
  { name: "Training Manager", slug: "training-manager", icon: "📚" },
  {
    name: "Learning & Development Specialist",
    slug: "learning-development",
    icon: "📖",
  },
  {
    name: "Employee Relations Manager",
    slug: "employee-relations",
    icon: "🤝",
  },
  { name: "Compensation Analyst", slug: "compensation-analyst", icon: "💰" },
  {
    name: "Benefits Administrator",
    slug: "benefits-administrator",
    icon: "📋",
  },
  { name: "Payroll Manager", slug: "payroll-manager", icon: "💰" },
  { name: "HR Generalist", slug: "hr-generalist", icon: "👥" },
  { name: "Recruiter", slug: "recruiter", icon: "🔍" },
  { name: "Employment Specialist", slug: "employment-specialist", icon: "💼" },
  { name: "Career Counselor", slug: "career-counselor", icon: "🎯" },
  { name: "Staffing Coordinator", slug: "staffing-coordinator", icon: "📋" },
  {
    name: "Workplace Safety Officer",
    slug: "workplace-safety-officer",
    icon: "⛑️",
  },
  { name: "Diversity Officer", slug: "diversity-officer", icon: "🌈" },
  { name: "Labor Relations Specialist", slug: "labor-relations", icon: "🤝" },

  // ── EDUCATION & ACADEMIA ──────────────────────────────────────────
  { name: "University President", slug: "university-president", icon: "🎓" },
  { name: "College Dean", slug: "college-dean", icon: "🎓" },
  { name: "Department Chair", slug: "department-chair", icon: "🏛️" },
  { name: "Professor", slug: "professor", icon: "👨‍🏫" },
  { name: "Associate Professor", slug: "associate-professor", icon: "👨‍🏫" },
  { name: "Assistant Professor", slug: "assistant-professor", icon: "👨‍🏫" },
  { name: "Adjunct Professor", slug: "adjunct-professor", icon: "👨‍🏫" },
  { name: "Research Scientist", slug: "research-scientist", icon: "🔬" },
  { name: "Research Fellow", slug: "research-fellow", icon: "🔬" },
  {
    name: "Postdoctoral Researcher",
    slug: "postdoctoral-researcher",
    icon: "🔬",
  },
  { name: "Academic Researcher", slug: "academic-researcher", icon: "📚" },
  { name: "Librarian", slug: "librarian", icon: "📚" },
  { name: "Archivist", slug: "archivist", icon: "📂" },
  { name: "Museum Curator", slug: "museum-curator", icon: "🏛️" },
  { name: "Historian", slug: "historian", icon: "📜" },
  { name: "Philosopher", slug: "philosopher", icon: "🧠" },
  { name: "Sociologist", slug: "sociologist", icon: "👥" },
  { name: "Psychologist", slug: "psychologist", icon: "🧠" },
  {
    name: "Educational Consultant",
    slug: "educational-consultant",
    icon: "📚",
  },
  { name: "Curriculum Developer", slug: "curriculum-developer", icon: "📖" },
  {
    name: "Instructional Designer",
    slug: "instructional-designer",
    icon: "🎯",
  },
  {
    name: "Education Administrator",
    slug: "education-administrator",
    icon: "🏫",
  },
  { name: "School Principal", slug: "school-principal", icon: "🏫" },
  { name: "Vice Principal", slug: "vice-principal", icon: "🏫" },
  { name: "School Counselor", slug: "school-counselor", icon: "🤝" },

  // ── HEALTHCARE ADMINISTRATION ─────────────────────────────────────
  { name: "Hospital CEO", slug: "hospital-ceo", icon: "🏥" },
  {
    name: "Hospital Administrator",
    slug: "hospital-administrator",
    icon: "🏥",
  },
  { name: "Chief Medical Officer", slug: "chief-medical-officer", icon: "🩺" },
  { name: "Chief Nursing Officer", slug: "chief-nursing-officer", icon: "🩺" },
  { name: "Medical Director", slug: "medical-director", icon: "🩺" },
  { name: "Nursing Director", slug: "nursing-director", icon: "🩺" },
  { name: "Clinical Director", slug: "clinical-director", icon: "📋" },
  {
    name: "Healthcare Administrator",
    slug: "healthcare-administrator",
    icon: "🏥",
  },
  {
    name: "Health Information Manager",
    slug: "health-information-manager",
    icon: "📋",
  },
  {
    name: "Medical Records Manager",
    slug: "medical-records-manager",
    icon: "📋",
  },
  {
    name: "Medical Billing Specialist",
    slug: "medical-billing-specialist",
    icon: "💰",
  },
  { name: "Medical Coder", slug: "medical-coder", icon: "💻" },
  { name: "Healthcare Consultant", slug: "healthcare-consultant", icon: "💼" },
  {
    name: "Public Health Administrator",
    slug: "public-health-administrator",
    icon: "🏥",
  },
  { name: "Health Policy Analyst", slug: "health-policy-analyst", icon: "📋" },
  { name: "Epidemiologist", slug: "epidemiologist", icon: "📊" },
  { name: "Biostatistician", slug: "biostatistician", icon: "📊" },
  {
    name: "Clinical Research Coordinator",
    slug: "clinical-research-coordinator",
    icon: "🔬",
  },
  { name: "Medical Writer", slug: "medical-writer", icon: "✍️" },
  {
    name: "Health Communication Specialist",
    slug: "health-communication",
    icon: "📣",
  },

  // ── CORPORATE & MANAGEMENT ────────────────────────────────────────
  { name: "CEO", slug: "ceo", icon: "👔" },
  { name: "Chief Operating Officer", slug: "coo", icon: "👔" },
  { name: "Chief Marketing Officer", slug: "cmo", icon: "📊" },
  { name: "Chief Technology Officer", slug: "cto", icon: "💻" },
  { name: "Chief Information Officer", slug: "cio", icon: "💻" },
  { name: "Chief Revenue Officer", slug: "cro", icon: "💰" },
  { name: "Chief Sustainability Officer", slug: "cso", icon: "🌍" },
  { name: "General Manager", slug: "general-manager", icon: "👔" },
  { name: "Regional Director", slug: "regional-director", icon: "🗺️" },
  { name: "Branch Manager", slug: "branch-manager", icon: "🏢" },
  { name: "Operations Manager", slug: "operations-manager", icon: "⚙️" },
  { name: "Project Manager", slug: "project-manager", icon: "📋" },
  { name: "Program Manager", slug: "program-manager", icon: "📊" },
  { name: "Product Manager", slug: "product-manager", icon: "🎯" },
  {
    name: "Business Development Manager",
    slug: "business-development-manager",
    icon: "📈",
  },
  {
    name: "Strategic Planning Manager",
    slug: "strategic-planning-manager",
    icon: "🎯",
  },
  {
    name: "Corporate Affairs Manager",
    slug: "corporate-affairs-manager",
    icon: "🏢",
  },
  { name: "Public Relations Manager", slug: "pr-manager", icon: "📣" },
  {
    name: "Communications Manager",
    slug: "communications-manager",
    icon: "📢",
  },
  { name: "Marketing Manager", slug: "marketing-manager", icon: "📱" },
  { name: "Brand Manager", slug: "brand-manager", icon: "🎯" },
  { name: "Sales Director", slug: "sales-director", icon: "📈" },
  { name: "Key Account Manager", slug: "key-account-manager", icon: "🤝" },
  {
    name: "Customer Relations Manager",
    slug: "customer-relations-manager",
    icon: "👥",
  },
  {
    name: "Client Services Director",
    slug: "client-services-director",
    icon: "👥",
  },
  {
    name: "Quality Assurance Manager",
    slug: "quality-assurance-manager",
    icon: "✅",
  },
  { name: "Compliance Manager", slug: "compliance-manager", icon: "✅" },
  {
    name: "Risk Compliance Officer",
    slug: "risk-compliance-officer",
    icon: "⚠️",
  },
  { name: "Data Privacy Officer", slug: "data-privacy-officer", icon: "🔐" },
  { name: "Facilities Manager", slug: "facilities-manager", icon: "🏢" },

  // ── CONSULTING & ADVISORY ─────────────────────────────────────────
  { name: "Management Consultant", slug: "management-consultant", icon: "💼" },
  { name: "Strategy Consultant", slug: "strategy-consultant", icon: "♟️" },
  { name: "Operations Consultant", slug: "operations-consultant", icon: "⚙️" },
  { name: "IT Consultant", slug: "it-consultant", icon: "💻" },
  {
    name: "Digital Transformation Consultant",
    slug: "digital-transformation",
    icon: "🔄",
  },
  {
    name: "Organizational Development Consultant",
    slug: "org-development",
    icon: "📈",
  },
  { name: "Executive Coach", slug: "executive-coach", icon: "🎯" },
  { name: "Financial Advisor", slug: "financial-advisor", icon: "💰" },
  { name: "Investment Consultant", slug: "investment-consultant", icon: "📈" },
  { name: "Business Analyst", slug: "business-analyst", icon: "📊" },
  { name: "Systems Analyst", slug: "systems-analyst", icon: "🖥️" },
  {
    name: "Change Management Consultant",
    slug: "change-management",
    icon: "🔄",
  },
  {
    name: "Crisis Management Consultant",
    slug: "crisis-management",
    icon: "🆘",
  },
  {
    name: "Environmental Consultant",
    slug: "environmental-consultant",
    icon: "🌍",
  },
  {
    name: "Sustainability Consultant",
    slug: "sustainability-consultant",
    icon: "♻️",
  },
  {
    name: "Diversity & Inclusion Consultant",
    slug: "diversity-inclusion",
    icon: "🌈",
  },
  {
    name: "Leadership Development Consultant",
    slug: "leadership-development",
    icon: "👔",
  },
  {
    name: "Team Building Facilitator",
    slug: "team-building-facilitator",
    icon: "👥",
  },
  {
    name: "Workplace Wellness Consultant",
    slug: "workplace-wellness",
    icon: "💪",
  },
  {
    name: "International Development Consultant",
    slug: "international-development",
    icon: "🌍",
  },

  // ── REAL ESTATE & PROPERTY ──────────────────────────────────────
  { name: "Real Estate Broker", slug: "real-estate-broker", icon: "🏠" },
  {
    name: "Commercial Real Estate Agent",
    slug: "commercial-real-estate",
    icon: "🏢",
  },
  {
    name: "Residential Real Estate Agent",
    slug: "residential-real-estate",
    icon: "🏠",
  },
  { name: "Property Developer", slug: "property-developer", icon: "🏗️" },
  { name: "Real Estate Investor", slug: "real-estate-investor", icon: "💰" },
  { name: "Property Appraiser", slug: "property-appraiser", icon: "📊" },
  { name: "Real Estate Attorney", slug: "real-estate-attorney", icon: "⚖️" },
  { name: "Title Examiner", slug: "title-examiner", icon: "🔍" },
  { name: "Escrow Officer", slug: "escrow-officer", icon: "🔐" },
  { name: "Leasing Agent", slug: "leasing-agent", icon: "🔑" },
  { name: "Property Manager", slug: "property-manager", icon: "🏢" },
  { name: "Community Manager", slug: "community-manager", icon: "🏘️" },
  { name: "HOA Manager", slug: "hoa-manager", icon: "🏠" },
  {
    name: "Real Estate Photographer",
    slug: "real-estate-photographer",
    icon: "📸",
  },
  { name: "Home Inspector", slug: "home-inspector", icon: "🔍" },
  { name: "Land Surveyor", slug: "land-surveyor", icon: "📐" },
  {
    name: "Construction Appraiser",
    slug: "construction-appraiser",
    icon: "📊",
  },
  {
    name: "Real Estate Marketing Specialist",
    slug: "real-estate-marketing",
    icon: "📱",
  },

  // ── INSURANCE ──────────────────────────────────────────────────────
  { name: "Insurance Broker", slug: "insurance-broker", icon: "🛡️" },
  { name: "Insurance Agent", slug: "insurance-agent", icon: "🛡️" },
  { name: "Claims Manager", slug: "claims-manager", icon: "📋" },
  { name: "Risk Assessor", slug: "risk-assessor", icon: "⚠️" },
  { name: "Loss Prevention Specialist", slug: "loss-prevention", icon: "🛡️" },
  {
    name: "Insurance Investigator",
    slug: "insurance-investigator",
    icon: "🔍",
  },
  {
    name: "Life Insurance Underwriter",
    slug: "life-insurance-underwriter",
    icon: "📋",
  },
  {
    name: "Health Insurance Specialist",
    slug: "health-insurance-specialist",
    icon: "🏥",
  },
  {
    name: "Property Insurance Adjuster",
    slug: "property-insurance-adjuster",
    icon: "🏠",
  },
  {
    name: "Auto Insurance Adjuster",
    slug: "auto-insurance-adjuster",
    icon: "🚗",
  },

  // ── BANKING & FINANCIAL SERVICES ─────────────────────────────────
  { name: "Bank Manager", slug: "bank-manager", icon: "🏦" },
  { name: "Branch Manager", slug: "branch-manager", icon: "🏦" },
  { name: "Investment Banker", slug: "investment-banker", icon: "💼" },
  { name: "Private Banker", slug: "private-banker", icon: "👔" },
  { name: "Financial Planner", slug: "financial-planner", icon: "📊" },
  { name: "Wealth Advisor", slug: "wealth-advisor", icon: "💰" },
  { name: "Trust Officer", slug: "trust-officer", icon: "📋" },
  { name: "Estate Planner", slug: "estate-planner", icon: "📜" },
  { name: "Stockbroker", slug: "stockbroker", icon: "📈" },
  { name: "Foreign Exchange Dealer", slug: "forex-dealer", icon: "💱" },
  { name: "Commodity Trader", slug: "commodity-trader", icon: "📊" },
  {
    name: "Financial Services Representative",
    slug: "financial-services-rep",
    icon: "👔",
  },
  { name: "Credit Union Manager", slug: "credit-union-manager", icon: "🏦" },
  { name: "Loan Processor", slug: "loan-processor", icon: "📋" },
  { name: "Underwriting Manager", slug: "underwriting-manager", icon: "📋" },

  // ── TECHNOLOGY & IT MANAGEMENT ──────────────────────────────────
  { name: "IT Director", slug: "it-director", icon: "💻" },
  { name: "IT Manager", slug: "it-manager", icon: "💻" },
  {
    name: "Infrastructure Manager",
    slug: "infrastructure-manager",
    icon: "🏗️",
  },
  {
    name: "Cloud Services Manager",
    slug: "cloud-services-manager",
    icon: "☁️",
  },
  { name: "Data Center Manager", slug: "data-center-manager", icon: "🏗️" },
  {
    name: "Software Development Manager",
    slug: "software-dev-manager",
    icon: "💻",
  },
  { name: "Engineering Director", slug: "engineering-director", icon: "⚙️" },
  { name: "Tech Lead", slug: "tech-lead", icon: "👔" },
  { name: "Scrum Master", slug: "scrum-master", icon: "🔄" },
  { name: "Agile Coach", slug: "agile-coach", icon: "🏃" },
  { name: "DevOps Manager", slug: "devops-manager", icon: "🔄" },
  { name: "QA Manager", slug: "qa-manager", icon: "✅" },
  {
    name: "Technical Project Manager",
    slug: "technical-project-manager",
    icon: "📋",
  },
  {
    name: "Digital Product Manager",
    slug: "digital-product-manager",
    icon: "📱",
  },
  { name: "UX Manager", slug: "ux-manager", icon: "👤" },
  { name: "Creative Director", slug: "creative-director", icon: "🎨" },
  { name: "Art Director", slug: "art-director", icon: "🎨" },
];

async function seed() {
  console.log(
    `\n🏛️ Seeding ${categories.length} government and white-collar professionals...\n`,
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
          description: `${cat.name} professional services`,
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

// # Run the seed
// node prisma/seed/government-white-collar.cjs

import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

let prisma;

function getPrisma() {
  if (!prisma) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false,
      max: 20, // Increase pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    // Set statement timeout to 60 seconds to prevent hanging queries
    prisma.$executeRaw`SET statement_timeout = '60000'`;
  }
  return prisma;
}

export default new Proxy(
  {},
  {
    get(_, prop) {
      return getPrisma()[prop];
    },
  },
);

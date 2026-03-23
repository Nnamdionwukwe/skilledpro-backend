import { PrismaClient } from "../generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export default prisma;

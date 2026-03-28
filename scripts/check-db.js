// scripts/check-db.js
import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});
const { rows } = await pool.query(`
  SELECT conname FROM pg_constraint 
  WHERE conrelid = '"Review"'::regclass AND contype = 'u'
`);
console.log("Unique constraints on Review:", rows);
await pool.end();

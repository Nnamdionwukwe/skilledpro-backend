-- ============================================================
-- SkilledProz Backend — Database Initialization
-- Run this FIRST on a fresh Postgres instance
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: uncomment if you want to auto-set the search_path
-- SET search_path TO public;

-- Note: database creation is done outside this file, e.g.:
--   createdb skilledproz
--   psql -U prisma -d skilledproz

#!/usr/bin/env bash
# Patches all controller SQL files to use IF NOT EXISTS
set -e
cd "$(dirname "$0")"

echo "Patching enums..."
sed -i '' 's/^CREATE TYPE "\([^"]*\)" AS ENUM/CREATE TYPE IF NOT EXISTS "\1" AS ENUM/' 01-enums.sql

echo "Patching controllers..."
for f in controllers/*.sql; do
  # CREATE TABLE → CREATE TABLE IF NOT EXISTS
  sed -i '' 's/^CREATE TABLE "\([^"]*\)" (/CREATE TABLE IF NOT EXISTS "\1" (/' "$f"
  # CREATE UNIQUE INDEX → CREATE UNIQUE INDEX IF NOT EXISTS
  sed -i '' 's/^CREATE UNIQUE INDEX "\([^"]*\)" ON/CREATE UNIQUE INDEX IF NOT EXISTS "\1" ON/' "$f"
  # CREATE INDEX → CREATE INDEX IF NOT EXISTS
  sed -i '' 's/^CREATE INDEX "\([^"]*\)" ON/CREATE INDEX IF NOT EXISTS "\1" ON/' "$f"
  echo "  patched: $f"
done

echo "OK - all files patched"

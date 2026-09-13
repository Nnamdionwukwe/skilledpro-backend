#!/usr/bin/env bash
# Rewrites 01-enums.sql to use DO blocks (valid Postgres idempotent enum creation)
set -e
cd "$(dirname "$0")"

python3 << 'PY_EOF'
import re

with open("01-enums.sql", "r") as f:
    content = f.read()

# Match: CREATE TYPE IF NOT EXISTS "Name" AS ENUM ('A', 'B', ...);
pattern = re.compile(
    r'CREATE TYPE IF NOT EXISTS "([^"]+)" AS ENUM \(([^)]+)\);'
)

def replace(m):
    name = m.group(1)
    values = m.group(2)
    return (
        f'DO $$ BEGIN\n'
        f'  CREATE TYPE "{name}" AS ENUM ({values});\n'
        f'EXCEPTION WHEN duplicate_object THEN null;\n'
        f'END $$;'
    )

new_content = pattern.sub(replace, content)

with open("01-enums.sql", "w") as f:
    f.write(new_content)

print("OK 01-enums.sql rewritten with DO blocks")
PY_EOF

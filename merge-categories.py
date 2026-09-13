#!/usr/bin/env python3
"""
Merges category definitions from multiple JS files into one master JSON.
Uses regex to extract {name, slug, icon} objects.
"""
import re
import json
import sys

FILES = [
    "categories.js",
    "seed_categories_global.js",
    "categories-government-white-collar.cjs",
    "seed_global.js",
    "seed.js",
]

# Pattern: { name: "...", slug: "...", icon: "..." } possibly multiline
PATTERN = re.compile(
    r'\{\s*name:\s*"([^"]+)"\s*,\s*slug:\s*"([^"]+)"\s*,\s*icon:\s*"([^"]*)"\s*,?\s*\}',
    re.MULTILINE | re.DOTALL,
)

all_categories = {}
per_file_counts = {}

for path in FILES:
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"SKIP (not found): {path}")
        continue

    matches = PATTERN.findall(content)
    per_file_counts[path] = len(matches)

    for name, slug, icon in matches:
        slug = slug.strip().lower()
        if slug not in all_categories:
            all_categories[slug] = {
                "name": name.strip(),
                "slug": slug,
                "icon": icon.strip() or None,
            }

print("═══ Per-file counts ═══")
for f, c in per_file_counts.items():
    print(f"  {f:50s}  {c}")
print(f"\n═══ Merged unique categories: {len(all_categories)} ═══")

with open("categories-master.json", "w", encoding="utf-8") as f:
    json.dump(list(all_categories.values()), f, indent=2, ensure_ascii=False)

print(f"\n✅ Wrote categories-master.json ({len(all_categories)} categories)")

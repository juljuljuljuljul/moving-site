"""
Scans images/desktop and images/mobile, writes manifest.json listing the
frames found in each (sorted naturally, e.g. 1,2,10 not 1,10,2).

Run this every time you add or remove images:

    python3 generate_manifest.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
VALID_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def natural_key(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def scan(folder):
    path = os.path.join(ROOT, "images", folder)
    if not os.path.isdir(path):
        return []
    files = [f for f in os.listdir(path) if os.path.splitext(f)[1].lower() in VALID_EXT]
    files.sort(key=natural_key)
    return files


manifest = {
    "desktop": scan("desktop"),
    "mobile": scan("mobile"),
}

out_path = os.path.join(ROOT, "manifest.json")
with open(out_path, "w") as f:
    json.dump(manifest, f, indent=2)

print(f"desktop: {len(manifest['desktop'])} frames")
print(f"mobile:  {len(manifest['mobile'])} frames")
print(f"wrote {out_path}")

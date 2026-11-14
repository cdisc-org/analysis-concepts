"""Rebuild every library and study file from the source branches.

Runs the migration scripts in dependency order. It needs the source branches
as local remote-tracking refs (git fetch origin) and Node.js for one step.

  python v1/tools/migrate_all.py
"""
from __future__ import annotations

import subprocess
import sys

from common import V1

STEPS = [
    ["node", "dump_smartphrase_sources.mjs"],
    [sys.executable, "migrate_methods.py"],
    [sys.executable, "migrate_concepts.py"],
    [sys.executable, "migrate_transformations.py"],
    [sys.executable, "migrate_smartphrases.py"],
    [sys.executable, "migrate_implementation.py"],
    [sys.executable, "migrate_studies.py"],
]


def main():
    tools = V1 / "tools"
    (tools / ".cache").mkdir(exist_ok=True)
    for step in STEPS:
        print("==", " ".join(step[1:] if step[0] != "node" else step))
        if step[0] == "node":
            with open(tools / ".cache" / "smartphrase_sources.json", "w", encoding="utf-8") as out:
                subprocess.run(step, cwd=tools, check=True, stdout=out)
        else:
            subprocess.run(step, cwd=tools, check=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

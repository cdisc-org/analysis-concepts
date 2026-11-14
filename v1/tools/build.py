"""Generate JSON Schema from the LinkML sources.

  python v1/tools/build.py          write v1/json_schema/*.schema.json
  python v1/tools/build.py --check  exit 1 if any generated file is out of date

The JSON Schema files are generated and never edited by hand.
"""
from __future__ import annotations

import json
import subprocess
import sys

from common import JSON_SCHEMA_DIR, SCHEMA_DIR

SCHEMAS = ["ac_statistic", "ac_statistic_set", "ac_output_class", "ac_method", "ac_concept",
           "ac_transformation", "ac_smartphrase", "ac_binding", "ac_implementation", "ac_study"]


def generate(name: str) -> str:
    result = subprocess.run(
        ["gen-json-schema", "--importmap", "import_map.json", f"{name}.yaml"],
        cwd=SCHEMA_DIR, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{name}: {result.stderr.strip().splitlines()[-1] if result.stderr else 'failed'}")
    return json.dumps(json.loads(result.stdout), indent=2) + "\n"


def main(argv):
    check = "--check" in argv
    stale = []
    for name in SCHEMAS:
        text = generate(name)
        path = JSON_SCHEMA_DIR / f"{name}.schema.json"
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(name)
        else:
            path.write_text(text, encoding="utf-8")
            print("wrote", path.name)
    if stale:
        print("out of date:", ", ".join(stale))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""Rebuild lib/methods/AllMethods.json by bundling the per-file methods (new
schema, verbatim) plus the vocabulary sections. Single source of truth = the
per-file M_*.json files + lib/vocabulary/*. Run:
  .venv/bin/python scripts/build_all_methods.py
"""
import json, glob, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
M = ROOT / "lib" / "methods"
VOCAB = ROOT / "lib" / "vocabulary"

def load(p): return json.load(open(p))

methods = []
for path in sorted(glob.glob(str(M/"analyses"/"*.json")) + glob.glob(str(M/"derivations"/"*.json"))):
    m = load(path)
    m["_kind"] = "analysis" if "analyses" in path else "derivation"
    m["_sourceFile"] = str(pathlib.Path(path).relative_to(ROOT))
    methods.append(m)

agg = {
    "schemaVersion": "1.0.0",
    "_generatedBy": "scripts/build_all_methods.py",
    "_note": "GENERATED — do not hand-edit. Bundles per-file methods + vocabulary. Edit the sources and rerun the builder.",
    "methods": methods,
    "statistics": load(VOCAB/"statistics_vocabulary.json")["statistics"],
    "statisticSets": load(VOCAB/"statistic_sets.json")["statistic_sets"],
    "outputClassTemplates": load(VOCAB/"output_class_templates.json")["output_class_templates"],
}
out = M / "AllMethods.json"
out.write_text(json.dumps(agg, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {out.relative_to(ROOT)} with {len(methods)} methods, "
      f"{len(agg['statisticSets'])} sets, {len(agg['outputClassTemplates'])} templates")

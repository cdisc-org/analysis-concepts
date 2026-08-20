#!/usr/bin/env python3
"""
Merge v07 phrase metadata into the v06 transformation library, additively.

    python3 scripts/upgrade_phrase_metadata.py           # write
    python3 scripts/upgrade_phrase_metadata.py --check   # verify, no write

Only `smartPhrases[]` is touched. Everything the execution path reads —
bindings, slices, methodOutputSlotMapping, acCategory, the split
derivation/analysis arrays — is copied through untouched, and the script
asserts that before writing.

Existing phrases keep their v06 `phrase_template`, `configurations`,
`references`, `role` and `name`. They gain `placeholders[]` and `anchors{}`
verbatim from v07, plus `phrase_template_slotted` when v07's template differs
(which happens only for the four method phrases, where v06 bakes the method
name into the sentence and v07 makes it a slot).
"""
import copy
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v06.json"

SOURCE_COMMIT = "ffee5df"
SOURCE_FILE = "lib/transformations/ACDC_Transformation_Library_v07.json"

# Phrases to add that v06 does not define. SP_METHOD_CHISQ is not optional:
# T.Responder_ChiSq already references it.
NEW_PHRASES = [
    "SP_AUC_ENDPOINT",
    "SP_SHIFT_ENDPOINT",
    "SP_PCTCFB_ENDPOINT",
    "SP_METHOD_CHISQ",
    "SP_METHOD_DESCSTATS",
]

# v06-style plain templates for new phrases whose v07 template contains a
# method_ref slot. Declared, not inferred — the existing engine cannot
# substitute a method_ref, so it needs prose with the method already in it.
PLAIN_TEMPLATE = {
    "SP_METHOD_CHISQ": "using the chi-squared test",
    "SP_METHOD_DESCSTATS": "summarised by descriptive statistics",
}

# Keys that must be identical before and after. Everything the app executes from.
FROZEN_KEYS = [
    "version", "description", "_w3c_alignment", "$references",
    "configurationOptions", "roleDefinitions",
    "derivationTransformations", "analysisTransformations",
]


def load_v07():
    raw = subprocess.run(
        ["git", "show", f"{SOURCE_COMMIT}:{SOURCE_FILE}"],
        cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(raw)


def upgrade(v06, v07):
    out = copy.deepcopy(v06)
    s7 = {p["oid"]: p for p in v07["smartPhrases"]}

    for phrase in out["smartPhrases"]:
        oid = phrase["oid"]
        src = s7.get(oid)
        if src is None:
            raise SystemExit(f"FAIL — v06 phrase {oid} has no v07 counterpart")
        phrase["placeholders"] = copy.deepcopy(src["placeholders"])
        phrase["anchors"] = copy.deepcopy(src.get("anchors", {}))
        if src["phrase_template"] != phrase["phrase_template"]:
            phrase["phrase_template_slotted"] = src["phrase_template"]

    existing = {p["oid"] for p in out["smartPhrases"]}
    for oid in NEW_PHRASES:
        if oid in existing:
            continue
        src = s7[oid]
        placeholders = copy.deepcopy(src["placeholders"])
        configurations = [ph["name"] for ph in placeholders
                          if ph.get("kind") != "method_ref"]
        plain = PLAIN_TEMPLATE.get(oid, src["phrase_template"])
        entry = {
            "oid": oid,
            "name": src["name"],
            "role": src["role"],
            "phrase_template": plain,
            "configurations": configurations,
            "references": sorted(
                {v for v in src.get("anchors", {}).values()
                 if not str(v).startswith("M.")}
                | {ph["concept_constraint"] for ph in placeholders
                   if ph.get("concept_constraint")}),
            "placeholders": placeholders,
            "anchors": copy.deepcopy(src.get("anchors", {})),
        }
        if src["phrase_template"] != plain:
            entry["phrase_template_slotted"] = src["phrase_template"]
        out["smartPhrases"].append(entry)

    for key in FROZEN_KEYS:
        if json.dumps(out[key], sort_keys=True) != json.dumps(v06[key], sort_keys=True):
            raise SystemExit(f"FAIL — generator altered frozen key '{key}'")

    return out


def main() -> int:
    check = "--check" in sys.argv
    v06 = json.loads(LIB.read_text(encoding="utf-8"))
    result = upgrade(v06, load_v07())
    body = json.dumps(result, indent=2, ensure_ascii=False) + "\n"

    if check:
        if LIB.read_text(encoding="utf-8") != body:
            print("FAIL — v06 on disk differs from generator output.")
            return 1
        print("PASS — v06 matches generator output.")
        return 0

    LIB.write_text(body, encoding="utf-8")
    print(f"wrote {LIB.relative_to(ROOT)} — {len(result['smartPhrases'])} phrases "
          f"({len(NEW_PHRASES)} added)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

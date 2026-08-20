#!/usr/bin/env python3
"""
Guard for the smartPhrases[] block of Transformation Library v06.

    python3 scripts/validate_phrase_shapes.py

Two engines read this block at once and they read different fields:

  * the existing engine (ac-dc-app/js/utils/phrase-engine.js) substitutes only
    the tokens listed in `configurations`, from `phrase_template`;
  * the ported engine (ac-dc-app/js/utils/smartphrase-engine.js) substitutes
    `placeholders[].name`, from `phrase_template_slotted` when present.

The checks below are exactly the invariants that let both be correct at once.
Stdlib only; no test framework in this repo by design.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIB = ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v06.json"

TOKEN = re.compile(r"\{([a-zA-Z_][a-zA-Z0-9_]*)\}")


def main() -> int:
    lib = json.loads(LIB.read_text(encoding="utf-8"))
    phrases = lib["smartPhrases"]
    defined = {p["oid"] for p in phrases}
    failures = []

    for p in phrases:
        oid = p["oid"]

        if "placeholders" not in p:
            failures.append(f"{oid}: missing placeholders[]")
            continue
        if "anchors" not in p:
            failures.append(f"{oid}: missing anchors{{}}")

        names = {ph["name"] for ph in p["placeholders"]}
        # A method_ref slot is new in the v07 shape; the old engine never
        # modelled it, so it is deliberately absent from `configurations`.
        non_method = {ph["name"] for ph in p["placeholders"]
                      if ph.get("kind") != "method_ref"}
        configured = set(p.get("configurations", []))
        if non_method != configured:
            failures.append(
                f"{oid}: non-method placeholders {sorted(non_method)} "
                f"!= configurations {sorted(configured)}")

        # The old engine renders `phrase_template` and substitutes only
        # `configurations`. Any other token would reach the UI literally.
        for tok in TOKEN.findall(p["phrase_template"]):
            if tok not in configured:
                failures.append(
                    f"{oid}: phrase_template token {{{tok}}} is not in "
                    f"configurations — the existing engine would render it literally")

        # The ported engine renders the slotted template against placeholders.
        slotted = p.get("phrase_template_slotted")
        if slotted is not None:
            for tok in TOKEN.findall(slotted):
                if tok not in names:
                    failures.append(
                        f"{oid}: phrase_template_slotted token {{{tok}}} "
                        f"is not a placeholder name")

    transformations = (lib["derivationTransformations"]
                       + lib["analysisTransformations"])
    for t in transformations:
        for oid in t.get("validSmartPhrases", []):
            if oid not in defined:
                failures.append(
                    f"{t['oid']}: validSmartPhrases references undefined phrase {oid}")

    if failures:
        print(f"FAIL — {len(failures)} problem(s):")
        for f in failures:
            print("  -", f)
        return 1

    print(f"PASS — {len(phrases)} phrases: placeholders and configurations agree, "
          f"anchors present, no unsubstitutable tokens, no dangling references.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

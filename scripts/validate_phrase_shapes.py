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
    phrases = lib.get("smartPhrases")
    if not isinstance(phrases, list):
        print("FAIL — 1 problem(s):")
        print("  - smartPhrases is missing or not an array")
        return 1

    defined = set()
    failures = []

    for i, p in enumerate(phrases):
        oid = p.get("oid")
        if oid is None:
            failures.append(f"phrase #{i}: missing oid")
            continue
        defined.add(oid)

        if "placeholders" not in p:
            failures.append(f"{oid}: missing placeholders[]")
            continue
        if "anchors" not in p:
            failures.append(f"{oid}: missing anchors{{}}")

        placeholders = p.get("placeholders", [])
        if not isinstance(placeholders, list):
            failures.append(f"{oid}: placeholders is not an array")
            continue

        # Check for missing placeholder names and report them.
        for j, ph in enumerate(placeholders):
            if ph.get("name") is None:
                failures.append(f"{oid}: placeholder #{j}: missing name")

        names = {ph.get("name") for ph in placeholders if ph.get("name") is not None}
        # `configurations` is what the OLD engine can substitute; `placeholders`
        # is what the NEW engine knows about. Every slot the old engine fills must
        # exist as a placeholder — but a placeholder need not appear in
        # `configurations`. SP_IMPUTATION is the motivating case: its slot is both
        # a configuration (the old engine renders {imputation}) and a method_ref
        # (LOCF/BOCF/WOCF are catalogue methods). Requiring equality would force a
        # false choice between mis-typing the slot and leaking a raw token to the UI.
        configured = set(p.get("configurations", []))
        missing_slots = configured - names
        if missing_slots:
            failures.append(
                f"{oid}: configurations {sorted(missing_slots)} have no matching "
                f"placeholder — the ported engine cannot resolve them")

        # The old engine renders `phrase_template` and substitutes only
        # `configurations`. Any other token would reach the UI literally.
        phrase_template = p.get("phrase_template")
        if phrase_template is None:
            failures.append(f"{oid}: missing phrase_template")
        else:
            for tok in TOKEN.findall(phrase_template):
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

    deriv_transforms = lib.get("derivationTransformations")
    if not isinstance(deriv_transforms, list):
        failures.append("derivationTransformations is missing or not an array")
        deriv_transforms = []

    analysis_transforms = lib.get("analysisTransformations")
    if not isinstance(analysis_transforms, list):
        failures.append("analysisTransformations is missing or not an array")
        analysis_transforms = []

    transformations = deriv_transforms + analysis_transforms
    for t in transformations:
        t_oid = t.get("oid", "<unnamed transformation>")
        for oid in t.get("validSmartPhrases", []):
            if oid not in defined:
                failures.append(
                    f"{t_oid}: validSmartPhrases references undefined phrase {oid}")

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

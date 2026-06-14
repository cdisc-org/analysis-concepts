#!/usr/bin/env python3
"""Cross-layer invariant validator for the ACDC method/output-class/AC model.
Run: .venv/bin/python scripts/validate_methods_model.py
Exit 0 = all checks pass; exit 1 = one or more failures (printed)."""
import json, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
VOCAB = ROOT / "lib" / "vocabulary"

failures = []
def check(cond, msg):
    if not cond:
        failures.append(msg)

def load(p):
    return json.load(open(p))

# ---- Terminology (statistic terms) ----------------------------------------
# statistics_vocabulary.json is the SKOS terminology layer: terms carry a
# primitive dataType ONLY. FHIR datatypes live on the AC concept side (D-layers).
stats = load(VOCAB / "statistics_vocabulary.json")["statistics"]

for aid, a in stats.items():
    check("dataType" in a, f"[A1] term {aid} missing primitive dataType")
    check("fhirValueType" not in a,
          f"[A1] term {aid} must NOT carry fhirValueType — FHIR datatype is a concept-side fact (D-layers)")

# A2: numerator/denominator terms exist (needed by proportion_estimate set)
for needed in ("numerator", "denominator"):
    check(needed in stats, f"[A1] term {needed} not yet defined")

# ---- Statistic sets -------------------------------------------------------
SETS_PATH = VOCAB / "statistic_sets.json"
check(SETS_PATH.exists(), "[A3] statistic_sets.json does not exist")
if SETS_PATH.exists():
    sets = load(SETS_PATH)["statistic_sets"]
    EXPECTED_SETS = {
        "hypothesis_test_F_distribution","hypothesis_test_t_distribution",
        "hypothesis_test_chi_squared","hypothesis_test_normal","hypothesis_test_p_value",
        "ci_estimate","ci_estimate_normal","ci_estimate_t_distribution",
        "ci_estimate_odds_ratio","ci_estimate_hazard_ratio","point_estimate_SE",
        "proportion_estimate","computed_value",
    }
    check(set(sets) == EXPECTED_SETS,
          f"[A3] set ids mismatch: missing={EXPECTED_SETS-set(sets)} extra={set(sets)-EXPECTED_SETS}")
    for sid, s in sets.items():
        check(s.get("conceptId") == sid, f"[A3] set {sid} conceptId mismatch")
        for atom in s.get("statistics", []):
            check(atom in stats, f"[A3] set {sid} references unknown atom {atom}")
else:
    sets = {}

# ---- FHIR value types -----------------------------------------------------
fvt = load(VOCAB / "fhir_value_types.json")
for ct in ("Range", "Count"):
    check(ct in fvt["complexTypes"], f"[A4] complexType {ct} missing from fhir_value_types.json")
check(fvt["layerMapping"]["ac_concept_statistics"] != "primitiveTypes",
      "[A4] layerMapping.ac_concept_statistics still restricted to primitiveTypes")

# ---- Output class templates: §3.2.1 invariant -----------------------------
templates = load(VOCAB / "output_class_templates.json")["output_class_templates"]
baseline = load(ROOT / "scripts" / "_template_statistics_baseline.json")

# estimate specialization (D-point): a set's `estimate` may stand for these per template
ESTIMATE_SPECIALIZATION = {
    "parameter_estimates_linear": "coefficient",
    "parameter_estimates_glm": "coefficient",
    "parameter_estimates_cox": "coefficient",
    "survival_table": "survival_prob",
    "median_survival": "median",
    "landmark_estimates": "survival_prob",
}
# intentional expansions beyond the frozen baseline (D-prop)
INTENTIONAL_ADD = {"proportion_estimate": {"numerator", "denominator"}}

for tid, tpl in templates.items():
    if tpl.get("abstract"):
        check("statistics_set" not in tpl and "statistics" not in tpl and "additional_statistics" not in tpl,
              f"[B1] abstract template {tid} must carry no statistics/sets")
        continue
    check("statistics" not in tpl, f"[B1] concrete template {tid} still has flat statistics[]")
    setlist = tpl.get("statistics_set", [])
    add = list(tpl.get("additional_statistics", []))
    opt = set(tpl.get("optional_statistics", []))
    spec = ESTIMATE_SPECIALIZATION.get(tid)
    produced = set(add)
    for sid in setlist:
        check(sid in sets, f"[B1] template {tid} references unknown set {sid}")
        for atom in sets.get(sid, {}).get("statistics", []):
            produced.add(spec if (atom == "estimate" and spec) else atom)
    # optional members are part of the produced universe
    produced |= opt
    expected = set(baseline.get(tid, {}).get("statistics", [])) | \
               set(baseline.get(tid, {}).get("optional_statistics", [])) | \
               INTENTIONAL_ADD.get(tid, set())
    check(produced == expected,
          f"[B1] template {tid}: produced{sorted(produced)} != expected{sorted(expected)} "
          f"(extra={sorted(produced-expected)}, missing={sorted(expected-produced)})")
    # optional_statistics must be a subset of produced
    check(opt <= produced, f"[B1] template {tid}: optional_statistics not subset of produced")

# ---- AC concept side: terminology crosswalk (D-layers) --------------------
ac = load(ROOT / "lib" / "concepts" / "AC_Concept_Model_v017.json")
ac_concepts = ac["sharedStatisticsVocabulary"]["concepts"]
ALLOWED_FHIR = {"decimal","integer","code","string","boolean","date","dateTime","id",
                "Quantity","Range","Count","CodeableConcept","Identifier"}
ALLOWED_UNIT = {"inherited","dimensionless","none","fixed: %",
                "inherited or dimensionless","inherited or specified"}

# AC concept -> set of terminology terms it covers (single-leaf via `term`,
# multi-leaf via each leaf's `term`, e.g. ConfidenceInterval -> CI_lower/CI_upper).
def concept_terms(c):
    if "term" in c:
        return {c["term"]}
    if "leaves" in c:
        return {leaf["term"] for leaf in c["leaves"]}
    return set()
COVER = {cid: concept_terms(c) for cid, c in ac_concepts.items()}

# C1: each AC statistical concept is THIN — references terminology (term/leaves
#     resolving to real terms) + carries a valid fhirValueType + unit, and does
#     NOT re-state terminology-owned facts (single source).
for cid, c in ac_concepts.items():
    check(("term" in c) ^ ("leaves" in c),
          f"[C1] AC concept {cid} must have exactly one of term / leaves")
    for t in concept_terms(c):
        check(t in stats, f"[C1] AC concept {cid} references unknown term {t!r}")
    check(c.get("fhirValueType") in ALLOWED_FHIR,
          f"[C1] AC concept {cid} fhirValueType {c.get('fhirValueType')!r} missing/invalid")
    check(c.get("unit") in ALLOWED_UNIT,
          f"[C1] AC concept {cid} unit {c.get('unit')!r} missing/invalid")
    for forbidden in ("statoMapping", "definition", "dataType"):
        check(forbidden not in c,
              f"[C1] AC concept {cid} must not re-state {forbidden} (single source = terminology)")

# C2: result patterns reference shared sets; constituents' terms cover the
#     union of those sets' terms (leaf-aware, §4.1/§5.2 item 6).
patterns = ac["resultPatterns"]
_PATTERN_TO_TEMPLATE = {
    "ParameterEstimates": "parameter_estimates_linear",
    "SurvivalTable": "survival_table",
    "MedianSurvival": "median_survival",
}
for pid, p in patterns.items():
    if pid == "note":
        continue
    refsets = p.get("statistics_set", [])
    for sid in refsets:
        check(sid in sets, f"[C2] pattern {pid} references unknown set {sid}")
    required_atoms = set()
    for sid in refsets:
        required_atoms |= set(sets.get(sid, {}).get("statistics", []))
    for cid in p.get("additional_statistics", []):
        required_atoms |= COVER.get(cid, {cid})
    covered = set()
    for cid in p.get("constituents", []):
        check(cid in ac_concepts, f"[C2] pattern {pid} constituent {cid} not a known AC concept")
        covered |= COVER.get(cid, set())
    spec = ESTIMATE_SPECIALIZATION.get(_PATTERN_TO_TEMPLATE.get(pid))
    if spec and "estimate" in required_atoms:
        required_atoms = (required_atoms - {"estimate"}) | {spec}
    opt = set(p.get("optional_statistics", []))
    check(covered == (required_atoms | opt) or covered == required_atoms,
          f"[C2] pattern {pid}: constituent terms {sorted(covered)} != set terms {sorted(required_atoms)}")

# C3: methodOutputSlotMapping resolves to real patterns
for m, slots in ac["methodOutputSlotMapping"].items():
    if m == "note":
        continue
    for slot, pat in slots.items():
        check(pat in patterns, f"[C3] methodOutputSlotMapping {m}.{slot} -> unknown pattern {pat}")

# ---- Contrast spec §3.6: contrasts_* outputs carry no contrast-row indexed_by
import glob
for f in glob.glob(str(ROOT / "lib" / "methods" / "analyses" / "*.json")):
    m = load(f)
    for o in m.get("outputs", []):
        if o.get("output_type") in ("contrasts_t", "contrasts_z"):
            ib = o.get("indexed_by", [])
            check("fixed_effect" not in ib,
                  f"[E1] {pathlib.Path(f).name}: contrasts output still has indexed_by 'fixed_effect' (contrast rows are member-defined)")

# ---- AllMethods.json aggregate is complete & current ----------------------
ALLM_PATH = ROOT / "lib" / "methods" / "AllMethods.json"
check(ALLM_PATH.exists(), "[F1] AllMethods.json does not exist (run scripts/build_all_methods.py)")
if ALLM_PATH.exists():
    allm = load(ALLM_PATH)
    file_ids = set()
    for f in glob.glob(str(ROOT/'lib'/'methods'/'analyses'/'*.json'))+glob.glob(str(ROOT/'lib'/'methods'/'derivations'/'*.json')):
        file_ids.add(load(f)["conceptId"])
    agg_ids = {m["conceptId"] for m in allm.get("methods", [])}
    check(file_ids == agg_ids, f"[F1] AllMethods out of sync: missing={file_ids-agg_ids} extra={agg_ids-file_ids}")
    check("statisticSets" in allm, "[F1] AllMethods missing statisticSets section")
    check(set(allm.get("statisticSets", {})) == EXPECTED_SETS, "[F1] AllMethods statisticSets stale")

def main():
    if failures:
        print(f"FAIL ({len(failures)} issue(s)):")
        for f in failures: print("  -", f)
        sys.exit(1)
    print("OK — all checks passed")

if __name__ == "__main__":
    main()

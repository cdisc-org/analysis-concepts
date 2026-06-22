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

# Units are a concept property (single source of truth). `unitRule` says HOW the
# result unit is determined; the concrete unit (e.g. mg/L/week) is instance data.
# The valueType <-> unitRule pairing is constrained by this coherence table.
# Note: `unitless` (NOT `dimensionless`) — "dimension" is reserved for cube axes.
UNIT_RULES = {"inherited", "derived", "fixed", "unitless", "none"}
UNITRULE_BY_VALUETYPE = {
    "Quantity":        {"inherited", "derived", "fixed", "unitless"},
    "Range":           {"inherited", "derived", "fixed", "unitless"},
    "Count":           {"unitless", "none"},
    "decimal":         {"unitless", "none"},
    "integer":         {"unitless", "none"},
    "CodeableConcept": {"none"},
    "boolean":         {"none"},
    "string":          {"none"},
    "id":              {"none"},
}
def unitrule_coherent(valueType, unitRule):
    """valueType may be a str or a union list; coherent if unitRule is allowed by any member."""
    vts = valueType if isinstance(valueType, list) else [valueType]
    allowed = set()
    for vt in vts:
        allowed |= UNITRULE_BY_VALUETYPE.get(vt, set())
    return unitRule in allowed

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
    vt = c.get("valueType")
    ur = c.get("unitRule")
    check(vt in ALLOWED_FHIR,
          f"[C1] AC concept {cid} valueType {vt!r} missing/invalid")
    check(ur in UNIT_RULES,
          f"[C1] AC concept {cid} unitRule {ur!r} missing/invalid")
    check(unitrule_coherent(vt, ur),
          f"[C1] AC concept {cid}: unitRule {ur!r} incoherent with valueType {vt!r}")
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

# ---- G1: cross-layer value-type compatibility (transformation <-> method) -
# A transformation input measure's requiredValueType (FHIR complex/primitive)
# must be (a) allowed by the bound DC concept's result.valueType, and
# (b) reachable to the bound method input's primitive dataType via the
# fhir_value_types.json `compatiblePrimitives` bridge.
TLIB_PATH = ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v07.json"
check(TLIB_PATH.exists(), "[G1] transformation library missing")
if TLIB_PATH.exists():
    tlib = load(TLIB_PATH)
    complexTypes = fvt["complexTypes"]
    primTypes = set(fvt["primitiveTypes"])

    def compat_primitives(rvt):
        if rvt in complexTypes:
            return set(complexTypes[rvt].get("compatiblePrimitives", []))
        if rvt in primTypes:
            return {rvt}
        return set()  # unknown value type

    # method input dataTypes by method id (analyses + derivations)
    method_inputs = {}
    for f in glob.glob(str(ROOT/'lib'/'methods'/'analyses'/'*.json')) + \
             glob.glob(str(ROOT/'lib'/'methods'/'derivations'/'*.json')):
        mm = load(f)
        method_inputs[mm["conceptId"]] = {i["name"]: i.get("dataType") for i in mm.get("inputs", [])}

    # DC concept -> allowed result.valueType set
    dc_model = load(ROOT / "lib" / "concepts" / "Option_B_Clinical.json")
    dc_valuetypes = {}
    for cat in dc_model.get("categories", {}).values():
        for cid, c in cat.get("concepts", {}).items():
            vt = c.get("result", {}).get("valueType")
            dc_valuetypes[cid] = set(vt) if isinstance(vt, list) else ({vt} if vt else set())

    for t in tlib.get("transformations", []):
        tid = t["conceptId"]
        um = t.get("usesMethod")
        minputs = method_inputs.get(um)
        check(um is None or minputs is not None,
              f"[G1] {tid}: usesMethod {um!r} not found among method files")
        for m in t.get("inputDataStructure", {}).get("measures", []):
            rvt = m.get("requiredValueType")
            if rvt is None:
                continue
            slot = m.get("input")
            concept = m.get("concept")
            # (a) concept-side: requiredValueType allowed by the bound DC concept
            if concept in dc_valuetypes:
                check(rvt in dc_valuetypes[concept],
                      f"[G1] {tid} measure {slot!r}: requiredValueType {rvt!r} not in "
                      f"concept {concept!r} valueType {sorted(dc_valuetypes[concept])}")
            # (b) method-side: method input primitive reachable from requiredValueType
            if minputs and slot in minputs:
                prim = minputs[slot]
                check(prim in compat_primitives(rvt),
                      f"[G1] {tid} measure {slot!r}: method {um} input dataType {prim!r} "
                      f"not compatible with requiredValueType {rvt!r} "
                      f"(compatiblePrimitives={sorted(compat_primitives(rvt))})")

# ---- G2: cross-layer unit coherence (concept = single source of truth) -----
# Units live on the concept as (valueType, unitRule). (1) every DC + AC concept's
# pair must be coherent, fixedUnit present iff unitRule=='fixed', and any
# inheritsFrom/inputUnitRelation must be valid. (2) a transformation whose OUTPUT
# concept requires uniform input units must bind its unit-bearing input measures
# to a single concept (same unit by construction). AC concept coherence is in C1.
_dc = load(ROOT / "lib" / "concepts" / "Option_B_Clinical.json")
_shared_dims = set(_dc.get("sharedDimensions", {})) - {"note"}
_dc_results = {}
for _cat in _dc.get("categories", {}).values():
    for _cid, _c in _cat.get("concepts", {}).items():
        _dc_results[_cid] = _c.get("result", {})
_known_targets = _shared_dims | set(_dc_results)
_unitbearing = {"Quantity", "Range", "Count"}

# (1) DC concept coherence
for cid, res in _dc_results.items():
    vt = res.get("valueType")
    ur = res.get("unitRule")
    check(ur in UNIT_RULES, f"[G2] DC concept {cid}: unitRule {ur!r} missing/invalid")
    check(unitrule_coherent(vt, ur),
          f"[G2] DC concept {cid}: unitRule {ur!r} incoherent with valueType {vt!r}")
    check(("fixedUnit" in res) == (ur == "fixed"),
          f"[G2] DC concept {cid}: fixedUnit must be present iff unitRule=='fixed' (unitRule={ur!r})")
    if "inheritsFrom" in res:
        check(res["inheritsFrom"] in _known_targets,
              f"[G2] DC concept {cid}: inheritsFrom {res['inheritsFrom']!r} not a known dimension/concept")
    if "inputUnitRelation" in res:
        check(res["inputUnitRelation"] in {"uniform", "heterogeneous"},
              f"[G2] DC concept {cid}: inputUnitRelation {res['inputUnitRelation']!r} invalid")

# (2) cross-layer: uniform-output transformations bind unit-bearing inputs to one concept
if TLIB_PATH.exists():
    for t in tlib.get("transformations", []):
        tid = t["conceptId"]
        out_concepts = {m.get("concept") for m in t.get("outputDataStructure", {}).get("measures", [])}
        if not any(_dc_results.get(oc, {}).get("inputUnitRelation") == "uniform" for oc in out_concepts):
            continue
        in_concepts = {m.get("concept") for m in t.get("inputDataStructure", {}).get("measures", [])
                       if m.get("requiredValueType") in _unitbearing}
        check(len(in_concepts) <= 1,
              f"[G2] {tid}: output requires uniform input units but unit-bearing inputs "
              f"bind to different concepts {sorted(in_concepts)}")

def main():
    if failures:
        print(f"FAIL ({len(failures)} issue(s)):")
        for f in failures: print("  -", f)
        sys.exit(1)
    print("OK — all checks passed")

if __name__ == "__main__":
    main()

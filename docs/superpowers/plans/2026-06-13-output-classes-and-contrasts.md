# OutputClass Statistic-Sets + Contrast Specification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the 1.0 compositional OutputClass model (statistic sets → templates → unified AC patterns, FHIR-typed atoms) and the contrast-specification model (coefficient-matrix `contrast` dimension), then rebuild `AllMethods.json` as a generated aggregate.

**Architecture:** Three layers on a `Method ← Transformation → Concept` spine.
1. **Terminology** (owned by neither; cited by both sides): `statistics_vocabulary.json` is the SKOS-style controlled vocabulary of statistic *terms* (`estimate`, `SE`, …) — id, label, STATO coding, definition, primitive `dataType`. `statistic_sets.json` (NEW) groups those terms.
2. **Method side:** `output_class_templates.json` defines each output class as *a class of statistic terms* (composing the sets). Methods/sets/templates cite **terminology only** — never AC concepts.
3. **Concept side (AC):** `AC_Concept_Model_v017.json` statistical concepts (`Estimate`, `ConfidenceInterval`) each *reference* a terminology term and add the **FHIR datatype** (the definition of the *data*); result patterns compose those concepts + add dimensions. The **transformation** is the sole bridge (output slot → result pattern).

The pivotal rule: the method references a *term*, the AC concept also references the *same term* and overlays FHIR semantics — method and concept are never linked except through the transformation, so "method emits a statistic" is `method → terminology`, not `method → concept`. Each fact has exactly one home: term identity/STATO → terminology; FHIR datatype → concept; term groupings → `statistic_sets`; dimensions → result patterns; slot→pattern → transformation. linkML schemas govern each layer and compile to JSON Schema. A Python validator (`scripts/validate_methods_model.py`) enforces every cross-layer invariant and is the TDD test harness throughout.

**Tech Stack:** JSON data files; linkML YAML schemas compiled with `gen-json-schema` (in `.venv/bin`); `linkml-validate` for instance validation; Python 3.13 (`.venv/bin/python`) for the validator and the `AllMethods.json` builder. No JS/app changes.

**Decisions locked with the user (2026-06-13):**
- **D-layers (overrides spec D6/D7 framing):** statistic terms are a **terminology** layer cited by both method and concept; the **FHIR datatype lives only on the AC concept** (NOT on the terminology atom — that would leak a concept-level/data-definition fact into the terminology the method reads, and contradicts `acdc_method.yaml`'s "FHIR type flows from the bound concept at transformation time"). AC statistical concepts become **thin**: a `term` reference (→ terminology id) + `fhirValueType` (+ display label); they no longer re-state `definition`/`statoMapping`/`dataType` (single source = terminology). The crosswalk is **concept → terminology** (`skos:exactMatch` semantics), build-validated; the method never appears in it.
- **D-home:** terminology stays in `lib/vocabulary/` (it *is* terminology, not concepts — so it correctly lives with the vocabulary, not in `lib/concepts/`). AC's dangling `../shared/fhir_value_types.json` ref is repointed to `../vocabulary/fhir_value_types.json`.
- **D-point:** reuse generic-point sets — a set's `estimate` slot specializes to `coefficient`/`survival_prob`/`median` (§3.2.2 `→*` as written).
- **D-prop:** add `numerator`+`denominator` terms; `proportion_estimate` set produces `[numerator, denominator, proportion, pct]` (a documented expansion beyond the template's prior statistics; CI bounds optional).
- **D-basis:** `acdc_transformation` `contrastSpecification` supports BOTH bases; `coding`/`reference` required only for `model_coefficients`.

**Conventions:**
- All paths are relative to repo root `/Users/kwl/repos/Github/CDISC/analysis-concepts`.
- Run Python as `.venv/bin/python`, linkML tools as `.venv/bin/<tool>`.
- The validator is the test. "Write the failing test" = add/enable a check that fails against current data; "make it pass" = make the data change. Run with `.venv/bin/python scripts/validate_methods_model.py`.
- **Do not `git commit` on the user's behalf at the end of a task unless this plan's step says so AND the user has confirmed.** Per project convention the user handles commits. Each task below ends with a `git add` + suggested commit message; the executing agent should STAGE and present the message, and only commit if the user has authorized commits for this run. If unsure, stage and stop.

---

## File Structure

**Created:**
- `lib/vocabulary/statistic_sets.json` — the 13 reusable statistic sets (atoms FK into `statistics_vocabulary.json`).
- `model/linkML/acdc_output_classes.yaml` — linkML schema governing atoms-vocab shape, sets, templates, and the AC `resultPatterns` shape.
- `model/json_schema/acdc_output_classes.schema.json` — generated from the above.
- `scripts/validate_methods_model.py` — the cross-layer invariant validator (TDD harness).
- `scripts/build_all_methods.py` — regenerates `lib/methods/AllMethods.json` by bundling per-file methods + vocab sections.

**Modified:**
- `lib/vocabulary/statistics_vocabulary.json` — add `numerator`/`denominator` terms; reframe header as the SKOS terminology layer (owned by neither, cited by both). **No `fhirValueType`** here (terminology stays primitive). Version `0.5.0`→`0.6.0`.
- `lib/vocabulary/output_class_templates.json` — concrete templates replace flat `statistics` with `statistics_set`/`additional_statistics`/`optional_statistics`; version `0.6.0`→`0.7.0`.
- `lib/vocabulary/fhir_value_types.json` — add `Range`+`Count` to `complexTypes`; relax `layerMapping.ac_concept_statistics` (AC concepts may carry complex FHIR types).
- `lib/concepts/AC_Concept_Model_v017.json` — repoint `$vocabulary`; make shared statistical concepts **thin** (`term` → terminology id, `fhirValueType`, `unit` policy; drop duplicated `definition`/`statoMapping`/`dataType`); introduce `ConfidenceInterval` (Range, two leaves → `CI_lower`/`CI_upper`); `resultPatterns` reference shared sets + derive constituents; repair `methodOutputSlotMapping`; version `0.17`→`0.18`.
- `model/linkML/acdc_method.yaml` — remove orphan `OutputClass`/`OutputShape`/`Distribution` enums; version `0.2.0`→`0.3.0`.
- `model/json_schema/acdc_method.schema.json` — regenerated.
- `model/linkML/acdc_transformation.yaml` — add contrast variant to `OutputDimensionBinding` + `ContrastSpecification`/`ContrastMember`/`ContrastGenerator`/`ContrastCell` classes; version `0.1.0`→`0.2.0`.
- `model/json_schema/acdc_transformation.schema.json` — regenerated.
- `lib/methods/analyses/M_ANOVA.json`, `lib/methods/analyses/M_ANCOVA.json` — drop `contrasts_t` `indexed_by`.
- `lib/transformations/ACDC_Transformation_Library_v07.json` — add a worked `contrastSpecification` to the ANCOVA treatment-difference transformation.
- `lib/methods/AllMethods.json` — regenerated by the builder.

---

## Phase A — Shared statistic spine (vocabulary)

### Task A1: Validator scaffold + atom checks (failing first)

**Files:**
- Create: `scripts/validate_methods_model.py`

- [ ] **Step 1: Write the validator with the first checks (will fail)**

Create `scripts/validate_methods_model.py`:

```python
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

def main():
    if failures:
        print(f"FAIL ({len(failures)} issue(s)):")
        for f in failures: print("  -", f)
        sys.exit(1)
    print("OK — all checks passed")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `term numerator not yet defined` / `term denominator not yet defined`. (The current atoms carry no `fhirValueType`, so the A1 absence-check already passes for them.)

- [ ] **Step 3: Commit the scaffold**

```bash
git add scripts/validate_methods_model.py
# Suggested message:
# "Add methods-model invariant validator (atom checks)"
```

---

### Task A2: Add `numerator`/`denominator` terms; reframe as terminology

**Files:**
- Modify: `lib/vocabulary/statistics_vocabulary.json`

This file is the **terminology** layer. Terms keep their primitive `dataType`; the **FHIR datatype is NOT added here** — it lives on the AC concept (Task C2). Where each statistic's FHIR datatype ends up (on the concept side) is recorded in the Task C2 table; do not duplicate it here.

- [ ] **Step 1: Add the `numerator` and `denominator` terms**

Insert into the `statistics` object (placement is cosmetic; after `"pct"` is fine):

```json
    "numerator": {
      "conceptId": "numerator",
      "name": "Numerator count",
      "label": null,
      "ncitCode": null,
      "codings": [],
      "dataType": "numeric",
      "description": "Numerator count (events of interest) for a proportion"
    },
    "denominator": {
      "conceptId": "denominator",
      "name": "Denominator count",
      "label": null,
      "ncitCode": null,
      "codings": [],
      "dataType": "numeric",
      "description": "Denominator count (population at risk) for a proportion"
    },
```

- [ ] **Step 2: Reframe the file header as terminology.** Update the top-level `description` to: `"SKOS-style terminology of statistic terms (the controlled vocabulary of statistics produced by ACDC methods). Owned by neither the method nor the concept layer: methods/sets/output-class templates cite these terms, and AC statistical concepts reference them (via term) and overlay the FHIR datatype. Terms carry a primitive dataType only."`

- [ ] **Step 3: Bump version**

Change line 2 `"version": "0.5.0"` → `"version": "0.6.0"`.

- [ ] **Step 4: Verify JSON parses and re-run validator**

Run: `.venv/bin/python -c "import json; json.load(open('lib/vocabulary/statistics_vocabulary.json'))" && .venv/bin/python scripts/validate_methods_model.py`
Expected: A1/A2 checks PASS (`OK` — only A1/A2 checks exist at this point).

- [ ] **Step 5: Commit**

```bash
git add lib/vocabulary/statistics_vocabulary.json
# "Add numerator/denominator terms; reframe statistics vocab as terminology layer"
```

---

### Task A3: Create `statistic_sets.json`

**Files:**
- Create: `lib/vocabulary/statistic_sets.json`
- Modify: `scripts/validate_methods_model.py` (add set-resolution check)

- [ ] **Step 1: Add the set-resolution check (failing)**

Append to `scripts/validate_methods_model.py` after the atom checks (before `def main`):

```python
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
```

- [ ] **Step 2: Run validator to confirm it fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `statistic_sets.json does not exist`.

- [ ] **Step 3: Create `lib/vocabulary/statistic_sets.json`**

```json
{
  "version": "0.1.0",
  "$vocabulary": { "statistics": "./statistics_vocabulary.json" },
  "description": "Reusable statistic sets (Sheet 2 'Statistic set classes') — terminology-layer groupings of statistic terms. Each set bundles terms from statistics_vocabulary.json. Cited by BOTH method-side output_class_templates (statistics_set[]) and AC concept-side result patterns; owned by neither.",
  "statistic_sets": {
    "hypothesis_test_F_distribution": {
      "conceptId": "hypothesis_test_F_distribution",
      "name": "F-distribution hypothesis test", "label": "F-test", "ncitCode": null, "codings": [],
      "description": "Test statistics for an F-distributed omnibus/term test.",
      "statistics": ["F_statistic", "p_value", "df_num", "df_den"]
    },
    "hypothesis_test_t_distribution": {
      "conceptId": "hypothesis_test_t_distribution",
      "name": "t-distribution hypothesis test", "label": "t-test", "ncitCode": null, "codings": [],
      "description": "Test statistics for a t-distributed test.",
      "statistics": ["t_statistic", "p_value", "df"]
    },
    "hypothesis_test_chi_squared": {
      "conceptId": "hypothesis_test_chi_squared",
      "name": "Chi-squared hypothesis test", "label": "Chi-squared test", "ncitCode": null, "codings": [],
      "description": "Test statistics for a chi-squared test.",
      "statistics": ["chi_squared", "p_value", "df"]
    },
    "hypothesis_test_normal": {
      "conceptId": "hypothesis_test_normal",
      "name": "Normal (z) hypothesis test", "label": "z-test", "ncitCode": null, "codings": [],
      "description": "Test statistics for a normal-approximation (z) test.",
      "statistics": ["z_statistic", "p_value"]
    },
    "hypothesis_test_p_value": {
      "conceptId": "hypothesis_test_p_value",
      "name": "P-value only test", "label": "Exact test", "ncitCode": null, "codings": [],
      "description": "P-value-only result (e.g. exact tests).",
      "statistics": ["p_value"]
    },
    "ci_estimate": {
      "conceptId": "ci_estimate",
      "name": "Estimate with confidence interval", "label": "Estimate + CI", "ncitCode": null, "codings": [],
      "description": "A point estimate with its confidence interval bounds.",
      "statistics": ["estimate", "CI_lower", "CI_upper"]
    },
    "ci_estimate_normal": {
      "conceptId": "ci_estimate_normal",
      "name": "Estimate with CI and SE (normal)", "label": "Estimate + CI + SE", "ncitCode": null, "codings": [],
      "description": "Point estimate, CI bounds and standard error (normal-based inference).",
      "statistics": ["estimate", "CI_lower", "CI_upper", "SE"]
    },
    "ci_estimate_t_distribution": {
      "conceptId": "ci_estimate_t_distribution",
      "name": "Estimate with CI, SE and df (t)", "label": "Estimate + CI + SE + df", "ncitCode": null, "codings": [],
      "description": "Point estimate, CI bounds, standard error and degrees of freedom (t-based inference).",
      "statistics": ["estimate", "CI_lower", "CI_upper", "SE", "df"]
    },
    "ci_estimate_odds_ratio": {
      "conceptId": "ci_estimate_odds_ratio",
      "name": "Odds ratio with CI", "label": "OR + CI", "ncitCode": null, "codings": [],
      "description": "Odds ratio with confidence interval.",
      "statistics": ["odds_ratio", "CI_lower", "CI_upper"]
    },
    "ci_estimate_hazard_ratio": {
      "conceptId": "ci_estimate_hazard_ratio",
      "name": "Hazard ratio with CI", "label": "HR + CI", "ncitCode": null, "codings": [],
      "description": "Hazard ratio with confidence interval.",
      "statistics": ["hazard_ratio", "CI_lower", "CI_upper"]
    },
    "point_estimate_SE": {
      "conceptId": "point_estimate_SE",
      "name": "Estimate with SE", "label": "Estimate + SE", "ncitCode": null, "codings": [],
      "description": "A point estimate with its standard error.",
      "statistics": ["estimate", "SE"]
    },
    "proportion_estimate": {
      "conceptId": "proportion_estimate",
      "name": "Proportion estimate", "label": "Proportion", "ncitCode": null, "codings": [],
      "description": "A proportion expressed as numerator/denominator with proportion and percentage.",
      "statistics": ["numerator", "denominator", "proportion", "pct"]
    },
    "computed_value": {
      "conceptId": "computed_value",
      "name": "Computed value", "label": "Computed value", "ncitCode": null, "codings": [],
      "description": "A single computed/derived scalar value.",
      "statistics": ["value"]
    }
  }
}
```

- [ ] **Step 4: Run validator — A3 checks pass**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/vocabulary/statistic_sets.json scripts/validate_methods_model.py
# "Add statistic_sets.json (13 reusable statistic sets) + set-resolution check"
```

---

### Task A4: `fhir_value_types.json` — add `Range`/`Count`, relax `layerMapping`

**Files:**
- Modify: `lib/vocabulary/fhir_value_types.json`
- Modify: `scripts/validate_methods_model.py` (add fhir-types check)

- [ ] **Step 1: Add the fhir-types check (failing)**

Append after the set checks:

```python
# ---- FHIR value types -----------------------------------------------------
fvt = load(VOCAB / "fhir_value_types.json")
for ct in ("Range", "Count"):
    check(ct in fvt["complexTypes"], f"[A4] complexType {ct} missing from fhir_value_types.json")
check(fvt["layerMapping"]["ac_concept_statistics"] != "primitiveTypes",
      "[A4] layerMapping.ac_concept_statistics still restricted to primitiveTypes")
```

- [ ] **Step 2: Run validator to confirm it fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `Range`/`Count` missing; `ac_concept_statistics` still `primitiveTypes`.

- [ ] **Step 3: Edit `fhir_value_types.json`**

In `complexTypes`, add after `Quantity`:

```json
    "Range":           { "fhirDef": "Set of values bounded by low and high", "usage": "Confidence intervals (low/high are SimpleQuantity)", "compatiblePrimitives": ["decimal", "integer"] },
    "Count":           { "fhirDef": "Non-negative integer count", "usage": "Subject/event counts (n at risk, events, censored)", "compatiblePrimitives": ["integer"] },
```

Change the `layerMapping` entry:

```json
    "ac_concept_statistics": "primitiveTypes",
```
to
```json
    "ac_concept_statistics": "primitiveOrComplexTypes",
```

- [ ] **Step 4: Run validator**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add lib/vocabulary/fhir_value_types.json scripts/validate_methods_model.py
# "Add Range/Count complex types; relax ac_concept_statistics layer mapping"
```

---

## Phase B — `output_class_templates.json` rewrite

### Task B0: Freeze the pre-rewrite statistics baseline

**Files:**
- Create: `scripts/_template_statistics_baseline.json`

- [ ] **Step 1: Snapshot current concrete-template statistics**

Run:

```bash
.venv/bin/python - <<'PY'
import json, pathlib
t = json.load(open('lib/vocabulary/output_class_templates.json'))['output_class_templates']
base = {k: {"statistics": sorted(v["statistics"]),
            "optional_statistics": sorted(v.get("optional_statistics", []))}
        for k, v in t.items() if not v.get("abstract") and "statistics" in v}
pathlib.Path('scripts/_template_statistics_baseline.json').write_text(json.dumps(base, indent=2))
print("wrote baseline for", len(base), "concrete templates")
PY
```

Expected: `wrote baseline for 32 concrete templates`.

- [ ] **Step 2: Commit the baseline**

```bash
git add scripts/_template_statistics_baseline.json
# "Freeze pre-rewrite output-class statistics baseline (invariant fixture)"
```

---

### Task B1: Invariant check in the validator (failing)

**Files:**
- Modify: `scripts/validate_methods_model.py`

- [ ] **Step 1: Add the §3.2.1 invariant check**

Append after the FHIR-types check. This encodes D-point (estimate specialization) and D-prop (intentional adds):

```python
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
```

- [ ] **Step 2: Run validator to confirm it fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — every concrete template "still has flat statistics[]".

- [ ] **Step 3: Commit the check**

```bash
git add scripts/validate_methods_model.py
# "Add §3.2.1 output-class invariant check (set composition == baseline)"
```

---

### Task B2: Rewrite concrete templates to set composition

**Files:**
- Modify: `lib/vocabulary/output_class_templates.json`

For each concrete template, **delete** its `"statistics": [...]` array and **add** `"statistics_set"`, `"additional_statistics"`, and (where the baseline had them, or per D-prop) `"optional_statistics"`. Abstract families (`abstract: true`) are unchanged. Keep `conceptId`/`name`/`label`/`ncitCode`/`codings`/`description`/`broader`.

The exact mapping (validated against the baseline — see the validation run in Task 0 of this session):

| Template | `statistics_set` | `additional_statistics` | `optional_statistics` |
|----------|------------------|--------------------------|------------------------|
| `fit_statistics_basic` | `[]` | `["AIC","BIC","minus2LogL"]` | `[]` |
| `fit_statistics_linear` | `[]` | `["AIC","BIC","minus2LogL","R_squared"]` | `[]` |
| `fit_statistics_concordance` | `[]` | `["AIC","BIC","minus2LogL","concordance"]` | `[]` |
| `type3_tests_f` | `["hypothesis_test_F_distribution"]` | `["SS","MS"]` | `[]` |
| `type3_tests_mixed` | `["hypothesis_test_F_distribution"]` | `[]` | `[]` |
| `type3_tests_chi_squared` | `["hypothesis_test_chi_squared"]` | `[]` | `[]` |
| `chi_squared_test_result` | `["hypothesis_test_chi_squared"]` | `[]` | `[]` |
| `t_test_result` | `["hypothesis_test_t_distribution"]` | `[]` | `[]` |
| `exact_test_result` | `["hypothesis_test_p_value"]` | `[]` | `[]` |
| `homogeneity_test` | `["hypothesis_test_chi_squared"]` | `[]` | `[]` |
| `parameter_estimates_linear` | `["ci_estimate_t_distribution","hypothesis_test_t_distribution"]` | `["coefficient"]` | `[]` |
| `parameter_estimates_glm` | `["point_estimate_SE","hypothesis_test_normal","ci_estimate_odds_ratio"]` | `["coefficient"]` | `[]` |
| `parameter_estimates_cox` | `["point_estimate_SE","hypothesis_test_normal","ci_estimate_hazard_ratio"]` | `["coefficient"]` | `[]` |
| `covariance_parameters` | `["point_estimate_SE"]` | `[]` | `[]` |
| `contrasts_t` | `["ci_estimate_t_distribution","hypothesis_test_t_distribution"]` | `["p_value_adjusted"]` | `["p_value_adjusted"]` |
| `contrasts_z` | `["ci_estimate_normal","hypothesis_test_normal"]` | `["p_value_adjusted"]` | `["p_value_adjusted"]` |
| `odds_ratio_measures` | `["ci_estimate_odds_ratio"]` | `[]` | `[]` |
| `ls_means` | `["ci_estimate_t_distribution"]` | `[]` | `[]` |
| `point_estimate` | `["ci_estimate_normal"]` | `[]` | `[]` |
| `odds_ratio_estimates` | `["ci_estimate_odds_ratio"]` | `[]` | `[]` |
| `hazard_ratio_estimates` | `["ci_estimate_hazard_ratio"]` | `[]` | `[]` |
| `multivariate_tests` | `["hypothesis_test_F_distribution"]` | `["estimate"]` | `[]` |
| `global_tests` | `["hypothesis_test_chi_squared"]` | `[]` | `[]` |
| `survival_table` | `["ci_estimate_normal"]` | `["n_risk","n_event","n_censored"]` | `[]` |
| `median_survival` | `["ci_estimate"]` | `[]` | `[]` |
| `event_summary` | `[]` | `["n_risk","n_event","n_censored"]` | `[]` |
| `landmark_estimates` | `["ci_estimate_normal"]` | `[]` | `[]` |
| `proportion_estimate` | `["proportion_estimate"]` | `[]` | `["CI_lower","CI_upper"]` |
| `frequency_table` | `[]` | `["frequency","n"]` | `[]` |
| `cumulative_frequency_table` | `[]` | `["cumulative_n","cumulative_pct"]` | `[]` |
| `quartile_estimates` | `[]` | `["Q1","Q3"]` | `[]` |
| `computed_value` | `["computed_value"]` | `[]` | `[]` |

Notes baked into the table:
- **D-point specialization templates** (`parameter_estimates_*`, `survival_table`, `median_survival`, `landmark_estimates`): the set's generic `estimate` slot stands for the domain atom (`coefficient`/`survival_prob`/`median`). The validator's `ESTIMATE_SPECIALIZATION` map encodes this. `parameter_estimates_*` additionally keep `coefficient` in `additional_statistics` — the set supplies the *estimate-as-coefficient* and `coefficient` is the labelled identity; the invariant absorbs the duplicate. (If during execution you prefer to drop the redundant `additional` `coefficient`, the invariant still passes — leave it in for parity with §3.2.2.)
- **`contrasts_t`/`contrasts_z`**: `p_value_adjusted` appears in both `additional_statistics` and `optional_statistics` (it is produced, but optionally). This matches the baseline's `optional_statistics`.
- **`proportion_estimate`** (D-prop): set now supplies `numerator,denominator,proportion,pct`; CI bounds stay optional.

Example rewritten entry (`ls_means`), replacing lines 408–423:

```json
    "ls_means": {
      "conceptId": "ls_means",
      "name": "Least-squares means",
      "label": "Least-squares means",
      "ncitCode": null,
      "codings": [],
      "description": "Least-squares means (adjusted marginal means) per factor level or level combination.",
      "broader": "marginal_estimates",
      "statistics_set": ["ci_estimate_t_distribution"],
      "additional_statistics": [],
      "optional_statistics": []
    },
```

Example with specialization + optional (`contrasts_t`), replacing lines 331–352:

```json
    "contrasts_t": {
      "conceptId": "contrasts_t",
      "name": "Contrasts from linear models with t-based inference",
      "label": "T-based contrasts",
      "ncitCode": null,
      "codings": [],
      "description": "Contrasts from linear models with t-based inference.",
      "broader": "contrasts",
      "statistics_set": ["ci_estimate_t_distribution", "hypothesis_test_t_distribution"],
      "additional_statistics": ["p_value_adjusted"],
      "optional_statistics": ["p_value_adjusted"]
    },
```

- [ ] **Step 1: Apply all 32 rewrites** per the table above.

- [ ] **Step 2: Bump version**

Line 2 `"version": "0.6.0"` → `"version": "0.7.0"`.

- [ ] **Step 3: Update the `_authoring_notes`** to describe set composition (replace the `method_side_references`/`templates_are_code_lists` prose's "list of statistics" wording with "composes statistic_sets + additional_statistics; the produced statistics are the derived union"). Keep `_family_structure` as-is.

- [ ] **Step 4: Run validator**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK` — the §3.2.1 invariant passes for all 32 templates.

- [ ] **Step 5: Commit**

```bash
git add lib/vocabulary/output_class_templates.json
# "Rewrite output class templates to compose statistic sets (§3.2)"
```

---

## Phase C — AC concept-model unification

### Task C1: Repoint `$vocabulary` + add crosswalk/types check (failing)

**Files:**
- Modify: `lib/concepts/AC_Concept_Model_v017.json`
- Modify: `scripts/validate_methods_model.py`

- [ ] **Step 1: Add the AC crosswalk check (failing)**

Append to the validator:

```python
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
#     resolving to real terms) + carries a valid fhirValueType, and does NOT
#     re-state terminology-owned facts (single source).
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

for pid, p in patterns.items():
    if pid == "note":
        continue
    refsets = p.get("statistics_set", [])
    for sid in refsets:
        check(sid in sets, f"[C2] pattern {pid} references unknown set {sid}")
    required_atoms = set()
    for sid in refsets:
        required_atoms |= set(sets.get(sid, {}).get("statistics", []))
    required_atoms |= set(p.get("additional_statistics", []))
    covered = set()
    for cid in p.get("constituents", []):
        check(cid in ac_concepts, f"[C2] pattern {pid} constituent {cid} not a known AC concept")
        covered |= COVER.get(cid, set())
    # estimate-specialization also applies on the AC side for the same patterns
    spec = ESTIMATE_SPECIALIZATION.get(_PATTERN_TO_TEMPLATE.get(pid))
    if spec and "estimate" in required_atoms:
        required_atoms = (required_atoms - {"estimate"}) | {spec}
    opt = set(p.get("optional_statistics", []))
    check(covered == (required_atoms | opt) or covered == required_atoms,
          f"[C2] pattern {pid}: constituent leaves {sorted(covered)} != set atoms {sorted(required_atoms)}")

# C3: methodOutputSlotMapping resolves to real patterns
for m, slots in ac["methodOutputSlotMapping"].items():
    if m == "note":
        continue
    for slot, pat in slots.items():
        check(pat in patterns, f"[C3] methodOutputSlotMapping {m}.{slot} -> unknown pattern {pat}")
```

Also add, near the top of the file (after `stats = ...`), the pattern→template map used for specialization:

```python
_PATTERN_TO_TEMPLATE = {
    "ParameterEstimates": "parameter_estimates_linear",
    "SurvivalTable": "survival_table",
    "MedianSurvival": "median_survival",
}
```

- [ ] **Step 2: Run validator to confirm it fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — AC concepts have no `term`/`leaves`, still re-state `definition`/`statoMapping`/`dataType`, and lack `fhirValueType`/`unit`; patterns missing `statistics_set`; mapping pointing at `ComputedValue`.

- [ ] **Step 3: Repoint `$vocabulary`**

In `AC_Concept_Model_v017.json` replace:

```json
  "$vocabulary": {
    "valueTypes": "../shared/fhir_value_types.json"
  },
```
with
```json
  "$vocabulary": {
    "valueTypes": "../vocabulary/fhir_value_types.json",
    "statistics": "../vocabulary/statistics_vocabulary.json",
    "statisticSets": "../vocabulary/statistic_sets.json"
  },
```

- [ ] **Step 4: Bump version + description**

`"version": "0.17"` → `"version": "0.18"`. Append to `description`: `" — v0.18 makes statistical concepts thin references into the statistics terminology (term/leaves) overlaid with FHIR valueTypes + unit policies (incl. ConfidenceInterval as Range), references shared statistic_sets in resultPatterns, and repairs methodOutputSlotMapping."`

- [ ] **Step 5: Commit (partial — checks still red until C2/C3)**

```bash
git add lib/concepts/AC_Concept_Model_v017.json scripts/validate_methods_model.py
# "AC model: repoint $vocabulary, bump to 0.18; add crosswalk validation checks"
```

---

### Task C2: Make AC statistical concepts thin (`term` + `fhirValueType`); add `ConfidenceInterval`

**Files:**
- Modify: `lib/concepts/AC_Concept_Model_v017.json`

Each concept becomes a thin reference: keep `label`/`shortLabel` (display) and `code` (the concept's own NCI identity); add `term` (→ the snake_case terminology id), `fhirValueType`, and `unit` (the unit *policy*, matching the Option_B `result.unit` convention — a symbolic policy, not a concrete UCUM code; the concrete unit is bound at transformation time); **delete** `definition`, `statoMapping`, and `dataType` (these are terminology-owned — single source, enforced by the C1 check). `term` is `skos:exactMatch` semantics: the concept *represents* the term, it is not identical to it.

The `unit` vocabulary (Option_B's): `inherited` (carries the analyte's unit), `dimensionless` (ratios/probabilities/criteria), `none` (counts), `fixed: %`, and the disjunctive `inherited or dimensionless` / `inherited or specified` where the unit depends on the model/context. Note the consistency with `fhirValueType`: `Quantity` concepts carry a real unit (`inherited`/`fixed: %`/disjunctive), `decimal`/`Count` concepts are `dimensionless`/`none`.

| AC concept | `term` | `fhirValueType` | `unit` |
|------------|--------|------------------|--------|
| `Estimate` | `"estimate"` | `Quantity` | `inherited` |
| `SE` | `"SE"` | `Quantity` | `inherited` |
| `DF` | `"df"` | `decimal` | `dimensionless` |
| `PValue` | `"p_value"` | `decimal` | `dimensionless` |
| `TStatistic` | `"t_statistic"` | `decimal` | `dimensionless` |
| `FStatistic` | `"F_statistic"` | `decimal` | `dimensionless` |
| `ChiSquared` | `"chi_squared"` | `decimal` | `dimensionless` |
| `Coefficient` | `"coefficient"` | `Quantity` | `inherited or dimensionless` |
| `HazardRatio` | `"hazard_ratio"` | `decimal` | `dimensionless` |
| `OddsRatio` | `"odds_ratio"` | `decimal` | `dimensionless` |
| `SurvivalProb` | `"survival_prob"` | `decimal` | `dimensionless` |
| `Median` | `"median"` | `Quantity` | `inherited` |
| `Mean` | `"mean"` | `Quantity` | `inherited` |
| `NRisk` | `"n_risk"` | `Count` | `none` |
| `NEvent` | `"n_event"` | `Count` | `none` |
| `NCensored` | `"n_censored"` | `Count` | `none` |
| `AIC` | `"AIC"` | `decimal` | `dimensionless` |
| `BIC` | `"BIC"` | `decimal` | `dimensionless` |
| `Minus2LogL` | `"minus2LogL"` | `decimal` | `dimensionless` |
| `DF_Num` | `"df_num"` | `decimal` | `dimensionless` |
| `DF_Den` | `"df_den"` | `decimal` | `dimensionless` |
| `Value` | `"value"` | `Quantity` | `inherited or specified` |

(`Coefficient` is typed `Quantity` rather than `decimal` so its `inherited` branch — linear-model coefficients carry analyte units — is type-valid; the GLM/Cox log-scale branch is then a `Quantity` with a unity/dimensionless unit. This is the one type bumped from the earlier decimal assignment.)

- [ ] **Step 1: Rewrite each concept above to the thin form.** Example (`Estimate`) — note `definition`/`statoMapping`/`dataType` are gone, `term`/`fhirValueType`/`unit` added:

```json
      "Estimate": {
        "label": "Point estimate",
        "shortLabel": "est",
        "term": "estimate",
        "fhirValueType": "Quantity",
        "unit": "inherited",
        "code": { "system": "NCI", "value": null }
      },
```

- [ ] **Step 2: Replace `CI_Lower` and `CI_Upper` with one `ConfidenceInterval` (Range).**

Delete the `CI_Lower` and `CI_Upper` concept entries. Add a multi-leaf concept (no single `term`; the two leaves map to the two terminology bound-terms):

```json
      "ConfidenceInterval": {
        "label": "Confidence interval",
        "shortLabel": "CI",
        "fhirValueType": "Range",
        "unit": "inherited",
        "leaves": [
          { "fhirPath": "low.value",  "term": "CI_lower" },
          { "fhirPath": "high.value", "term": "CI_upper" }
        ],
        "code": { "system": "NCI", "value": null }
      },
```

Each leaf is a self-describing object: `fhirPath` is the FHIR R5 `Range` element path; `term` is the explicit terminology FK (same key single-leaf concepts use). The validator's `concept_terms` reads each `leaf["term"]` — so `ConfidenceInterval` covers `CI_lower`+`CI_upper`. The single `unit: "inherited"` applies to both bounds — realising spec §4.1's shared unit (the CI carries the same analyte unit as `Estimate`).

- [ ] **Step 3: Run validator (C1 should pass; C2/C3 still red until C3 task).**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: the `[C1]` failures clear. `[C2]`/`[C3]` remain until Task C3.

- [ ] **Step 4: Commit**

```bash
git add lib/concepts/AC_Concept_Model_v017.json
# "AC model: thin statistical concepts (term + FHIR type); CI becomes one Range concept"
```

---

### Task C3: `resultPatterns` reference sets; repair `methodOutputSlotMapping`

**Files:**
- Modify: `lib/concepts/AC_Concept_Model_v017.json`

For each result pattern, add `statistics_set` (the same snake_case set ids the matching template uses) and (where needed) `additional_statistics`/`optional_statistics`, and rewrite `constituents` so the constituents' FHIR leaves cover exactly the union of the referenced sets' atoms (with `ConfidenceInterval` covering `CI_lower`+`CI_upper`). Keep each pattern's `dimensions` and `code`.

Pattern mapping (constituents use PascalCase concepts; `ConfidenceInterval` replaces the `CI_Lower`,`CI_Upper` pair):

| Pattern | `statistics_set` | `additional_statistics` | `constituents` | `dimensions` (unchanged) |
|---------|------------------|--------------------------|----------------|---------------------------|
| `LSMeans` | `["ci_estimate_t_distribution"]` | `[]` | `["Estimate","SE","ConfidenceInterval","DF"]` | `["factor","level"]` |
| `Contrasts` | `["ci_estimate_t_distribution","hypothesis_test_t_distribution"]` | `["p_value_adjusted"]` (opt) | `["Estimate","SE","ConfidenceInterval","DF","TStatistic","PValue"]` | `["contrast","at_level"]` |
| `Type3Tests` | `["hypothesis_test_F_distribution"]` | `[]` | `["FStatistic","PValue","DF_Num","DF_Den"]` | `["term"]` |
| `ParameterEstimates` | `["ci_estimate_t_distribution","hypothesis_test_t_distribution"]` | `["Coefficient"]` | `["Coefficient","SE","ConfidenceInterval","DF","TStatistic","PValue"]` | `["term","level"]` |
| `FitStatistics` | `[]` | `["AIC","BIC","Minus2LogL"]` | `["AIC","BIC","Minus2LogL"]` | `[]` |
| `CovarianceParameters` | `["point_estimate_SE"]` | `[]` | `["Estimate","SE"]` | `["repeated_factor","cov_param"]` |
| `TestResult` | `["hypothesis_test_chi_squared"]` | `[]` | `["ChiSquared","PValue","DF"]` | `[]` |
| `SurvivalTable` | `["ci_estimate_normal"]` | `["NRisk","NEvent","NCensored"]` | `["NRisk","NEvent","NCensored","SurvivalProb","SE","ConfidenceInterval"]` | `["group","time"]` |
| `MedianSurvival` | `["ci_estimate"]` | `[]` | `["Median","ConfidenceInterval"]` | `["group"]` |
| `EventSummary` | `[]` | `["NRisk","NEvent","NCensored"]` | `["NRisk","NEvent","NCensored"]` | `["group"]` |
| `HazardRatioEstimates` | `["ci_estimate_hazard_ratio"]` | `[]` | `["HazardRatio","ConfidenceInterval"]` | `["term","level"]` |
| `OddsRatioEstimates` | `["ci_estimate_odds_ratio"]` | `[]` | `["OddsRatio","ConfidenceInterval"]` | `["term","level"]` |

`additional_statistics` on patterns use the **AC concept ids** (PascalCase), since they name AC constituents. The validator's `COVER`/`required_atoms` comparison resolves AC `additional_statistics` to atoms via `COVER` — so in the validator, change the `required_atoms |= set(p.get("additional_statistics", []))` line to resolve through `COVER`:

```python
    for cid in p.get("additional_statistics", []):
        required_atoms |= COVER.get(cid, {cid})
```

(Apply this validator tweak as Step 0 of this task; it makes pattern `additional_statistics` symmetric with `constituents`.)

Example rewritten pattern (`LSMeans`):

```json
    "LSMeans": {
      "definition": "Least-squares means (adjusted marginal means) per factor level or level combination",
      "statistics_set": ["ci_estimate_t_distribution"],
      "additional_statistics": [],
      "constituents": ["Estimate", "SE", "ConfidenceInterval", "DF"],
      "dimensions": ["factor", "level"],
      "code": { "system": "NCI", "value": null }
    },
```

- [ ] **Step 0: Apply the validator tweak** to resolve pattern `additional_statistics` via `COVER` (above).
- [ ] **Step 1: Rewrite all 12 patterns** per the table.
- [ ] **Step 2: Repair `methodOutputSlotMapping`** — use real method output `name`s (verified from the method files) and real patterns; drop the dangling `M.Quartile → ComputedValue`:

```json
  "methodOutputSlotMapping": {
    "note": "Method output slots (by output name) map to result patterns. The method defines slots using the shared vocabulary; the Transformation maps slots to patterns. Neither references the other directly.",
    "M.MMRM": {
      "ls_means": "LSMeans",
      "contrasts_t": "Contrasts",
      "type3_tests_mixed": "Type3Tests",
      "parameter_estimates_linear": "ParameterEstimates",
      "fit_statistics_basic": "FitStatistics",
      "covariance_parameters": "CovarianceParameters"
    },
    "M.ANCOVA": {
      "ls_means": "LSMeans",
      "contrasts_t": "Contrasts",
      "type3_tests_f": "Type3Tests",
      "parameter_estimates_linear": "ParameterEstimates",
      "fit_statistics_linear": "FitStatistics"
    },
    "M.LogRankTest": {
      "chi_squared_test_result": "TestResult"
    },
    "M.CoxPH": {
      "type3_tests_chi_squared": "Type3Tests",
      "parameter_estimates_cox": "ParameterEstimates",
      "hazard_ratio_estimates": "HazardRatioEstimates",
      "fit_statistics_concordance": "FitStatistics"
    },
    "M.KaplanMeier": {
      "survival_table": "SurvivalTable",
      "median_survival": "MedianSurvival",
      "event_summary": "EventSummary"
    }
  }
```

- [ ] **Step 3: Run validator**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK` — C2 and C3 pass.

- [ ] **Step 4: Commit**

```bash
git add lib/concepts/AC_Concept_Model_v017.json scripts/validate_methods_model.py
# "AC model: result patterns reference shared sets; repair methodOutputSlotMapping"
```

---

## Phase D — linkML schemas

### Task D1: `acdc_method.yaml` enum cleanup + regenerate

**Files:**
- Modify: `model/linkML/acdc_method.yaml`
- Modify: `model/json_schema/acdc_method.schema.json` (regenerated)

- [ ] **Step 1: Remove the three orphan enums.** Delete the `OutputClass:` (lines ~143–167), `OutputShape:` (~169–177), and `Distribution:` (~179–187) enum blocks and the descriptive comment block at ~137–141. Replace with a single comment:

```yaml
  # Output-class vocabulary now lives in lib/vocabulary/output_class_templates.json
  # and is governed by model/linkML/acdc_output_classes.yaml. The former
  # OutputClass/OutputShape/Distribution enums (the abandoned three-axis model)
  # were removed 2026-06-13; methods reference an output_type identifier only.
```

- [ ] **Step 2: Bump version.** Line 34 `version: 0.2.0` → `version: 0.3.0`.

- [ ] **Step 3: Regenerate the JSON schema**

Run:
```bash
.venv/bin/gen-json-schema model/linkML/acdc_method.yaml > model/json_schema/acdc_method.schema.json
```
Expected: exits 0, file rewritten.

- [ ] **Step 4: Validate all method files still conform**

Run:
```bash
.venv/bin/python - <<'PY'
import json, glob, subprocess, sys
bad=[]
for f in glob.glob('lib/methods/analyses/*.json')+glob.glob('lib/methods/derivations/*.json'):
    r=subprocess.run(['.venv/bin/linkml-validate','-s','model/linkML/acdc_method.yaml','-C','Method',f],
                     capture_output=True,text=True)
    if r.returncode!=0: bad.append((f,r.stdout+r.stderr))
print("validated", "OK" if not bad else f"{len(bad)} FAILED")
for f,o in bad[:5]: print(f, o[:300])
sys.exit(1 if bad else 0)
PY
```
Expected: `validated OK`. (If `linkml-validate` flags pre-existing unrelated issues, note them but the enum removal itself must not introduce new failures.)

- [ ] **Step 5: Commit**

```bash
git add model/linkML/acdc_method.yaml model/json_schema/acdc_method.schema.json
# "acdc_method.yaml: remove orphan output-axis enums; bump to 0.3.0; regen schema"
```

---

### Task D2: New `acdc_output_classes.yaml` + generate schema

**Files:**
- Create: `model/linkML/acdc_output_classes.yaml`
- Create: `model/json_schema/acdc_output_classes.schema.json`

- [ ] **Step 1: Create `model/linkML/acdc_output_classes.yaml`**

```yaml
id: https://cdisc.org/acdc/output_classes
name: acdc_output_classes
title: ACDC Output Class Vocabulary Schema
description: >-
  Governs the statistic terminology, the statistic sets, the output class
  templates (set composition), the thin AC statistical-concept shape (term +
  fhirValueType), and the AC result-pattern shape. Companion to acdc_method.yaml.
  See docs/superpowers/specs/2026-06-11-output-class-statistic-sets-design.md.
version: 0.1.0
prefixes:
  linkml: https://w3id.org/linkml/
  acdc: https://cdisc.org/acdc/
default_prefix: acdc
default_range: string
imports:
  - linkml:types

classes:

  StatisticTerm:
    description: >-
      A statistic in the terminology layer (statistics_vocabulary.json). Carries
      a primitive dataType ONLY — the FHIR datatype is a concept-side fact and
      lives on ACStatisticalConcept, not here (D-layers).
    attributes:
      conceptId: { identifier: true }
      name: {}
      label: {}
      ncitCode: {}
      codings: { multivalued: true, inlined_as_list: true, range: Coding }
      dataType: { required: true, description: Primitive type for formula/method typing. }
      description: {}

  Coding:
    attributes:
      system: {}
      code: {}
      display: {}

  StatisticSet:
    description: A named bundle of statistic terms (FKs into the terminology).
    attributes:
      conceptId: { identifier: true }
      name: {}
      label: {}
      ncitCode: {}
      codings: { multivalued: true, inlined_as_list: true, range: Coding }
      description: {}
      statistics:
        multivalued: true
        required: true
        description: FK list into StatisticTerm.conceptId.

  ACStatisticalConcept:
    description: >-
      Thin AC concept-side node: references a terminology term (single-leaf via
      `term`, or multi-leaf via `leaves`) and overlays the FHIR datatype. Does
      NOT re-state terminology facts (definition/statoMapping/dataType).
    attributes:
      label: {}
      shortLabel: {}
      term: { description: FK to StatisticTerm.conceptId (single-leaf concepts). }
      leaves:
        description: "Multi-leaf concepts (e.g. Range): one entry per FHIR leaf, each naming the terminology term that fills it."
        multivalued: true
        inlined_as_list: true
        range: ConceptLeaf
      fhirValueType: { required: true, description: FHIR value type (primitive or complex). }
      unit:
        required: true
        description: >-
          Symbolic unit policy (Option_B convention), not a concrete UCUM code:
          inherited | dimensionless | none | "fixed: %" | "inherited or dimensionless"
          | "inherited or specified". The concrete unit is bound at transformation time.
      code: { inlined: true, description: The concept's own code (e.g. NCI). }
    rules:
      - description: exactly one of term / leaves is present.
        postconditions:
          exactly_one_of:
            - slot_conditions: { term: { value_presence: PRESENT } }
            - slot_conditions: { leaves: { value_presence: PRESENT } }

  ConceptLeaf:
    description: One FHIR leaf of a multi-leaf concept, mapped to the terminology term that populates it.
    attributes:
      fhirPath: { required: true, description: "FHIR element path within the datatype (e.g. low.value)." }
      term: { required: true, description: FK to StatisticTerm.conceptId. }

  StatisticSetLibrary:
    tree_root: true
    attributes:
      version: {}
      description: {}
      statistic_sets:
        multivalued: true
        inlined: true
        range: StatisticSet

  OutputClassTemplate:
    description: >-
      An output class. Abstract templates carry neither statistics_set nor
      additional_statistics. Concrete templates carry at least one of them; their
      produced statistics are the derived union of the referenced sets' atoms plus
      additional_statistics.
    attributes:
      conceptId: { identifier: true }
      name: {}
      label: {}
      ncitCode: {}
      codings: { multivalued: true, inlined_as_list: true, range: Coding }
      description: {}
      abstract: { range: boolean }
      broader: { description: SKOS parent (FK to another template). }
      statistics_set: { multivalued: true, description: FK list into StatisticSet.conceptId. }
      additional_statistics: { multivalued: true, description: Extra atoms not supplied by any set. }
      optional_statistics: { multivalued: true, description: Members that may be absent at runtime. }
    rules:
      - description: A concrete template (abstract not true) has at least one of statistics_set/additional_statistics.
        preconditions:
          slot_conditions:
            abstract: { value_presence: ABSENT }
        postconditions:
          any_of:
            - slot_conditions: { statistics_set: { value_presence: PRESENT } }
            - slot_conditions: { additional_statistics: { value_presence: PRESENT } }

  OutputClassTemplateLibrary:
    tree_root: true
    attributes:
      version: {}
      description: {}
      output_class_templates:
        multivalued: true
        inlined: true
        range: OutputClassTemplate

  ACResultPattern:
    description: >-
      AC concept-side molecule. References shared statistic_sets; constituents are
      ACStatisticalConcepts whose terms cover the sets' terms. Adds dimensions (the
      concept-side row structure that templates omit).
    attributes:
      definition: {}
      statistics_set: { multivalued: true, description: FK list into StatisticSet.conceptId. }
      additional_statistics: { multivalued: true, description: AC concept ids not covered by the sets. }
      optional_statistics: { multivalued: true }
      constituents: { multivalued: true, description: ACStatisticalConcept ids whose terms cover the sets' terms. }
      dimensions: { multivalued: true }
```

- [ ] **Step 2: Generate the JSON schema**

Run:
```bash
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
```
Expected: exits 0.

- [ ] **Step 3: Lint the schema**

Run: `.venv/bin/linkml-lint model/linkML/acdc_output_classes.yaml`
Expected: no errors (warnings acceptable).

- [ ] **Step 4: Commit**

```bash
git add model/linkML/acdc_output_classes.yaml model/json_schema/acdc_output_classes.schema.json
# "Add acdc_output_classes.yaml linkML schema + generated JSON schema"
```

---

### Task D3: `acdc_transformation.yaml` — contrast dimension binding

**Files:**
- Modify: `model/linkML/acdc_transformation.yaml`
- Modify: `model/json_schema/acdc_transformation.schema.json` (regenerated)

- [ ] **Step 1: Extend `OutputDimensionBinding` and add contrast classes.**

Replace the `OutputDimensionBinding` block (lines ~293–305) with:

```yaml
  OutputDimensionBinding:
    description: >-
      §6.3 note 3 — a dimension on the output cube. input is rejected here. May
      instead be a derived contrast dimension carrying a contrastSpecification
      (contrast spec §4.3); in that case it is named "contrast" and bound to the
      Contrasts concept.
    is_a: DimensionBinding
    slot_usage:
      input:
        ifabsent: "null"
    attributes:
      name:
        description: Dimension name; "contrast" for a derived contrast dimension.
        range: string
      contrastSpecification:
        description: The coefficient-matrix recipe defining the contrast dimension's members (contrast spec §3–§4).
        range: ContrastSpecification
        inlined: true
    rules:
      - description: input is rejected on output-side dimension bindings (§6.3 note 3).
        postconditions:
          slot_conditions:
            input:
              required: false
              equals_string: ""
      - description: >-
          A contrast dimension (contrastSpecification present) is derived, so it
          relaxes the concept-XOR-conceptCategory rule and is bound to Contrasts.
        preconditions:
          slot_conditions:
            contrastSpecification: { value_presence: PRESENT }
        postconditions:
          slot_conditions:
            concept: { equals_string: "Contrasts" }

  ContrastSpecification:
    description: >-
      The coefficient matrix L defining a contrast dimension's members. `over` is
      expressed in concept terms (e.g. Treatment). estimated_means is the portable
      default; model_coefficients additionally pins coding (+reference) per §4.3.
    attributes:
      over:
        description: The factor/dimension contrasted, in concept terms (e.g. "Treatment").
        range: string
        required: true
      basis:
        description: Column space of L.
        range: ContrastBasis
        required: true
      at:
        description: Optional second factor; single-factor members are replicated across its levels (§4.2).
        range: string
      coding:
        description: Required when basis = model_coefficients — the model parameterization.
        range: ContrastCoding
      reference:
        description: Required when basis = model_coefficients and coding = reference — the reference level.
        range: string
      members:
        description: Either a generator (template) or a resolved list of member rows.
        range: ContrastMembers
        inlined: true
        required: true
    rules:
      - description: model_coefficients requires coding (and reference when coding = reference).
        preconditions:
          slot_conditions:
            basis: { equals_string: "model_coefficients" }
        postconditions:
          slot_conditions:
            coding: { required: true }

  ContrastMembers:
    description: A contrast member-set — exactly one of generator (unresolved) or memberList (resolved).
    attributes:
      generator:
        range: ContrastGenerator
        inlined: true
      memberList:
        range: ContrastMember
        multivalued: true
        inlined_as_list: true
    rules:
      - description: exactly one of generator / memberList is present.
        postconditions:
          exactly_one_of:
            - slot_conditions: { generator: { value_presence: PRESENT } }
            - slot_conditions: { memberList: { value_presence: PRESENT } }

  ContrastGenerator:
    description: Study-time generator resolved against `over`'s levels into explicit members (§3.5).
    attributes:
      kind:
        range: ContrastGeneratorKind
        required: true
      reference:
        description: Comparator level (often the {control_arm} sliceKey), for vs_reference.
        range: string

  ContrastMember:
    description: One row of L — a labelled set of weights (single-factor) or cells (multi-factor).
    attributes:
      label: { range: string, required: true }
      weights:
        description: Single-factor shorthand — map of level -> weight (omitted = 0).
        range: float
        multivalued: true
        inlined: true
      cells:
        description: General multi-factor cells (interaction / difference-in-differences).
        range: ContrastCell
        multivalued: true
        inlined_as_list: true
    rules:
      - description: a member carries weights or cells (at least one).
        postconditions:
          any_of:
            - slot_conditions: { weights: { value_presence: PRESENT } }
            - slot_conditions: { cells: { value_presence: PRESENT } }

  ContrastCell:
    description: A weighted cell mapping each relevant factor to a level.
    attributes:
      cell:
        description: Map of factor (concept term) -> level.
        range: string
        multivalued: true
        inlined: true
      weight: { range: float, required: true }

enums:

  ContrastBasis:
    permissible_values:
      estimated_means:
        description: Columns are the levels/cells of the contrasted factor(s); concept-owned, portable (default).
      model_coefficients:
        description: Columns are the fitted model's parameters; model-bound, needs coding/reference.

  ContrastCoding:
    permissible_values:
      reference:
        description: Reference (treatment) coding — one level absorbed into the intercept.
      cell_means:
        description: Cell-means coding — every level gets its own parameter.

  ContrastGeneratorKind:
    permissible_values:
      pairwise: {}
      vs_reference: {}
      trend: {}
      custom: {}
```

(Add the three enums under the file's existing top-level `enums:` block — merge, do not duplicate the `enums:` key. The `classes` go under the existing top-level `classes:` block.)

- [ ] **Step 2: Bump version.** Line 26 `version: 0.1.0` → `version: 0.2.0`.

- [ ] **Step 3: Regenerate the JSON schema**

Run:
```bash
.venv/bin/gen-json-schema model/linkML/acdc_transformation.yaml > model/json_schema/acdc_transformation.schema.json
```
Expected: exits 0.

- [ ] **Step 4: Lint**

Run: `.venv/bin/linkml-lint model/linkML/acdc_transformation.yaml`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add model/linkML/acdc_transformation.yaml model/json_schema/acdc_transformation.schema.json
# "acdc_transformation.yaml: add contrastSpecification dimension binding; bump to 0.2.0"
```

---

## Phase E — Contrast specification data

### Task E1: Drop `contrasts_t` `indexed_by` from analysis method files

**Files:**
- Modify: `lib/methods/analyses/M_ANOVA.json`
- Modify: `lib/methods/analyses/M_ANCOVA.json`

(Contrast spec §3.6 / §3.7. `M_TwoSampleTTest.json` and `M_MMRM.json` already have no `indexed_by` on their `contrasts_t` output — leave them.)

- [ ] **Step 1: Add the cleanup check to the validator**

Append:

```python
# ---- Contrast spec §3.6: contrasts_* outputs carry no contrast-row indexed_by
import glob
for f in glob.glob(str(ROOT/'lib'/'methods'/'analyses'/'*.json')):
    m = load(f)
    for o in m.get("outputs", []):
        if o.get("output_type") in ("contrasts_t","contrasts_z"):
            ib = o.get("indexed_by", [])
            check("fixed_effect" not in ib,
                  f"[E1] {pathlib.Path(f).name}: contrasts output still has indexed_by 'fixed_effect' (contrast rows are member-defined)")
```

- [ ] **Step 2: Run validator — confirm it fails** for `M_ANOVA.json` and `M_ANCOVA.json`.

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL on those two files.

- [ ] **Step 3: Edit both files.** In each, find the `contrasts_t` output object and delete its `"indexed_by": ["fixed_effect"]` line (and the trailing comma adjustment). The output becomes e.g.:

```json
        {
          "name": "contrasts_t",
          "output_type": "contrasts_t"
        }
```

- [ ] **Step 4: Run validator + re-validate method files against schema**

Run:
```bash
.venv/bin/python scripts/validate_methods_model.py && \
.venv/bin/linkml-validate -s model/linkML/acdc_method.yaml -C Method lib/methods/analyses/M_ANCOVA.json
```
Expected: `OK` and validation success.

- [ ] **Step 5: Commit**

```bash
git add lib/methods/analyses/M_ANOVA.json lib/methods/analyses/M_ANCOVA.json scripts/validate_methods_model.py
# "Drop contrasts_t indexed_by from ANOVA/ANCOVA (contrast rows are member-defined)"
```

---

### Task E2: Add a worked `contrastSpecification` to the transformation library

**Files:**
- Modify: `lib/transformations/ACDC_Transformation_Library_v07.json`

- [ ] **Step 1: Locate the ANCOVA treatment-difference transformation.**

Run:
```bash
.venv/bin/python - <<'PY'
import json
d=json.load(open('lib/transformations/ACDC_Transformation_Library_v07.json'))
ts = d.get('transformations', d if isinstance(d,list) else d.get('library',[]))
# print transformation ids and whether they use M.ANCOVA / contrasts_t
def walk(obj):
    if isinstance(obj,dict):
        if 'method' in obj and ('outputDataStructure' in obj or 'transformationId' in obj or 'id' in obj):
            print(obj.get('id') or obj.get('transformationId'), '->', obj.get('method'))
        for v in obj.values(): walk(v)
    elif isinstance(obj,list):
        for v in obj: walk(v)
walk(d)
PY
```
Expected: a list of transformation ids; pick the ANCOVA change-from-baseline one (e.g. `T.CFB_ANCOVA` per spec §4.1). If none exists, choose the transformation whose `method` is `M.ANCOVA` and that has both `ls_means` and `contrasts_t` measures.

- [ ] **Step 2: Add the `contrast` dimension to that transformation's `outputDataStructure.dimensions`** (authored/template form, §4.1):

```json
    {
      "name": "contrast",
      "concept": "Contrasts",
      "contrastSpecification": {
        "over": "Treatment",
        "basis": "estimated_means",
        "members": {
          "generator": { "kind": "vs_reference", "reference": "{control_arm}" }
        }
      }
    }
```

Ensure the `measures` array contains `{ "output": "contrasts_t", "concept": "Contrasts" }` (add if missing).

- [ ] **Step 3: Validate the whole library against the regenerated schema**

Run:
```bash
.venv/bin/linkml-validate -s model/linkML/acdc_transformation.yaml -C TransformationLibrary lib/transformations/ACDC_Transformation_Library_v07.json
```
Expected: validation success. (If the library's root class differs, use the correct `-C` class — check the schema's `tree_root`.)

- [ ] **Step 4: Commit**

```bash
git add lib/transformations/ACDC_Transformation_Library_v07.json
# "Add worked estimated_means contrastSpecification to the ANCOVA transformation"
```

---

## Phase F — Rebuild `AllMethods.json`

### Task F1: Write the aggregate builder

**Files:**
- Create: `scripts/build_all_methods.py`

- [ ] **Step 1: Write `scripts/build_all_methods.py`**

```python
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
```

- [ ] **Step 2: Run the builder**

Run: `.venv/bin/python scripts/build_all_methods.py`
Expected: `wrote lib/methods/AllMethods.json with 60 methods, 13 sets, ... templates`.

- [ ] **Step 3: Add an aggregate-coverage check to the validator**

Append to `scripts/validate_methods_model.py`:

```python
# ---- AllMethods.json aggregate is complete & current ----------------------
allm = load(M_DIR := (ROOT/"lib"/"methods"/"AllMethods.json"))
file_ids = set()
for f in glob.glob(str(ROOT/'lib'/'methods'/'analyses'/'*.json'))+glob.glob(str(ROOT/'lib'/'methods'/'derivations'/'*.json')):
    file_ids.add(load(f)["conceptId"])
agg_ids = {m["conceptId"] for m in allm["methods"]}
check(file_ids == agg_ids, f"[F1] AllMethods out of sync: missing={file_ids-agg_ids} extra={agg_ids-file_ids}")
check("statisticSets" in allm, "[F1] AllMethods missing statisticSets section")
check(set(allm.get("statisticSets",{})) == EXPECTED_SETS, "[F1] AllMethods statisticSets stale")
```

(Add `glob` import at top if not already present.)

- [ ] **Step 4: Run validator**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK` — including the F1 coverage check (60 methods, all sets present).

- [ ] **Step 5: Commit**

```bash
git add scripts/build_all_methods.py lib/methods/AllMethods.json scripts/validate_methods_model.py
# "Regenerate AllMethods.json from per-file sources via build script"
```

---

## Phase G — Final full validation

### Task G1: End-to-end gate

- [ ] **Step 1: Run the full validator**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: `OK — all checks passed`.

- [ ] **Step 2: Regenerate all JSON schemas and validate representative instances**

Run:
```bash
.venv/bin/gen-json-schema model/linkML/acdc_method.yaml > model/json_schema/acdc_method.schema.json
.venv/bin/gen-json-schema model/linkML/acdc_transformation.yaml > model/json_schema/acdc_transformation.schema.json
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
.venv/bin/linkml-validate -s model/linkML/acdc_output_classes.yaml -C StatisticSetLibrary lib/vocabulary/statistic_sets.json
.venv/bin/linkml-validate -s model/linkML/acdc_output_classes.yaml -C OutputClassTemplateLibrary lib/vocabulary/output_class_templates.json
```
Expected: all exit 0 / validation success.

- [ ] **Step 3: JSON parse sweep** (catch any stray syntax error)

Run:
```bash
.venv/bin/python - <<'PY'
import json, glob
bad=0
for f in glob.glob('lib/**/*.json', recursive=True)+glob.glob('model/json_schema/*.json'):
    try: json.load(open(f))
    except Exception as e: print("BAD", f, e); bad+=1
print("parse sweep:", "OK" if not bad else f"{bad} bad files")
PY
```
Expected: `parse sweep: OK`.

- [ ] **Step 4: Final commit (if anything regenerated)**

```bash
git add -A model/json_schema/ lib/
# "Final regen + full model validation pass"
```

---

## Self-Review (completed during planning)

**Spec coverage — output-class spec (`2026-06-11-output-class-statistic-sets-design.md`):**
- §3.1 statistic_sets → Task A3. §3.1 numerator/denominator terms → A2. §3.2/§3.2.2 template rewrite → B2 (mapping validated, all 32 OK). §3.2.1 invariant → B1 check. §4 FHIR datatypes → **on AC concepts only** (C2); Range/Count + layerMapping → A4; CI as one Range concept → C2. §5 unification (concept→terminology `term` crosswalk, shared sets, dimensions kept, methodOutputSlotMapping repair) → C1–C3. §6.1 acdc_method enum cleanup → D1. §6.2 acdc_output_classes.yaml → D2. §6.3 acdc_transformation (no change for stat-sets) → confirmed; contrast addition handled in D3. §7 library/aggregate changes → A2/A3/A4, B2, C, F. §7.6 AllMethods rebuild → F1.
- **D-layers deliberately revises the spec** (recorded with the user): spec **D6** put `fhirValueType` on the shared atom — the plan instead keeps terminology primitive and homes `fhirValueType` only on the AC concept (consistent with `acdc_method.yaml`'s "FHIR type flows from the concept at transformation time"). Spec **D7**'s "shared vocabulary owned by neither" is kept and sharpened: it is the **terminology** layer; the method cites terminology, the concept cites terminology + overlays FHIR; the two are bridged only by the transformation (`Method ← Transformation → Concept`), so the method never references a concept.
- Open items: Q1 (D-point), Q2 (D-prop), Q3 (AllMethods build step = F1), Q4 (D-home = `lib/vocabulary`, as terminology) — all resolved with the user.

**Spec coverage — contrast spec (`2026-06-11-contrast-specification-design.md`):**
- §3 coefficient matrix L → modelled as `ContrastSpecification` in D3. §3.6 indexed_by cleanup → E1. §3.7 templates unchanged → confirmed (B2 leaves contrasts_t/_z statistics intact). §4 outputDataStructure placement + §4.3 schema impact → D3 + E2. Scenario A (§6) recommended/decided → no new method (correctly absent from plan). §9 Q2 basis scope (D-basis = both) resolved.

**Placeholder scan:** none — every data/code step shows full content; every command shows expected output.

**Type consistency:** set ids, atom ids, template ids, AC concept ids, and method output `name`s are used identically across A3/B2/C2/C3/F1 (verified against the live files in this session). `ESTIMATE_SPECIALIZATION` / `_PATTERN_TO_TEMPLATE` names are consistent between B1 and C-task validator additions.

**Known risk to watch during execution:** linkML rule syntax (`value_presence`, `exactly_one_of`, `any_of`) in D2/D3 — if `gen-json-schema`/`linkml-lint` rejects a rule construct on the installed linkML version, simplify that rule to a documented comment + keep the structural attributes (the Python validator is the authoritative invariant gate; the linkML rules are advisory). Do not block the phase on advanced rule expressivity.
```

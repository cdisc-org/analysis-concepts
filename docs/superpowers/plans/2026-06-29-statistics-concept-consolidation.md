# Statistics Concept Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the statistics output model — make controlled terminology and concept modeling each have one home, anchor statistic↔concept identity on an NCI C-code (`dec_id`), drop the duplicated `methodOutputSlotMapping`, and reshape `indexed_by` into a model-grounded notation — without merging or restructuring the existing files.

**Architecture:** Four artefacts stay (`statistics_vocabulary`, `statistic_sets`, `output_class_templates`, the AC concept model). The vocabulary becomes pure controlled terminology (CT); the concept layer owns all FHIR/modeling detail; slot→concept binding lives only in the transformation. LinkML schemas are the source of truth and compile to JSON Schema; a Python validator (`scripts/validate_methods_model.py`) enforces cross-layer invariants and **is the test harness**.

**Tech Stack:** Python 3.13 (`.venv`), LinkML (`gen-json-schema`, `linkml-validate`), JSON data under `lib/`.

**Spec:** `docs/superpowers/specs/2026-06-26-statistics-concept-consolidation-design.md` (approved 2026-06-29).

## Global Constraints

- **No fabricated NCI codes.** Every `dec_id` and `code.value` stays `null` until a real NCI code is registered (per `feedback_no_hardcoding`). The model is *designed* around `dec_id`; the term id is the interim join key while `dec_id` is null.
- **The validator is the test.** Run: `.venv/bin/python scripts/validate_methods_model.py` (exit 0 = all pass; exit 1 = failures printed with `[TAG]` labels). TDD cycle = add/flip a check so it **fails** against current data, migrate the data/schema, re-run so it **passes**.
- **LinkML is source of truth.** After editing a `model/linkML/*.yaml`, regenerate its JSON Schema:
  `.venv/bin/gen-json-schema model/linkML/<name>.yaml > model/json_schema/<name>.schema.json`
- **Files stay separate.** Do **not** merge `AC_Concept_Model_v017.json` and `Option_B_Clinical.json` (spec §7 — the one-concept-model migration is a separate, gated effort). The combined DC+AC view is a **diagram only**.
- **Methods stay concept-free on outputs.** A method names no AC/DC concept; the transformation binds slot→concept.
- **Commit after every task** with `.venv/bin/python scripts/validate_methods_model.py` green (except where a task explicitly leaves it red pending the next task — none here; each task ends green).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `model/linkML/acdc_output_classes.yaml` | LinkML for terminology, sets, output-classes, AC concepts/patterns | add `dec_id`; drop `dataType` requirement; drop `methodOutputSlotMapping` class/slot |
| `model/linkML/acdc_method.yaml` | LinkML for methods | reshape `indexed_by` to an object |
| `model/json_schema/acdc_output_classes.schema.json` | generated | regenerate |
| `model/json_schema/acdc_method.schema.json` | generated | regenerate |
| `lib/vocabulary/statistics_vocabulary.json` | CT terms | add `dec_id: null`; remove `dataType` |
| `lib/concepts/AC_Concept_Model_v017.json` | AC atoms + molecules + mapping | add `dec_id: null` to atoms/leaves; delete `methodOutputSlotMapping` |
| `lib/methods/{analyses,derivations}/M_*.json` (~41) | methods | reshape `indexed_by` |
| `lib/methods/AllMethods.json` | generated bundle | rebuild |
| `scripts/validate_methods_model.py` | cross-layer validator (test harness) | new identity check; flip A1; upgrade C2; replace C3 |
| `scripts/build_all_methods.py` | builds AllMethods.json | rerun; adjust if it copies `dataType` |
| `model_alternative/linkML/gen_dc_ac_diagram.py` | combined DC+AC diagram generator | reflect `dec_id`, no mapping, new dimensions |
| `docs/superpowers/specs/.../2026-06-26-dc-ac-concept-layer.drawio` | generated diagram | regenerate |

---

## Task 1: Add `dec_id` identity to terminology + concept atoms

**Files:**
- Modify: `model/linkML/acdc_output_classes.yaml` (`StatisticTerm`, `ACStatisticalConcept`, `ConceptLeaf`)
- Modify: `lib/vocabulary/statistics_vocabulary.json` (57 terms)
- Modify: `lib/concepts/AC_Concept_Model_v017.json` (atoms + their leaves)
- Modify: `scripts/validate_methods_model.py` (new `[ID1]` identity-coverage check)

**Interfaces:**
- Produces: a `dec_id` string field (value `null`) on every `StatisticTerm`, `ACStatisticalConcept`, and `ConceptLeaf`. Later tasks join on it (falling back to `term`/`conceptId` while null).

- [ ] **Step 1: Add the failing identity check to the validator**

In `scripts/validate_methods_model.py`, after the terminology block that loads `stats`, add:

```python
# ---- [ID1] identity coverage: every term carries a dec_id slot --------------
for tid, t in stats.items():
    check("dec_id" in t, f"[ID1] term {tid} missing dec_id slot (use null until NCI code is registered)")
    if t.get("dec_id") is None:
        print(f"[ID1] note: term {tid} dec_id unregistered — using term-id as interim key")
```

- [ ] **Step 2: Run validator, verify `[ID1]` fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `[ID1] term estimate missing dec_id slot …` (and 56 more).

- [ ] **Step 3: Add `dec_id` to the LinkML for the three classes**

In `model/linkML/acdc_output_classes.yaml`:
- under `StatisticTerm.attributes`, add: `dec_id: { required: false, description: "Data Element Concept id — an NCI C-code. null until registered; the canonical statistic↔concept join key." }`
- under `ACStatisticalConcept.attributes`, add the same `dec_id:` line.
- under `ConceptLeaf.attributes`, add the same `dec_id:` line.

- [ ] **Step 4: Add `dec_id: null` to all 57 terms (migration script)**

Run:

```bash
.venv/bin/python - <<'PY'
import json, pathlib
p = pathlib.Path("lib/vocabulary/statistics_vocabulary.json")
d = json.loads(p.read_text())
for t in d["statistics"].values():
    t.setdefault("dec_id", None)
p.write_text(json.dumps(d, indent=2) + "\n")
print("added dec_id to", len(d["statistics"]), "terms")
PY
```

- [ ] **Step 5: Add `dec_id: null` to AC concept atoms and their leaves**

Run:

```bash
.venv/bin/python - <<'PY'
import json, pathlib
p = pathlib.Path("lib/concepts/AC_Concept_Model_v017.json")
d = json.loads(p.read_text())
atoms = d["sharedStatisticsVocabulary"]["concepts"]
for a in atoms.values():
    a.setdefault("dec_id", None)
    for leaf in a.get("leaves", []):
        leaf.setdefault("dec_id", None)
p.write_text(json.dumps(d, indent=2) + "\n")
print("added dec_id to", len(atoms), "atoms")
PY
```

- [ ] **Step 6: Run validator, verify `[ID1]` passes (notes only)**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: exit 0; `[ID1] note: … unregistered` lines printed, no failures.

- [ ] **Step 7: Regenerate the output-classes JSON Schema and commit**

```bash
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
git add model/linkML/acdc_output_classes.yaml model/json_schema/acdc_output_classes.schema.json lib/vocabulary/statistics_vocabulary.json lib/concepts/AC_Concept_Model_v017.json scripts/validate_methods_model.py
git commit -m "feat(stats): add dec_id identity to terminology and AC concept atoms (null until registered)"
```

---

## Task 2a: Promote orphan terms to concept atoms (prerequisite for Task 2)

**Why:** Task 2's safety check found 10 vocabulary terms with no concept carrying `valueType` — `n, frequency, cumulative_n, pct, cumulative_pct, p_value_adjusted, R_squared, concordance, SS, MS`. All are referenced by `output_class_templates.json` (or `statistic_sets.json`), so spec §4 promotes them. Removing `dataType` (Task 2) is unsafe until each has a concept. `valueType`/`unitRule` per atom were ruled by the user 2026-06-29.

**Files:** Modify `lib/concepts/AC_Concept_Model_v017.json` (`sharedStatisticsVocabulary.concepts`).

```python
.venv/bin/python - <<'PY'
import json, pathlib
p = pathlib.Path("lib/concepts/AC_Concept_Model_v017.json")
d = json.loads(p.read_text())
atoms = d["sharedStatisticsVocabulary"]["concepts"]
NEW = {  # conceptId: (label, shortLabel, term, valueType, unitRule)
  "NObs":          ("Number of observations", "N",     "n",                "Count",    "none"),
  "Frequency":     ("Frequency",              "freq",  "frequency",        "Count",    "none"),
  "CumulativeN":   ("Cumulative count",       "cum N", "cumulative_n",     "Count",    "none"),
  "PValueAdjusted":("Adjusted p-value",       "p adj", "p_value_adjusted", "decimal",  "unitless"),
  "RSquared":      ("R-squared",              "R^2",   "R_squared",        "decimal",  "unitless"),
  "Concordance":   ("Concordance (C-index)",  "C",     "concordance",      "decimal",  "unitless"),
  "Pct":           ("Percentage",             "%",     "pct",              "decimal",  "none"),
  "CumulativePct": ("Cumulative percentage",  "cum %", "cumulative_pct",   "decimal",  "none"),
  "SumOfSquares":  ("Sum of squares",         "SS",    "SS",               "Quantity", "derived"),
  "MeanSquare":    ("Mean square",            "MS",    "MS",               "Quantity", "derived"),
}
for cid, (label, short, term, vt, ur) in NEW.items():
    atoms.setdefault(cid, {"label": label, "shortLabel": short, "term": term,
        "valueType": vt, "unitRule": ur, "code": {"system": "NCI", "value": None}, "dec_id": None})
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
print("atoms total:", len(atoms))
PY
```

Verify: `.venv/bin/python scripts/validate_methods_model.py` is green, and the Task 2 safety-check snippet now reports `none`. Commit locally.

## Task 2: Make the vocabulary pure CT — remove `dataType`

**Files:**
- Modify: `scripts/validate_methods_model.py` (`[A1]` block — flip from require to forbid)
- Modify: `model/linkML/acdc_output_classes.yaml` (`StatisticTerm.dataType` → removed)
- Modify: `lib/vocabulary/statistics_vocabulary.json` (drop `dataType` from 57 terms)
- Check: `scripts/build_all_methods.py` (must not depend on term `dataType`)

**Interfaces:**
- Consumes: `dec_id` from Task 1.
- Produces: terms with no `dataType`; structural type now lives only on `ACStatisticalConcept.valueType`.

- [ ] **Step 1: Flip the `[A1]` check to forbid `dataType`**

In `scripts/validate_methods_model.py`, in the `[A1]` block, replace the line
`check("dataType" in a, f"[A1] term {aid} missing primitive dataType")`
with:

```python
check("dataType" not in a, f"[A1] term {aid} must NOT carry dataType — structural type lives on the concept's valueType")
```

- [ ] **Step 2: Run validator, verify `[A1]` fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `[A1] term estimate must NOT carry dataType …` (×57).

- [ ] **Step 3: Confirm every term has a concept carrying `valueType` (safety check)**

```bash
.venv/bin/python - <<'PY'
import json
terms = set(json.load(open("lib/vocabulary/statistics_vocabulary.json"))["statistics"])
ac = json.load(open("lib/concepts/AC_Concept_Model_v017.json"))["sharedStatisticsVocabulary"]["concepts"]
covered = set()
for c in ac.values():
    if c.get("term"): covered.add(c["term"])
    for leaf in c.get("leaves", []): covered.add(leaf["term"])
missing = terms - covered
print("terms with no concept/leaf carrying valueType:", sorted(missing) or "none")
PY
```
Expected: `none` (every term's type is recoverable from a concept's `valueType`). If any appear, add a thin atom for them in this step before proceeding.

- [ ] **Step 4: Remove `dataType` from all terms**

```bash
.venv/bin/python - <<'PY'
import json, pathlib
p = pathlib.Path("lib/vocabulary/statistics_vocabulary.json")
d = json.loads(p.read_text())
n = 0
for t in d["statistics"].values():
    if t.pop("dataType", None) is not None: n += 1
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")
print("removed dataType from", n, "terms")
PY
```

- [ ] **Step 5: Remove `dataType` from the LinkML `StatisticTerm`**

In `model/linkML/acdc_output_classes.yaml`, delete the `dataType: { required: true, … }` line under `StatisticTerm.attributes`.

- [ ] **Step 6: Run validator, verify green**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: exit 0.

- [ ] **Step 7: Rebuild AllMethods.json and confirm no `dataType` leaked from terms**

```bash
.venv/bin/python scripts/build_all_methods.py
grep -c '"dataType"' lib/methods/AllMethods.json   # method input/output dataType stays; term dataType is gone
```
(If `build_all_methods.py` errors on the missing term `dataType`, fix it to read structural type from the concept `valueType` instead, then rerun.)

- [ ] **Step 8: Regenerate schema and commit**

```bash
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
git add model/linkML/acdc_output_classes.yaml model/json_schema/acdc_output_classes.schema.json lib/vocabulary/statistics_vocabulary.json lib/methods/AllMethods.json scripts/validate_methods_model.py
git commit -m "feat(stats): vocabulary is pure controlled terminology (remove dataType; valueType is the single source)"
```

---

## Task 3: Upgrade the `[C2]` join to use `dec_id` (fallback to term id)

**Files:**
- Modify: `scripts/validate_methods_model.py` (`[C2]` block)

**Interfaces:**
- Consumes: `dec_id` on terms and atoms (Task 1).
- Produces: a `concept_code(cid)` helper that returns an atom's `dec_id` if set, else its `term` id — the shared join key used by `[C2]` and later checks.

- [ ] **Step 1: Add the join-key helper and a test that exercises the fallback**

In `scripts/validate_methods_model.py`, above the `[C2]` block, add:

```python
def term_code(term_id):
    """Canonical key for a terminology term: dec_id if registered, else the term id."""
    t = stats.get(term_id, {})
    return t.get("dec_id") or term_id

def concept_code(cid, ac_concepts):
    """Canonical key for an AC atom: its dec_id if set, else its bridged term id."""
    c = ac_concepts.get(cid, {})
    return c.get("dec_id") or c.get("term") or cid
```

- [ ] **Step 2: Rewrite the `[C2]` coverage comparison to compare codes, leaf-aware**

In the `[C2]` block, replace the term-string coverage comparison so that the molecule's constituent **codes** must cover the set's term **codes**:

```python
required = {term_code(t) for sid in pat.get("statistics_set", []) for t in sets[sid]["statistics"]}
covered = set()
for cid in pat.get("constituents", []):
    c = ac_concepts.get(cid, {})
    if c.get("leaves"):
        covered |= {term_code(leaf["term"]) for leaf in c["leaves"]}
    elif c.get("term"):
        covered.add(term_code(c["term"]))
    covered.add(concept_code(cid, ac_concepts))
check(required <= covered,
      f"[C2] pattern {pid}: constituent codes do not cover set codes (missing {sorted(required - covered)})")
```

- [ ] **Step 3: Run validator, verify green**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: exit 0 (dec_ids are null, so codes fall back to term ids — same result as before, now code-anchored).

- [ ] **Step 4: Commit**

```bash
git add scripts/validate_methods_model.py
git commit -m "feat(stats): [C2] joins molecule constituents to set terms by dec_id (term-id fallback)"
```

---

## Task 4: Drop `methodOutputSlotMapping`; bind slot→concept only in the transformation

**Files:**
- Modify: `scripts/validate_methods_model.py` (remove `[C3]`; add `[C3']` transformation check)
- Modify: `lib/concepts/AC_Concept_Model_v017.json` (delete `methodOutputSlotMapping`)
- Modify: `model/linkML/acdc_output_classes.yaml` (remove the `methodOutputSlotMapping` class/slot if present)
- Read: `lib/transformations/ACDC_Transformation_Library_v07.json`, `lib/methods/{analyses,derivations}/M_*.json`

**Interfaces:**
- Consumes: transformation `outputDataStructure.measures[].output` + `.concept`.
- Produces: `[C3']` — every transformation output reference resolves to a real method slot, and its bound concept exists in the concept layer.

- [ ] **Step 1: Add the `[C3']` transformation check (failing first if any gap)**

In `scripts/validate_methods_model.py`, add a block that loads the transformation library and the method files, then:

```python
import glob
tlib = load(ROOT / "lib" / "transformations" / "ACDC_Transformation_Library_v07.json")["transformations"]
methods = {}
for mp in glob.glob(str(ROOT / "lib" / "methods" / "*" / "M_*.json")):
    m = load(mp); methods[m["conceptId"]] = {o["name"] for o in m.get("outputs", [])}
dc_concepts = set()
for cp in [ROOT/"lib"/"concepts"/"Option_B_Clinical.json", ROOT/"lib"/"concepts"/"AC_Concept_Model_v017.json"]:
    dc_concepts |= _all_concept_ids(load(cp))   # see Step 2 helper
for tr in tlib:
    mid = tr.get("usesMethod"); slots = methods.get(mid, set())
    for meas in tr.get("outputDataStructure", {}).get("measures", []):
        out = meas.get("output")
        check(out in slots, f"[C3'] transformation {tr['conceptId']} output {out!r} is not a slot of {mid}")
        con = meas.get("concept")
        check(con in dc_concepts, f"[C3'] transformation {tr['conceptId']} binds unknown concept {con!r}")
```

- [ ] **Step 2: Add the `_all_concept_ids` helper**

```python
def _all_concept_ids(model):
    ids = set()
    ids |= set(model.get("resultPatterns", {}))
    ids |= set(model.get("sharedStatisticsVocabulary", {}).get("concepts", {}))
    for cat in model.get("categories", {}).values():
        if isinstance(cat, dict):
            ids |= set(cat.get("concepts", {}))
    return ids
```

- [ ] **Step 3: Run validator, verify `[C3']` passes against current transformations**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: exit 0 (transformations already carry these bindings). If any `[C3']` failure appears, the transformation is missing a binding — fix that transformation's `outputDataStructure.measures` before continuing.

- [ ] **Step 4: Delete the old `[C3]` block**

Remove the `# C3: methodOutputSlotMapping resolves to real patterns` block and its checks.

- [ ] **Step 5: Delete `methodOutputSlotMapping` from the AC model**

```bash
.venv/bin/python - <<'PY'
import json, pathlib
p = pathlib.Path("lib/concepts/AC_Concept_Model_v017.json")
d = json.loads(p.read_text())
removed = d.pop("methodOutputSlotMapping", None)
p.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n")  # ensure_ascii=False also un-escapes the \uXXXX noise Task 1 introduced
print("removed methodOutputSlotMapping:", bool(removed))
PY
```

- [ ] **Step 6: Remove it from the LinkML (if modelled)**

In `model/linkML/acdc_output_classes.yaml`, search for `methodOutputSlotMapping` and remove its class and the slot referencing it (and any `gen_concept_diagrams.py` reference — handled in Task 7). If absent, note "not modelled" and continue.

- [ ] **Step 7: Run validator green; regenerate schema; commit**

```bash
.venv/bin/python scripts/validate_methods_model.py
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
git add scripts/validate_methods_model.py lib/concepts/AC_Concept_Model_v017.json model/linkML/acdc_output_classes.yaml model/json_schema/acdc_output_classes.schema.json
git commit -m "feat(stats): drop methodOutputSlotMapping; slot→concept binding lives only in the transformation"
```

---

## Task 5: Reshape the `indexed_by` schema to a model-grounded notation

**Files:**
- Modify: `model/linkML/acdc_method.yaml` (`indexed_by` slot)
- Modify: `model/json_schema/acdc_method.schema.json` (regenerated)

**Interfaces:**
- Produces: `indexed_by` is now an object — `{ granularity: scalar|component|level, components?: all|discrete|continuous, axis?: time|cov_param }` — replacing the string list.

- [ ] **Step 1: Replace the `indexed_by` definition in the method LinkML**

In `model/linkML/acdc_method.yaml`, replace the `indexed_by:` slot under method outputs with a reference to a new class:

```yaml
      indexed_by:
        description: >-
          How an output's rows are indexed along the model structure (§3.8 of
          the consolidation spec). Replaces the old raw-token list.
        range: IndexedBy
        inlined: true
```

and add the class (near the other output classes):

```yaml
  IndexedBy:
    description: Indexing of a multi-row output along the statistical model.
    attributes:
      granularity:
        required: true
        description: scalar = one row; component = one row per model term/by-variable; level = one row per level of each discrete component.
        range: granularity_enum
      components:
        description: Which components participate (omit for scalar).
        range: components_enum
      axis:
        description: A non-model-structure index, for the few outputs not indexed by model terms.
        range: axis_enum

enums:
  granularity_enum:
    permissible_values: { scalar: {}, component: {}, level: {} }
  components_enum:
    permissible_values: { all: {}, discrete: {}, continuous: {} }
  axis_enum:
    permissible_values:
      time: { description: Outcome time grid (e.g. survival table). }
      cov_param: { description: Variance/covariance-structure parameters. }
```
(If the file already has a top-level `enums:` block, add the three enums there instead of a second `enums:` key.)

- [ ] **Step 2: Regenerate the method JSON Schema**

```bash
.venv/bin/gen-json-schema model/linkML/acdc_method.yaml > model/json_schema/acdc_method.schema.json
grep -A6 '"indexed_by"' model/json_schema/acdc_method.schema.json
```
Expected: `indexed_by` now an object with `granularity`/`components`/`axis`.

- [ ] **Step 3: Commit (schema only; data migrated in Task 6)**

```bash
git add model/linkML/acdc_method.yaml model/json_schema/acdc_method.schema.json
git commit -m "feat(stats): reshape indexed_by schema to granularity/components/axis notation (§3.8)"
```

---

## Task 6: Migrate `indexed_by` on the ~41 method files

**Files:**
- Modify: `lib/methods/analyses/M_*.json` and `lib/methods/derivations/M_*.json` that contain `indexed_by`
- Modify: `scripts/validate_methods_model.py` (new `[M1]` check: `indexed_by` is the object form)

**Interfaces:**
- Consumes: the `IndexedBy` schema from Task 5.
- Produces: every `indexed_by` is the object form; validated against `acdc_method.schema.json`.

**Migration rules (apply per output):**
- list `["group"]` or any single by-variable, no interactions → `{ "granularity": "level", "components": "discrete" }` (one row per group level).
- list of model terms incl. interactions, omnibus test output (`type3_*`) → `{ "granularity": "component", "components": "all" }`.
- estimate-per-term output (`parameter_estimates_*`, `*_estimates`, `ls_means`) → `{ "granularity": "level", "components": "all" }` for parameter estimates; `{ "granularity": "level", "components": "discrete" }` for `ls_means`.
- survival table (`survival_table`) → `{ "granularity": "level", "components": "discrete", "axis": "time" }`.
- covariance params (`covariance_parameters`) → `{ "granularity": "component", "components": "discrete", "axis": "cov_param" }`.
- no `indexed_by` (scalar already) → leave as is; do **not** add one.

- [ ] **Step 1: Add `[M1]` check that `indexed_by` is the object form**

In `scripts/validate_methods_model.py`, add a block that loads each method file and:

```python
for mp in glob.glob(str(ROOT / "lib" / "methods" / "*" / "M_*.json")):
    m = load(mp)
    for o in m.get("outputs", []):
        ib = o.get("indexed_by")
        if ib is None: continue
        check(isinstance(ib, dict) and "granularity" in ib,
              f"[M1] {m['conceptId']}.{o.get('name')} indexed_by must be the object form, got {type(ib).__name__}")
```

- [ ] **Step 2: Run validator, verify `[M1]` fails**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: FAIL — `[M1] M.Mean.result indexed_by must be the object form, got list` (×~41).

- [ ] **Step 3: Migrate the simple by-group methods (script)**

Most of the ~41 are descriptive/derivation methods whose `indexed_by` is a single by-variable list:

```bash
.venv/bin/python - <<'PY'
import json, glob
SIMPLE = {"granularity": "level", "components": "discrete"}
n = 0
for mp in glob.glob("lib/methods/*/M_*.json"):
    m = json.load(open(mp)); changed = False
    for o in m.get("outputs", []):
        ib = o.get("indexed_by")
        if isinstance(ib, list):
            toks = [t for t in ib]
            has_interaction = any(":" in t for t in toks)
            # leave the structured analysis methods for manual Step 4
            if not has_interaction and o.get("output_type") == "computed_value":
                o["indexed_by"] = dict(SIMPLE); changed = True; n += 1
    if changed:
        with open(mp, "w") as fh:
            json.dump(m, fh, indent=2, ensure_ascii=False); fh.write("\n")
print("migrated simple by-group outputs:", n)
PY
```

- [ ] **Step 4: Migrate the structured analysis methods by hand**

For each of `M_ANCOVA`, `M_MMRM`, `M_CoxPH`, `M_KaplanMeier`, `M_LogisticRegression`, `M_ANOVA`, `M_MANOVA`, `M_TwoSampleTTest` (any output whose `indexed_by` is still a list), apply the migration rules above. Example — `lib/methods/analyses/M_ANCOVA.json` outputs become:

```jsonc
{ "name": "fit_statistics_linear",      "output_type": "fit_statistics_linear",
  "indexed_by": { "granularity": "scalar" } },
{ "name": "type3_tests_f",              "output_type": "type3_tests_f",
  "indexed_by": { "granularity": "component", "components": "all" } },
{ "name": "parameter_estimates_linear", "output_type": "parameter_estimates_linear",
  "indexed_by": { "granularity": "level", "components": "all" } },
{ "name": "ls_means",                   "output_type": "ls_means",
  "indexed_by": { "granularity": "level", "components": "discrete" } },
{ "name": "contrasts_t",                "output_type": "contrasts_t" }
```
(Note: `fit_statistics_*` had no `indexed_by` before; **add** `scalar` only where the prior value was a list — do not invent indexing for outputs that had none.)

- [ ] **Step 5: Validate every method against the regenerated schema**

```bash
for f in $(grep -rl '"indexed_by"' lib/methods/*/M_*.json); do
  .venv/bin/linkml-validate -s model/linkML/acdc_method.yaml "$f" >/dev/null || echo "INVALID: $f"
done
echo "validation done"
```
Expected: no `INVALID` lines.

- [ ] **Step 6: Run the project validator green; rebuild AllMethods; commit**

```bash
.venv/bin/python scripts/validate_methods_model.py
.venv/bin/python scripts/build_all_methods.py
git add lib/methods scripts/validate_methods_model.py
git commit -m "feat(stats): migrate indexed_by on all ~41 methods to the granularity notation (§3.8)"
```

---

## Task 7: Regenerate the combined DC+AC diagram

**Files:**
- Modify: `model_alternative/linkML/gen_dc_ac_diagram.py`
- Modify (generated): `docs/superpowers/specs/2026-06-26-dc-ac-concept-layer.drawio`

**Interfaces:**
- Consumes: `AC_Concept_Model_v017.json` (now `dec_id` on atoms, no `methodOutputSlotMapping`) and `Option_B_Clinical.json`.

- [ ] **Step 1: Update the generator's property extraction**

In `model_alternative/linkML/gen_dc_ac_diagram.py`:
- In `_atom_props`, add `dec_id` to the property box when present: append `f"dec_id: {a['dec_id']}"` (show `null` explicitly so reviewers see the interim state).
- Remove any reference to `methodOutputSlotMapping` (it no longer exists in the model). Confirm `build()` does not read it.
- In `_mol_props`, keep `dimensions` (the molecule axis) — it is unchanged in the AC model file (the granularity notation lives on the *method*, not the molecule).

- [ ] **Step 2: Regenerate the diagram**

```bash
.venv/bin/python model_alternative/linkML/gen_dc_ac_diagram.py
```
Expected: `wrote …/2026-06-26-dc-ac-concept-layer.drawio: NN nodes, MM edges`.

- [ ] **Step 3: Verify the diagram is well-formed (no stray text nodes)**

```bash
.venv/bin/python - <<'PY'
import xml.etree.ElementTree as ET
root = ET.parse("docs/superpowers/specs/2026-06-26-dc-ac-concept-layer.drawio").getroot()
cells = list(root.iter("mxCell"))
strays = [e.text for e in root.iter() if (e.text or "").strip() and e.tag not in ("mxCell",)]
print(f"parsed OK; mxCells: {len(cells)}; stray text nodes: {len(strays)}")
PY
```
Expected: parses without error; `stray text nodes: 0`.

- [ ] **Step 4: Commit**

```bash
git add model_alternative/linkML/gen_dc_ac_diagram.py docs/superpowers/specs/2026-06-26-dc-ac-concept-layer.drawio
git commit -m "docs(stats): regenerate combined DC+AC diagram (dec_id, no methodOutputSlotMapping)"
```

---

## Task 8: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the validator — expect green with only `[ID1]` unregistered notes**

Run: `.venv/bin/python scripts/validate_methods_model.py`
Expected: exit 0; the only output is `[ID1] note: … unregistered` lines.

- [ ] **Step 2: Regenerate both JSON Schemas from LinkML and confirm no diff drift**

```bash
.venv/bin/gen-json-schema model/linkML/acdc_output_classes.yaml > model/json_schema/acdc_output_classes.schema.json
.venv/bin/gen-json-schema model/linkML/acdc_method.yaml > model/json_schema/acdc_method.schema.json
git diff --stat model/json_schema/
```
Expected: no unexpected changes (schemas already committed in their tasks).

- [ ] **Step 3: Confirm the four artefacts are intact and the two removals happened**

```bash
test -f lib/vocabulary/statistics_vocabulary.json && test -f lib/vocabulary/statistic_sets.json && test -f lib/vocabulary/output_class_templates.json && echo "four artefacts present"
grep -q "computed_value" lib/vocabulary/output_class_templates.json && echo "computed_value kept"
grep -q "methodOutputSlotMapping" lib/concepts/AC_Concept_Model_v017.json && echo "ERROR: mapping still present" || echo "methodOutputSlotMapping removed"
```
Expected: "four artefacts present", "computed_value kept", "methodOutputSlotMapping removed".

- [ ] **Step 4: Final commit (if any regen drift)**

```bash
git add -A && git commit -m "chore(stats): final regen + verification for statistics concept consolidation" || echo "nothing to commit"
```

---

## Notes on resolved open questions (spec §8)

Defaults adopted for this plan — all minimal-churn; flag at review if you disagree:
1. **`dec_id` on sets/molecules** — added to **atoms and molecule concepts** (they are concepts); **not** to `statistic_sets` (method-facing bundles, not concepts).
2. **`preferredTerm` vs `name`** — kept `name`; added `dec_id` only. No rename (avoids churn). Revisit if reviewers want the rename.
3. **`broader` annotation families** — kept (teammate uses them for document annotation). No change.
4. **Concept gaps (`Duration` for `M.DateDifference`, `M.Aggregation` target)** — **deferred** to `project_one_concept_model`; not in this plan.
5. **Descriptive bundles** — left as-is (bind individually to `Measure`); no `DescriptiveSummary` molecule in 1.0.

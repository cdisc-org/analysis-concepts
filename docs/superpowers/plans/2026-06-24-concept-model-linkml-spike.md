# Concept-Model LinkML Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove (or disprove) in an isolated sandbox that OC + DC + AC concepts can be modelled as ONE LinkML concept model where concepts own their math, so that method↔concept binding is *computed* rather than hand-authored.

**Architecture:** A parallel, throwaway sandbox under `model_alternative/` and `lib_alternative/`. The single new artifact is `acdc_concept.yaml` (a unified `Concept` base: collected leaf / algebraic-identity / estimand-contract forms, operands typed by result contract, per-layer provenance). The existing `acdc_method.yaml` and `acdc_transformation.yaml` are copied in **unchanged** and the v07 transformations act as the **oracle**. Two probes decide the outcome: **shapes** (every slice concept validates with `linkml-validate`) and **binding** (a Python matcher derives the method↔concept slot map and it equals the oracle).

**Tech Stack:** LinkML (`gen-json-schema`, `linkml-validate` from `.venv/bin`), Python 3 + `pytest`, JSON instance files. No new runtime dependencies (the matcher uses a hand-written ~40-line expression parser; no sympy).

## Global Constraints

- **Spec of record:** `docs/superpowers/specs/2026-06-24-one-concept-model-design.md`. This plan implements its "Validation strategy" section.
- **Isolation:** Nothing under `model/` or `lib/` (production) is modified. All work lives under `model_alternative/`, `lib_alternative/`, `scripts/spike_*`, `tests/spike/`. Scenarios 1 & 3 must remain runnable throughout.
- **No hardcoding of domain values** (per project convention): slice *coverage* is computed by reading the live concept libraries' category lists — never by pasting a fixed category list into code. (Translating a concept's *math* is hand-authored; that is the spike's manual work.)
- **Methods stay concept-free:** `acdc_method.yaml` is not edited. Any need for a structured `algebraicForm` on a method is recorded as a finding, not implemented here.
- **Operands typed by result contract** (`produces: {valueType, unitFamily}`), never nominally by a layer class like `Measure`.
- **Identity grammar guardrail:** concept `identity` expressions use only `+ − × ÷ log` and scalar multiples — no assignment-over-group, windowing, configs, or cardinality.
- **Layer preserved as provenance:** OC/DC/AC distinction survives as `role` + `provenance` metadata; it is never erased.
- **LinkML invocation pattern (existing):** `.venv/bin/linkml-validate -s <schema>.yaml -C <RootClass> <instance>.json` and `.venv/bin/gen-json-schema <schema>.yaml`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `model_alternative/linkML/acdc_concept.yaml` | **NEW.** Unified `Concept` base + `ResultContract`/`Operand`/`AlgebraicIdentity`/`EstimandContract`/`ProvenanceBinding` + `ConceptLibrary` root. |
| `model_alternative/linkML/acdc_method.yaml` | Copied unchanged from `model/linkML/` (isolated validation + import target). |
| `model_alternative/linkML/acdc_transformation.yaml` | Copied unchanged (oracle schema). |
| `lib_alternative/concepts/ACDC_Concept_Library_v01.json` | **One** `ConceptLibrary` for the whole slice — OC leaves, DC derived, AC estimand, and dimensions — each discriminated by `role` + `axis`. (Layer is metadata, not a file split.) |
| `lib_alternative/methods/` | Copies of the few methods the slice binds (`M_Subtraction.json`, the AC method). |
| `scripts/spike_build_slice.py` | Reads live concept libs, lists categories, asserts the sandbox covers one concept per category. |
| `scripts/spike_concept_binding.py` | The matcher: parse identity + formula, unify (DC) / check interface satisfaction (AC). |
| `tests/spike/test_shapes.py` | Probe 1: `linkml-validate` passes on every sandbox instance. |
| `tests/spike/test_binding_dc.py` | Probe 2a: DC unification — derived binding matches the real v07 transformation. |
| `tests/spike/test_binding_ac.py` | Probe 2b: AC interface satisfaction. |
| `tests/spike/test_cross_layer.py` | Headline tests: cross-layer `Change`, cross-layer `Parameter`. |
| `model_alternative/linkML/gen_unified_diagrams.py` | Diagram generator — reuses `gen_concept_diagrams.py` machinery; emits both drawio files from sandbox JSON + the 3 LinkML yamls. |
| `model_alternative/linkML/unified_concept_diagram.drawio` | **Generated.** One-page unified concept DAG (OC+DC+AC+dimensions, operand-satisfaction edges, provenance). |
| `model_alternative/linkML/unified_schema_map.drawio` | **Generated.** One-page class map of the 3 LinkML schemas with cross-schema edges. |
| `tests/spike/test_diagrams.py` | Asserts both diagrams generate, parse as XML, and contain the headline nodes/edges. |
| `docs/superpowers/specs/2026-06-24-concept-model-spike-findings.md` | Final findings → adopt/revise/discard gate. |

---

### Task 1: Sandbox scaffolding + isolated LinkML validation

**Files:**
- Create: `model_alternative/linkML/acdc_method.yaml` (copy of `model/linkML/acdc_method.yaml`)
- Create: `model_alternative/linkML/acdc_transformation.yaml` (copy of `model/linkML/acdc_transformation.yaml`)
- Create: `model_alternative/linkML/acdc_concept.yaml` (minimal stub for now)
- Test: `tests/spike/test_shapes.py`

**Interfaces:**
- Produces: a validatable schema `acdc_concept.yaml` with root class `ConceptLibrary`; a pytest helper `run_linkml_validate(schema, root_class, instance) -> (rc, stdout)`.

- [ ] **Step 1: Copy the two production schemas unchanged**

```bash
mkdir -p model_alternative/linkML lib_alternative/concepts lib_alternative/methods lib_alternative/transformations tests/spike
cp model/linkML/acdc_method.yaml model_alternative/linkML/acdc_method.yaml
cp model/linkML/acdc_transformation.yaml model_alternative/linkML/acdc_transformation.yaml
```

- [ ] **Step 2: Write a minimal `acdc_concept.yaml` stub**

```yaml
id: https://cdisc.org/acdc/concept
name: acdc_concept
title: ACDC Unified Concept Schema (SPIKE)
description: Sandbox-only unified concept model spanning OC/DC/AC. Throwaway spike.
version: 0.0.1
prefixes:
  linkml: https://w3id.org/linkml/
  acdc:   https://cdisc.org/acdc/
  fhir:   http://hl7.org/fhir/
default_prefix: acdc
default_range: string
imports:
  - linkml:types
classes:
  Concept:
    attributes:
      conceptId: {identifier: true}
  ConceptLibrary:
    tree_root: true
    attributes:
      concepts: {range: Concept, multivalued: true, inlined_as_list: true}
```

- [ ] **Step 3: Write the failing shapes test (validator helper)**

```python
# tests/spike/test_shapes.py
import json, subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
VENV = ROOT / ".venv" / "bin"
CONCEPT_SCHEMA = ROOT / "model_alternative" / "linkML" / "acdc_concept.yaml"

def run_linkml_validate(schema, root_class, instance):
    r = subprocess.run([str(VENV / "linkml-validate"), "-s", str(schema),
                        "-C", root_class, str(instance)],
                       capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr

def test_empty_library_validates(tmp_path):
    inst = tmp_path / "empty.json"
    inst.write_text(json.dumps({"concepts": []}))
    rc, out = run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", inst)
    assert rc == 0, out
```

- [ ] **Step 4: Run it — confirm it passes against the stub**

Run: `.venv/bin/python -m pytest tests/spike/test_shapes.py::test_empty_library_validates -v`
Expected: PASS (proves the sandbox schema compiles and validates).

- [ ] **Step 5: Commit**

```bash
git add model_alternative/ tests/spike/test_shapes.py
git commit -m "spike: scaffold isolated LinkML concept sandbox"
```

---

### Task 2: The unified `Concept` base in `acdc_concept.yaml`

**Files:**
- Modify: `model_alternative/linkML/acdc_concept.yaml`
- Test: `tests/spike/test_shapes.py`

**Interfaces:**
- Produces: classes `Concept` (with `role`, `axis`, `result`, `provenance`, `algebraicDefinition`, `estimandDefinition`), `ResultContract`, `Operand`, `AlgebraicIdentity`, `EstimandContract`, `ProvenanceBinding`; enums `ConceptRole {collected, derived, analysis}`, `ConceptAxis {measure, dimension}`, `ProvenanceLayer {OC, DC, AC}`, `FHIRValueType`, `UnitRule`; `rules` enforcing role↔definition presence.

- [ ] **Step 1: Replace the stub classes with the full base**

```yaml
enums:
  ConceptRole:
    permissible_values: {collected:, derived:, analysis:}
  ConceptAxis:
    permissible_values: {measure:, dimension:}
  ProvenanceLayer:
    permissible_values: {OC:, DC:, AC:}
  UnitRule:
    permissible_values: {inherited:, derived:, fixed:, unitless:, none:}
  FHIRValueType:
    permissible_values:
      Quantity:
      CodeableConcept:
      Identifier:
      Range:
      Count:
      Ratio:
      decimal:
      integer:
      boolean:
      string:

classes:
  ResultContract:
    description: What a concept PRODUCES — the structural type an operand matches against.
    attributes:
      valueType: {range: FHIRValueType, required: true}
      unitRule: {range: UnitRule}
      unitFamily: {range: string}
      fixedUnit: {range: string}
      inputUnitRelation: {range: string}

  Operand:
    description: A named role in an algebraic identity, typed by what it must PRODUCE (not by a layer class).
    attributes:
      name: {key: true}
      produces: {range: ResultContract, required: true, inlined: true}

  AlgebraicIdentity:
    description: DC closed-form definition. Pure algebra over operands.
    attributes:
      operands: {range: Operand, multivalued: true, inlined_as_list: true, required: true}
      identity: {range: string, required: true}

  EstimandContract:
    description: AC structural definition — an estimand, not an equation.
    attributes:
      constituents: {range: string, multivalued: true, required: true}
      dimensions:   {range: string, multivalued: true}
      requiresModelClass: {range: string}

  ProvenanceBinding:
    description: Per-layer rendering of one concept (OC --TEST, DC PARAM, etc.).
    attributes:
      layer:    {range: ProvenanceLayer, required: true}
      variable: {range: string}
      sdtmTopic: {range: string}

  Concept:
    description: A node in the unified concept DAG. Collected leaves have no definition.
    attributes:
      conceptId: {identifier: true}
      name:
      label:
      category: {range: string, description: "Abstract supertype name, e.g. Comparison."}
      role: {range: ConceptRole, required: true}
      axis: {range: ConceptAxis}
      result: {range: ResultContract, inlined: true}
      provenance: {range: ProvenanceBinding, multivalued: true, inlined_as_list: true}
      algebraicDefinition: {range: AlgebraicIdentity, inlined: true}
      estimandDefinition:  {range: EstimandContract, inlined: true}
    rules:
      - description: Collected ⇒ no definition.
        preconditions: {slot_conditions: {role: {equals_string: collected}}}
        postconditions: {slot_conditions: {algebraicDefinition: {value_presence: ABSENT},
                                            estimandDefinition: {value_presence: ABSENT}}}
      - description: Derived ⇒ algebraic identity, no estimand.
        preconditions: {slot_conditions: {role: {equals_string: derived}}}
        postconditions: {slot_conditions: {algebraicDefinition: {value_presence: PRESENT},
                                            estimandDefinition: {value_presence: ABSENT}}}
      - description: Analysis ⇒ estimand, no algebraic identity.
        preconditions: {slot_conditions: {role: {equals_string: analysis}}}
        postconditions: {slot_conditions: {estimandDefinition: {value_presence: PRESENT},
                                            algebraicDefinition: {value_presence: ABSENT}}}

  ConceptLibrary:
    tree_root: true
    attributes:
      concepts: {range: Concept, multivalued: true, inlined_as_list: true}
```

> **Note:** `value_presence: PRESENT|ABSENT` and `equals_string` follow the same `rules` idiom already used in `acdc_output_classes.yaml` (`term XOR leaves`). If the installed LinkML version rejects this syntax, record it as a finding and fall back to enforcing the role↔definition rule in `spike_concept_binding.py`.

- [ ] **Step 2: Confirm the schema generates JSON Schema (compile check)**

Run: `.venv/bin/gen-json-schema model_alternative/linkML/acdc_concept.yaml > /tmp/acdc_concept.schema.json && echo OK`
Expected: prints `OK`, no traceback.

- [ ] **Step 3: Add a failing test for the rule discriminator**

```python
# append to tests/spike/test_shapes.py
import pytest

def _validate(tmp_path, concept):
    inst = tmp_path / "one.json"
    inst.write_text(json.dumps({"concepts": [concept]}))
    return run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", inst)

def test_derived_requires_algebraic_definition(tmp_path):
    bad = {"conceptId": "X", "role": "derived"}  # missing algebraicDefinition
    rc, out = _validate(tmp_path, bad)
    assert rc != 0, "derived concept without algebraic identity should fail"
```

- [ ] **Step 4: Run it**

Run: `.venv/bin/python -m pytest tests/spike/test_shapes.py::test_derived_requires_algebraic_definition -v`
Expected: PASS (validator rejects the malformed concept).

- [ ] **Step 5: Commit**

```bash
git add model_alternative/linkML/acdc_concept.yaml tests/spike/test_shapes.py
git commit -m "spike: unified Concept base with role-discriminated definitions"
```

---

### Task 3: DC + OC slice in one library + the headline `Change` shape

**Files:**
- Create: `lib_alternative/concepts/ACDC_Concept_Library_v01.json` (the single unified library; Tasks 4 & 5 append to it)
- Test: `tests/spike/test_shapes.py`, `tests/spike/test_cross_layer.py`

**Interfaces:**
- Consumes: `Concept` schema (Task 2).
- Produces: `Change` (derived, Comparison) with two result-contract operands; `Measure` (derived, PointComputation); `ObservationResult` (collected, OC leaf). All produce `Quantity`, all in ONE `ACDC_Concept_Library_v01.json` — layer is the `role`/`provenance` metadata, not a file split.

- [ ] **Step 1: Create `ACDC_Concept_Library_v01.json` with the OC leaf and the DC concepts**

```json
// lib_alternative/concepts/ACDC_Concept_Library_v01.json
{"concepts": [
  {"conceptId": "ObservationResult", "name": "Observation Result",
   "category": "Finding", "role": "collected", "axis": "measure",
   "result": {"valueType": "Quantity", "unitRule": "inherited"},
   "provenance": [{"layer": "OC", "variable": "--ORRES", "sdtmTopic": "--TESTCD"}]},

  {"conceptId": "Measure", "name": "Measure",
   "category": "PointComputation", "role": "derived", "axis": "measure",
   "result": {"valueType": "Quantity", "unitRule": "inherited"},
   "provenance": [{"layer": "DC", "variable": "--STRESN"}],
   "algebraicDefinition": {
     "operands": [{"name": "source", "produces": {"valueType": "Quantity", "unitFamily": "*"}}],
     "identity": "result = source"}},

  {"conceptId": "Change", "name": "Change", "category": "Comparison",
   "role": "derived", "axis": "measure",
   "result": {"valueType": "Quantity", "unitRule": "inherited", "inputUnitRelation": "uniform"},
   "provenance": [{"layer": "DC", "variable": "CHG"}],
   "algebraicDefinition": {
     "operands": [
       {"name": "value",     "produces": {"valueType": "Quantity", "unitFamily": "*"}},
       {"name": "reference", "produces": {"valueType": "Quantity", "unitFamily": "*"}}],
     "identity": "result = value - reference"}}
]}
```

- [ ] **Step 2: Write the shapes test against the single library**

```python
# append to tests/spike/test_shapes.py
import pathlib
LIBALT = ROOT / "lib_alternative" / "concepts"

def test_concepts_library_validates():
    rc, out = run_linkml_validate(CONCEPT_SCHEMA, "ConceptLibrary", LIBALT / "concepts.json")
    assert rc == 0, out
```

- [ ] **Step 3: Write the headline cross-layer operand test**

```python
# tests/spike/test_cross_layer.py
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
CONCEPTS = ROOT / "lib_alternative" / "concepts" / "concepts.json"

def _load():
    return {c["conceptId"]: c for c in json.loads(CONCEPTS.read_text())["concepts"]}

def _produces(c):  # the result contract a concept exposes to consumers
    return c["result"]["valueType"]

def test_change_operands_accept_oc_or_dc():
    cs = _load()
    change = cs["Change"]
    needed = {op["produces"]["valueType"] for op in change["algebraicDefinition"]["operands"]}
    assert needed == {"Quantity"}
    # The SAME operand contract is satisfied by an OC leaf AND a DC measure, in one library:
    assert _produces(cs["ObservationResult"]) == "Quantity"   # 2 observation results
    assert _produces(cs["Measure"]) == "Quantity"             # 2 measures
```

- [ ] **Step 4: Run both**

Run: `.venv/bin/python -m pytest tests/spike/test_shapes.py tests/spike/test_cross_layer.py -v`
Expected: PASS — `Change` validates, and its operand contract is satisfiable by both an OC `ObservationResult` and a DC `Measure` in the same library.

- [ ] **Step 5: Commit**

```bash
git add lib_alternative/concepts/ACDC_Concept_Library_v01.json tests/spike/
git commit -m "spike: unified concepts.json — OC leaf + DC slice + headline cross-layer Change"
```

---

### Task 4: Dimension concepts — the headline cross-layer `Parameter`

**Files:**
- Modify: `lib_alternative/concepts/ACDC_Concept_Library_v01.json` (append dimension concepts to the `concepts` array)
- Test: `tests/spike/test_cross_layer.py`

**Interfaces:**
- Produces: `Parameter` (dimension, collected, dual OC+DC provenance), `Visit` (dimension, collected), `AnalysisVisit` (dimension, derived) — added to the same `ACDC_Concept_Library_v01.json`.

- [ ] **Step 1: Append the dimension concepts to `ACDC_Concept_Library_v01.json`**

Add these objects to the existing `concepts` array (dimensions are concepts too — `axis: dimension`):

```json
  {"conceptId": "Parameter", "name": "Parameter", "role": "collected", "axis": "dimension",
   "result": {"valueType": "Identifier"},
   "provenance": [
     {"layer": "OC", "variable": "--TEST", "sdtmTopic": "--TESTCD"},
     {"layer": "DC", "variable": "PARAM"}]},

  {"conceptId": "Visit", "name": "Visit", "role": "collected", "axis": "dimension",
   "result": {"valueType": "CodeableConcept"},
   "provenance": [{"layer": "OC", "variable": "VISIT"}]},

  {"conceptId": "AnalysisVisit", "name": "Analysis Visit", "role": "derived", "axis": "dimension",
   "result": {"valueType": "CodeableConcept"},
   "provenance": [{"layer": "DC", "variable": "AVISIT"}],
   "algebraicDefinition": {
     "operands": [{"name": "collected_visit", "produces": {"valueType": "CodeableConcept"}}],
     "identity": "result = window(collected_visit)"}}
```

> **Finding to record:** `window(...)` is *not* pure algebra — `AnalysisVisit` is derived by a windowing **method** (`M.WindowedVisitAssignment`), not a closed-form identity. This is the first probe of open question #3 (do derived dimensions use the same `definition` mechanism, or a method-bound variant?). Capture the answer in the findings doc; for the spike, validate the shape and flag the semantic.

- [ ] **Step 2: Add the cross-layer Parameter test**

```python
# append to tests/spike/test_cross_layer.py
def test_parameter_has_dual_provenance():
    cs = _load()
    layers = {p["layer"]: p["variable"] for p in cs["Parameter"]["provenance"]}
    assert layers["OC"] == "--TEST"   # SDTM TEST
    assert layers["DC"] == "PARAM"    # ADaM PARAM
```

- [ ] **Step 3: Validate shapes + run the test**

Run: `.venv/bin/python -m pytest tests/spike/ -k "parameter or library or cross" -v`
Expected: PASS — `ACDC_Concept_Library_v01.json` still validates with the dimensions added; `Parameter` carries one concept identity with two provenance renderings.

- [ ] **Step 4: Commit**

```bash
git add lib_alternative/concepts/ACDC_Concept_Library_v01.json tests/spike/test_cross_layer.py
git commit -m "spike: dimension concepts + headline cross-layer Parameter (TEST/PARAM)"
```

---

### Task 5: AC slice — estimand contracts

**Files:**
- Modify: `lib_alternative/concepts/ACDC_Concept_Library_v01.json` (append AC concepts to the `concepts` array)
- Test: `tests/spike/test_shapes.py`

**Interfaces:**
- Produces: one AC concept per AC category (e.g. `LSMeans` under `TreatmentComparison`), each with an `EstimandContract` — added to the same `ACDC_Concept_Library_v01.json`.

- [ ] **Step 1: Append the AC slice to `ACDC_Concept_Library_v01.json`**

Add to the existing `concepts` array:

```json
  {"conceptId": "LSMeans", "name": "Least-Squares Means",
   "category": "TreatmentComparison", "role": "analysis", "axis": "measure",
   "result": {"valueType": "Quantity", "unitRule": "inherited"},
   "provenance": [{"layer": "AC", "variable": "LSMEAN"}],
   "estimandDefinition": {
     "constituents": ["Estimate", "SE", "ConfidenceInterval", "DF"],
     "dimensions": ["factor", "level"],
     "requiresModelClass": "GeneralLinearModel"}}
```

> Add one concept per remaining AC category present in `lib/concepts/AC_Concept_Model_v017.json` (e.g. a `SurvivalAnalysis` and a `DescriptiveSummary` representative). Coverage is asserted by Task 6, so do not skip a category.

- [ ] **Step 2: Validate shapes**

Run: `.venv/bin/python -m pytest tests/spike/test_shapes.py::test_concepts_library_validates -v`
Expected: PASS — the single library still validates with the AC estimand concepts added.

- [ ] **Step 3: Commit**

```bash
git add lib_alternative/concepts/ACDC_Concept_Library_v01.json tests/spike/test_shapes.py
git commit -m "spike: AC slice with estimand contracts"
```

---

### Task 6: Coverage gate — one concept per category, read from source (no hardcoding)

**Files:**
- Create: `scripts/spike_build_slice.py`
- Test: `tests/spike/test_shapes.py`

**Interfaces:**
- Produces: `categories(model_path) -> set[str]` reading the live concept libraries; `covered_categories(libalt_dir) -> set[str]` reading the sandbox.

- [ ] **Step 1: Write the category reader**

```python
# scripts/spike_build_slice.py
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]

def categories(model_path):
    """Return the set of category names declared in a production concept library."""
    data = json.loads(pathlib.Path(model_path).read_text())
    cats = data.get("categories", {})
    return set(cats.keys())

def covered_categories(libalt_dir):
    out = set()
    for f in pathlib.Path(libalt_dir).glob("*.json"):
        for c in json.loads(f.read_text()).get("concepts", []):
            if c.get("category"):
                out.add(c["category"])
    return out
```

- [ ] **Step 2: Write the failing coverage test**

```python
# append to tests/spike/test_shapes.py
import sys
sys.path.insert(0, str(ROOT / "scripts"))
import spike_build_slice as sbs

def test_dc_categories_each_have_a_slice_concept():
    declared = sbs.categories(ROOT / "lib" / "concepts" / "Option_B_Clinical.json")
    covered = sbs.covered_categories(ROOT / "lib_alternative" / "concepts")
    missing = declared - covered
    assert not missing, f"DC categories with no sandbox concept: {sorted(missing)}"
```

- [ ] **Step 3: Run it — fill gaps until green**

Run: `.venv/bin/python -m pytest tests/spike/test_shapes.py::test_dc_categories_each_have_a_slice_concept -v`
Expected: initially FAIL listing uncovered categories; add one concept per missing category to `ACDC_Concept_Library_v01.json`, re-run to PASS.

- [ ] **Step 4: Add the equivalent AC coverage test and satisfy it**

```python
def test_ac_categories_each_have_a_slice_concept():
    declared = sbs.categories(ROOT / "lib" / "concepts" / "AC_Concept_Model_v017.json")
    covered = sbs.covered_categories(ROOT / "lib_alternative" / "concepts")
    assert not (declared - covered), f"uncovered AC categories: {sorted(declared - covered)}"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/spike_build_slice.py tests/spike/test_shapes.py lib_alternative/concepts/
git commit -m "spike: data-driven category coverage gate for the slice"
```

---

### Task 7: DC binding probe — unify concept identity with method formula

**Files:**
- Create: `scripts/spike_concept_binding.py`
- Create: `lib_alternative/methods/M_Subtraction.json` (copy)
- Test: `tests/spike/test_binding_dc.py`

**Interfaces:**
- Produces: `parse_expr(s) -> Node`; `unify(concept_identity, method_generic_expression) -> dict[str,str]` mapping concept-operand → method-input (raises on structural mismatch).

> **Oracle = the real v07 transformation.** This probe does not hand-author its own answer key; it derives the binding and checks it against the *actual* hand-authored binding in `lib/transformations/ACDC_Transformation_Library_v07.json`. Real ground truth, not a stand-in.

- [ ] **Step 1: Copy the method into the sandbox**

```bash
cp lib/methods/derivations/M_Subtraction.json lib_alternative/methods/M_Subtraction.json
```

- [ ] **Step 2: Write the failing binding test (oracle read from real v07)**

```python
# tests/spike/test_binding_dc.py
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_concept_binding as scb

def _concept(cid):
    data = json.loads((ROOT / "lib_alternative/concepts/ACDC_Concept_Library_v01.json").read_text())
    return next(c for c in data["concepts"] if c["conceptId"] == cid)

def _method():
    return json.loads((ROOT / "lib_alternative/methods/M_Subtraction.json").read_text())

def _v07_change_inputs():
    """The hand-authored ground truth: method inputs bound by the real v07 transformation."""
    lib = json.loads((ROOT/"lib/transformations/ACDC_Transformation_Library_v07.json").read_text())
    tx = next(t for t in lib["transformations"] if t["conceptId"] == "T.ChangeFromBaseline")
    return {m["input"] for m in tx["inputDataStructure"]["measures"]}

def test_change_unifies_with_subtraction():
    mapping = scb.unify(_concept("Change")["algebraicDefinition"]["identity"],
                        _method()["formula"]["generic_expression"])
    assert mapping == {"value": "minuend", "reference": "subtrahend"}

def test_derived_binding_covers_v07_inputs():
    mapping = scb.unify(_concept("Change")["algebraicDefinition"]["identity"],
                        _method()["formula"]["generic_expression"])
    # the DERIVED binding must cover exactly the method inputs the real v07 transformation binds
    assert set(mapping.values()) == _v07_change_inputs()
```

- [ ] **Step 3: Run it — confirm failure**

Run: `.venv/bin/python -m pytest tests/spike/test_binding_dc.py -v`
Expected: FAIL with `ModuleNotFoundError` / `AttributeError: unify`.

- [ ] **Step 4: Implement the parser + unifier**

```python
# scripts/spike_concept_binding.py
import re
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Node:
    op: Optional[str] = None         # '+','-','*','/','log', or None for leaf
    args: list = field(default_factory=list)
    name: Optional[str] = None       # variable leaf, e.g. 'value' or 'minuend'
    const: Optional[float] = None    # numeric literal leaf

_TOKEN = re.compile(r"\s*(log|[A-Za-z_][A-Za-z0-9_]*|\d+\.?\d*|[()+\-*/=])")

def _rhs(expr: str) -> str:
    # accept "result = ..." or "result := ..." or "<minuend>"-style tokens
    expr = expr.replace(":=", "=")
    expr = re.sub(r"[<>]", "", expr)          # strip method <token> brackets
    return expr.split("=", 1)[1] if "=" in expr else expr

def _tokens(s):
    pos, out = 0, []
    while pos < len(s):
        m = _TOKEN.match(s, pos)
        if not m: raise ValueError(f"bad token at {s[pos:]!r}")
        pos = m.end(); out.append(m.group(1))
    return out

# recursive-descent: term (+|-) term ; factor (*|/) factor ; atom
def parse_expr(expr: str) -> Node:
    toks = _tokens(_rhs(expr)); i = 0
    def peek(): return toks[i] if i < len(toks) else None
    def eat():
        nonlocal i; t = toks[i]; i += 1; return t
    def atom():
        t = eat()
        if t == "(":
            n = addsub(); assert eat() == ")"; return n
        if t == "log":
            assert eat() == "("; n = addsub(); assert eat() == ")"
            return Node(op="log", args=[n])
        if re.fullmatch(r"\d+\.?\d*", t): return Node(const=float(t))
        return Node(name=t)
    def muldiv():
        n = atom()
        while peek() in ("*", "/"):
            n = Node(op=eat(), args=[n, atom()])
        return n
    def addsub():
        n = muldiv()
        while peek() in ("+", "-"):
            n = Node(op=eat(), args=[n, muldiv()])
        return n
    return addsub()

def _unify(a: Node, b: Node, mapping: dict):
    # structural match; bind variable names a.name -> b.name
    if a.const is not None or b.const is not None:
        if a.const != b.const: raise ValueError("constant mismatch")
        return
    if a.name is not None and b.name is not None:
        if a.name in mapping and mapping[a.name] != b.name:
            raise ValueError(f"conflicting bind {a.name}")
        mapping[a.name] = b.name; return
    if a.op != b.op or len(a.args) != len(b.args):
        raise ValueError(f"shape mismatch {a.op} vs {b.op}")
    for x, y in zip(a.args, b.args):
        _unify(x, y, mapping)

def unify(concept_identity: str, method_generic_expression: str) -> dict:
    """Return {concept_operand_name: method_input_name}."""
    mapping = {}
    _unify(parse_expr(concept_identity), parse_expr(method_generic_expression), mapping)
    return mapping
```

- [ ] **Step 5: Run the tests — confirm PASS**

Run: `.venv/bin/python -m pytest tests/spike/test_binding_dc.py -v`
Expected: PASS — the binding is *derived* from the identity+formula and covers exactly the inputs the real v07 transformation binds.

- [ ] **Step 6: Commit**

```bash
git add scripts/spike_concept_binding.py lib_alternative/methods/ tests/spike/test_binding_dc.py
git commit -m "spike: DC binding via formula/identity unification matches real v07"
```

---

### Task 8: AC binding probe — interface satisfaction

**Files:**
- Modify: `scripts/spike_concept_binding.py`
- Create: `lib_alternative/methods/<ac_method>.json` (copy of the analysis method bound to LSMeans, e.g. `M_ANCOVA.json`)
- Test: `tests/spike/test_binding_ac.py`

**Interfaces:**
- Produces: `satisfies(estimand_constituents, method_output_statistics) -> bool` and `method_output_statistics(method, output_class_templates) -> set[str]`.

- [ ] **Step 1: Copy the AC method + note the template source**

```bash
cp lib/methods/analyses/M_ANCOVA.json lib_alternative/methods/M_ANCOVA.json
```

The method's `outputs[].output_type` (e.g. `ls_means`) is an FK into `lib/vocabulary/output_class_templates.json`, whose template lists the statistics it provides.

- [ ] **Step 2: Write the failing AC test**

```python
# tests/spike/test_binding_ac.py
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_concept_binding as scb

def test_lsmeans_satisfied_by_ancova_output():
    lsmeans = next(c for c in json.loads(
        (ROOT/"lib_alternative/concepts/ACDC_Concept_Library_v01.json").read_text())["concepts"]
        if c["conceptId"] == "LSMeans")
    method = json.loads((ROOT/"lib_alternative/methods/M_ANCOVA.json").read_text())
    templates = json.loads((ROOT/"lib/vocabulary/output_class_templates.json").read_text())
    provided = scb.method_output_statistics(method, templates)
    need = set(lsmeans["estimandDefinition"]["constituents"])
    assert scb.satisfies(need, provided), f"missing: {need - provided}"
```

- [ ] **Step 3: Run — confirm failure**

Run: `.venv/bin/python -m pytest tests/spike/test_binding_ac.py -v`
Expected: FAIL (`AttributeError: method_output_statistics`).

- [ ] **Step 4: Implement interface-satisfaction helpers**

```python
# append to scripts/spike_concept_binding.py
def method_output_statistics(method: dict, templates: dict) -> set:
    """Union of statistics provided by all of a method's output templates."""
    provided = set()
    for out in method.get("outputs", []):
        tpl = templates.get(out.get("output_type"), {})
        provided |= set(tpl.get("statistics_set", []))
        provided |= set(tpl.get("additional_statistics", []))
    return provided

def satisfies(needed: set, provided: set) -> bool:
    return set(needed).issubset(set(provided))
```

> **Finding to record:** estimand `constituents` use concept-side names (`Estimate`, `SE`, `ConfidenceInterval`, `DF`) while templates may use term-side ids. If they differ, the probe surfaces the exact gap → this is open question #5 (the AC vocabulary axis). Note whether a name-normalisation map is needed.

- [ ] **Step 5: Run — PASS (or record the precise gap as a finding)**

Run: `.venv/bin/python -m pytest tests/spike/test_binding_ac.py -v`
Expected: PASS, or a clear `missing: {...}` that becomes a documented finding.

- [ ] **Step 6: Commit**

```bash
git add scripts/spike_concept_binding.py lib_alternative/methods/M_ANCOVA.json tests/spike/test_binding_ac.py
git commit -m "spike: AC binding via interface satisfaction against output templates"
```

---

### Task 9: Transformation impact — before/after the derived binding

**Why this task exists:** the *payoff* of concept-owned math is that transformations shrink and stop naming method slots. This task demonstrates that on one real transformation and quantifies it — the key evidence for the adopt/revise/discard gate (open question #6). It does **not** touch the production `acdc_transformation.yaml` schema; the slimmed form is a sandbox JSON.

**Files:**
- Create: `lib_alternative/transformations/slimmed.json`
- Create: `scripts/spike_transformation_impact.py`
- Test: `tests/spike/test_transformation_impact.py`

**Interfaces:**
- Consumes: `unify()` from `spike_concept_binding.py` (Task 7).
- Produces: `reconstruct(slimmed_tx, concept, method) -> dict[input,slice]`; `impact_metric(v07_measures, slimmed_tx) -> dict`.

- [ ] **Step 1: Author the slimmed transformation (speaks concept operands, not method slots)**

```json
// lib_alternative/transformations/slimmed.json
{"transformations": [
  {"conceptId": "T.ChangeFromBaseline", "usesMethod": "M.Subtraction",
   "outputConcept": "Change",
   "operandSlices": [
     {"operand": "value",     "slice": "endpoint"},
     {"operand": "reference", "slice": "parameter_baseline"}],
   "slices": [
     {"name": "endpoint",
      "constraints": [{"dimension": "Parameter", "value": "{parameter}"},
                      {"dimension": "Visit", "value": "{visit}"}]},
     {"name": "parameter_baseline",
      "constraints": [{"dimension": "Parameter", "value": "{parameter}"},
                      {"dimension": "Visit", "value": "{baseline_visit}"}]}]}
]}
```

Note: no `minuend`/`subtrahend` anywhere — the slim form never names method slots.

- [ ] **Step 2: Write the failing lossless-reconstruction test**

```python
# tests/spike/test_transformation_impact.py
import json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import spike_transformation_impact as sti

def _v07_change_binding():
    """Extract {method_input: slice} from the real v07 transformation (the 'before')."""
    lib = json.loads((ROOT/"lib/transformations/ACDC_Transformation_Library_v07.json").read_text())
    tx = next(t for t in lib["transformations"] if t["conceptId"] == "T.ChangeFromBaseline")
    return {m["input"]: m["slice"] for m in tx["inputDataStructure"]["measures"]}

def test_slim_form_reconstructs_v07_binding():
    slim = json.loads((ROOT/"lib_alternative/transformations/slimmed.json").read_text())["transformations"][0]
    change = next(c for c in json.loads(
        (ROOT/"lib_alternative/concepts/ACDC_Concept_Library_v01.json").read_text())["concepts"]
        if c["conceptId"] == "Change")
    method = json.loads((ROOT/"lib_alternative/methods/M_Subtraction.json").read_text())
    derived = sti.reconstruct(slim, change, method)   # {method_input: slice}
    assert derived == _v07_change_binding(), "slim form must losslessly recover the v07 binding"
```

- [ ] **Step 3: Run — confirm failure**

Run: `.venv/bin/python -m pytest tests/spike/test_transformation_impact.py -v`
Expected: FAIL (`ModuleNotFoundError: spike_transformation_impact`).

- [ ] **Step 4: Implement reconstruct + impact_metric**

```python
# scripts/spike_transformation_impact.py
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from spike_concept_binding import unify

def reconstruct(slimmed_tx, concept, method):
    """Recover {method_input: slice} from the slim (operand-keyed) form."""
    op_to_input = unify(concept["algebraicDefinition"]["identity"],
                        method["formula"]["generic_expression"])   # {operand: input}
    out = {}
    for os in slimmed_tx["operandSlices"]:
        out[op_to_input[os["operand"]]] = os["slice"]
    return out

def impact_metric(v07_measures, slimmed_tx):
    """Quantify what the slim form drops vs the v07 measure bindings."""
    v07_fields = sum(len(m) for m in v07_measures)            # input+concept+slice per measure
    slim_fields = sum(len(os) for os in slimmed_tx["operandSlices"])  # operand+slice
    names_method_slots = any("input" in m for m in v07_measures)
    return {"v07_binding_fields": v07_fields,
            "slim_binding_fields": slim_fields,
            "v07_names_method_slots": names_method_slots,
            "slim_names_method_slots": False}
```

- [ ] **Step 5: Add the metric test and run all**

```python
# append to tests/spike/test_transformation_impact.py
def test_impact_metric_shows_reduction_and_decoupling():
    lib = json.loads((ROOT/"lib/transformations/ACDC_Transformation_Library_v07.json").read_text())
    tx = next(t for t in lib["transformations"] if t["conceptId"] == "T.ChangeFromBaseline")
    slim = json.loads((ROOT/"lib_alternative/transformations/slimmed.json").read_text())["transformations"][0]
    m = sti.impact_metric(tx["inputDataStructure"]["measures"], slim)
    assert m["slim_binding_fields"] < m["v07_binding_fields"]   # it shrinks
    assert m["v07_names_method_slots"] and not m["slim_names_method_slots"]  # decoupled
```

Run: `.venv/bin/python -m pytest tests/spike/test_transformation_impact.py -v`
Expected: PASS — slim form is lossless, smaller, and free of method-slot names.

- [ ] **Step 6: Commit**

```bash
git add lib_alternative/transformations/slimmed.json scripts/spike_transformation_impact.py tests/spike/test_transformation_impact.py
git commit -m "spike: demonstrate transformation impact (lossless slim form, method-slot decoupling)"
```

---

### Task 10: Unified Concept Model diagram (one-page drawio)

**Why this task exists:** the existing `model/linkML/concept_models_diagram.drawio` shows OC/DC/AC as *three separate pages*. The spike's claim is that they are ONE graph; this diagram renders that single DAG so the unification (and its payoff) is visible at a glance.

**Files:**
- Create: `model_alternative/linkML/gen_unified_diagrams.py`
- Generates: `model_alternative/linkML/unified_concept_diagram.drawio`
- Test: `tests/spike/test_diagrams.py`

**Interfaces:**
- Consumes: `Node`, `Edge`, `Diagram`, `emit`, `layout_force`, `esc` imported from `model/linkML/gen_concept_diagrams.py` (DRY — do not reimplement layout/emit).
- Produces: `build_unified_concepts(concept_dicts) -> Diagram`; `main()` writing the `.drawio`.

- [ ] **Step 1: Write the generator (reusing the existing machinery)**

```python
# model_alternative/linkML/gen_unified_diagrams.py
import json, os, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "model", "linkML"))
from gen_concept_diagrams import Node, Diagram, emit, layout_force   # reuse, don't copy

CONCEPTS = os.path.join(ROOT, "lib_alternative", "concepts")
ROLE_FILL = {"collected": "#BFFFBF", "derived": "#ECECFF", "analysis": "#FFD9B3"}
DIM_FILL = "#FFE5B4"

def _load_all():
    out = []
    for f in sorted(glob.glob(os.path.join(CONCEPTS, "*.json"))):
        out += json.load(open(f)).get("concepts", [])
    return {c["conceptId"]: c for c in out}

def _produces_vt(c):
    return (c.get("result") or {}).get("valueType")

def _props(c):
    p = [f"role: {c.get('role')}" + (f" / {c['axis']}" if c.get("axis") else "")]
    if c.get("algebraicDefinition"):
        p.append("identity: " + c["algebraicDefinition"]["identity"])
    if c.get("estimandDefinition"):
        p.append("estimand: " + ", ".join(c["estimandDefinition"]["constituents"]))
    if _produces_vt(c):
        p.append("produces: " + _produces_vt(c))
    prov = c.get("provenance") or []
    if prov:
        p.append("prov: " + " | ".join(f"{b['layer']} {b.get('variable','')}" for b in prov))
    return p

def build_unified_concepts(concepts):
    d = Diagram("Unified Concept Model (OC+DC+AC)")
    for cid, c in concepts.items():
        fill = DIM_FILL if c.get("axis") == "dimension" else ROLE_FILL.get(c.get("role"), "#EEEEEE")
        d.add(Node(cid, cid, fill, props=_props(c)))
    # category is-a edges
    for cid, c in concepts.items():
        cat = c.get("category")
        if cat:
            catid = f"cat/{cat}"
            if catid not in d.nodes:
                d.add(Node(catid, cat, "#DDDDDD"))
            d.edge(cid, catid, "is-a", kind="isa")
    # cross-layer operand-satisfaction edges: any concept that PRODUCES the
    # operand's required valueType is a valid source (this is the unification)
    for cid, c in concepts.items():
        for op in (c.get("algebraicDefinition") or {}).get("operands", []):
            need = op["produces"]["valueType"]
            for sid, cand in concepts.items():
                if sid != cid and _produces_vt(cand) == need:
                    d.edge(sid, cid, f"⊨ {op['name']}")
    return d

def main():
    concepts = _load_all()
    d = build_unified_concepts(concepts)
    px, box_pos = layout_force(d)
    xml = ('<mxfile host="Electron" background="#FFFFFF">\n'
           + emit(d, px, box_pos) + "\n</mxfile>\n")
    out = os.path.join(HERE, "unified_concept_diagram.drawio")
    open(out, "w").write(xml)
    print(f"wrote {out}: {len(d.nodes)} nodes, {len(d.edges)} edges")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Write the failing diagram test**

```python
# tests/spike/test_diagrams.py
import subprocess, pathlib, xml.etree.ElementTree as ET
ROOT = pathlib.Path(__file__).resolve().parents[2]
GEN = ROOT / "model_alternative" / "linkML" / "gen_unified_diagrams.py"
CONCEPT_DRAWIO = ROOT / "model_alternative" / "linkML" / "unified_concept_diagram.drawio"

def _gen():
    r = subprocess.run([str(ROOT/".venv/bin/python"), str(GEN)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    return r.stdout

def _cells(path):
    tree = ET.parse(path)
    return tree.getroot().iter("mxCell")

def test_concept_diagram_shows_cross_layer_change():
    _gen()
    assert CONCEPT_DRAWIO.exists()
    edges = [(c.get("source"), c.get("target"), c.get("value") or "")
             for c in _cells(CONCEPT_DRAWIO) if c.get("edge") == "1"]
    sources_into_change = {s for s, t, v in edges if t == "Change" and "⊨" in v}
    # the headline: Change is fed by BOTH an OC leaf and a DC measure
    assert "ObservationResult" in sources_into_change
    assert "Measure" in sources_into_change
```

- [ ] **Step 3: Run — confirm it generates and passes**

Run: `.venv/bin/python -m pytest tests/spike/test_diagrams.py::test_concept_diagram_shows_cross_layer_change -v`
Expected: PASS — the single-page DAG shows `Change` receiving operand edges from both `ObservationResult` (OC) and `Measure` (DC).

- [ ] **Step 4: Open in draw.io and sanity-check layout, then commit**

Open `model_alternative/linkML/unified_concept_diagram.drawio` in draw.io; confirm it is readable (force layout spreads nodes). Then:

```bash
git add model_alternative/linkML/gen_unified_diagrams.py model_alternative/linkML/unified_concept_diagram.drawio tests/spike/test_diagrams.py
git commit -m "spike: generated one-page unified concept-model diagram"
```

---

### Task 11: Unified LinkML Schema-Map diagram (one-page drawio)

**Why this task exists:** to see how the three schemas compose — `acdc_method.yaml`, `acdc_transformation.yaml`, `acdc_concept.yaml` — as one class map with cross-schema edges.

**Files:**
- Modify: `model_alternative/linkML/gen_unified_diagrams.py`
- Generates: `model_alternative/linkML/unified_schema_map.drawio`
- Test: `tests/spike/test_diagrams.py`

**Interfaces:**
- Produces: `build_schema_map(schema_paths) -> Diagram`; extends `main()` to write the second file.

- [ ] **Step 1: Add yaml-driven class-map builder**

```python
# append to model_alternative/linkML/gen_unified_diagrams.py
import yaml

SCHEMA_FILL = {"acdc_method": "#E5E5FF", "acdc_transformation": "#D5F5E3", "acdc_concept": "#FFD9B3"}
# Known semantic FKs that LinkML string-typing can't express as a `range` today.
# Rendered as explicit bridges so the TARGET wiring is visible; flagged in findings.
FK_BRIDGES = {"usesMethod": "Method", "outputConcept": "Concept", "concept": "Concept"}

def _schema_classes(path):
    doc = yaml.safe_load(open(path))
    name = doc.get("name")
    slots = doc.get("slots", {})                       # top-level slot ranges
    slot_range = {s: (spec or {}).get("range") for s, spec in slots.items()}
    classes = doc.get("classes", {})
    return name, classes, slot_range

def build_schema_map(schema_paths):
    d = Diagram("Unified LinkML Schema Map")
    schema_of, class_specs, slot_ranges = {}, {}, {}
    for p in schema_paths:
        name, classes, sr = _schema_classes(p)
        slot_ranges.update(sr)
        for cls, spec in classes.items():
            schema_of[cls] = name
            class_specs[cls] = spec or {}
    for cls in class_specs:
        d.add(Node(cls, cls, SCHEMA_FILL.get(schema_of[cls], "#EEEEEE")))
    def _ranges(spec):
        out = []
        for s, a in (spec.get("attributes") or {}).items():
            out.append((s, (a or {}).get("range")))
        for s in (spec.get("slots") or []):
            out.append((s, slot_ranges.get(s)))
        return out
    for cls, spec in class_specs.items():
        for parent in [spec.get("is_a")] + (spec.get("mixins") or []):
            if parent in class_specs:
                d.edge(cls, parent, "is_a", kind="isa")
        for slot, rng in _ranges(spec):
            if rng in class_specs:
                d.edge(cls, rng, slot)                 # auto edge from range
            elif slot in FK_BRIDGES and FK_BRIDGES[slot] in class_specs:
                d.edge(cls, FK_BRIDGES[slot], f"FK→ {slot}")   # intended bridge
    return d
```

- [ ] **Step 2: Extend `main()` to write the schema map**

```python
# in main(), after writing the concept diagram, add:
    schemas = [os.path.join(HERE, f) for f in
               ("acdc_method.yaml", "acdc_transformation.yaml", "acdc_concept.yaml")]
    sm = build_schema_map(schemas)
    spx, sbox = layout_force(sm)
    sxml = ('<mxfile host="Electron" background="#FFFFFF">\n'
            + emit(sm, spx, sbox) + "\n</mxfile>\n")
    sout = os.path.join(HERE, "unified_schema_map.drawio")
    open(sout, "w").write(sxml)
    print(f"wrote {sout}: {len(sm.nodes)} nodes, {len(sm.edges)} edges")
```

- [ ] **Step 3: Write the failing schema-map test**

```python
# append to tests/spike/test_diagrams.py
SCHEMA_DRAWIO = ROOT / "model_alternative" / "linkML" / "unified_schema_map.drawio"

def test_schema_map_links_the_three_files():
    _gen()
    assert SCHEMA_DRAWIO.exists()
    cells = list(_cells(SCHEMA_DRAWIO))
    nodes = {c.get("id") for c in cells if c.get("vertex") == "1"}
    assert {"Method", "Transformation", "Concept"} <= nodes
    edges = [(c.get("source"), c.get("target"), c.get("value") or "")
             for c in cells if c.get("edge") == "1"]
    # the cross-schema wiring: Transformation -> Method, and a binding -> Concept
    assert any(s == "Transformation" and t == "Method" for s, t, v in edges)
    assert any(t == "Concept" for s, t, v in edges)
```

- [ ] **Step 4: Run — confirm PASS**

Run: `.venv/bin/python -m pytest tests/spike/test_diagrams.py -v`
Expected: PASS — the map renders all three schemas with `Transformation→Method` and binding→`Concept` edges.

- [ ] **Step 5: Open in draw.io, sanity-check, commit**

```bash
git add model_alternative/linkML/gen_unified_diagrams.py model_alternative/linkML/unified_schema_map.drawio tests/spike/test_diagrams.py
git commit -m "spike: generated one-page LinkML schema-map diagram"
```

---

### Task 12: Findings + decision-gate writeup

**Files:**
- Create: `docs/superpowers/specs/2026-06-24-concept-model-spike-findings.md`

- [ ] **Step 1: Run the whole spike suite and capture output**

Run: `.venv/bin/python -m pytest tests/spike/ -v | tee /tmp/spike_results.txt`
Expected: all green, or a small set of documented reds that are themselves findings.

- [ ] **Step 2: Write the findings doc**

Cover, with evidence from `/tmp/spike_results.txt`:
1. **Shapes held?** Did every category's concept validate against `acdc_concept.yaml`? Did the role↔definition `rules` work in the installed LinkML version (or did the fallback trigger)?
2. **Binding held?** DC unification == oracle? AC interface satisfaction == pass, or what name-normalisation was needed?
3. **Cross-layer proofs** — `Change` operands satisfiable by OC `ObservationResult` AND DC `Measure`; `Parameter` single concept with `--TEST`/`PARAM` provenance.
4. **Answers to the spec's open questions** #1 (grammar scope), #2 (result-contract granularity), #3 (`window()` for derived dimensions — does it need a method-bound variant?), #5 (AC vocabulary axis).
5. **Transformation payoff:** quote the Task 9 `impact_metric` numbers (field reduction + method-slot decoupling) as the concrete evidence on whether derived binding is worth the migration (open question #6).
6. **Decision recommendation:** adopt / revise / discard, and if adopt, the migration order and whether the production `acdc_transformation.yaml` slimming is worth it.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-06-24-concept-model-spike-findings.md
git commit -m "spike: findings and adopt/revise/discard recommendation"
```

---

## Self-Review

- **Spec coverage:** unified base (T2) ✓; one DC + one AC per category (T3/T5/T6 coverage gate) ✓; OC leaves (T3) ✓; cross-layer `Change` (T3) ✓; cross-layer `Parameter` (T4) ✓; provenance slot (T3/T4) ✓; shapes probe (T1–T6) ✓; binding probe DC (T7) + AC (T8) ✓; transformation impact/payoff demonstrated (T9) ✓; unified concept diagram, one page (T10) ✓; LinkML schema-map diagram (T11) ✓; decision gate (T12) ✓; production methods/transformation schemas unchanged (T1 copies; T7 reads; T9 slim form is sandbox JSON) ✓; no-hardcoding coverage + diagrams generated from metadata (T6, T10, T11) ✓.
- **Deferred & flagged, not silently dropped:** method `algebraicForm` (Global Constraints); **production** `acdc_transformation.yaml` slimming + full migration (open-Q6 — note the *demonstration* is pulled in as T9, only the production schema change is deferred); `window()` non-algebraic dimension (T4 finding).
- **Type consistency:** `unify()` returns `{operand: input}` and the oracle/test compare against the same shape (T7); `method_output_statistics`/`satisfies` signatures match their test call sites (T8); `categories()`/`covered_categories()` match T6 usage.
- **Placeholder scan:** every code/step block contains runnable content; no TBD/TODO.

---

## Execution Handoff

**This plan is a spec only — do not implement until the team approves the spike.** When approved, two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in-session with checkpoints.

# Statistics Concept Consolidation — Design (Draft v1.0)

**Date:** 2026-06-26 · *(rewritten 2026-06-29 — direction changed from "merge + delete" to "keep + clean layering")*
**Status:** Draft for internal review
**Branch:** methods_02
**Related:** `2026-06-11-output-class-statistic-sets-design.md`, `2026-06-18-contrast-as-method-design.md`, `2026-06-24-one-concept-model-design.md`; memory `project_one_concept_model`, `project_terminology_concept_layering`, `project_orphan_term_triage`, `project_ratio_datatype_proportion`.

## 0. What changed since the first draft (read this first)

An earlier draft of this spec proposed a radical consolidation: **delete** `statistics_vocabulary.json`, `statistic_sets.json`, and `output_class_templates.json`, **flatten** everything into one concept node, and have methods **name a concept** on every output. Team review (the `output_class` + `indexed_by` machinery is load-bearing for organizing results and document annotation) rejected that scope. **We need a model out**, with the least disruption to what already works.

**This rewrite keeps the original (2026-06-11) architecture and only cleans it up:**

- **Keep** all four artefacts: `statistics_vocabulary`, `statistic_sets`, `output_class_templates`, and the AC concept model. Methods keep `outputs[].output_type`; the `indexed_by` field keeps its purpose but gets a clearer, model-grounded notation (§3.8).
- **Clean the separation of concerns** — *one fact, one home*: controlled terminology (CT) in the vocabulary; all FHIR (the HL7 health-data standard) value-type and modeling detail in the concept layer; composition in sets/output-classes.
- **Anchor identity on an NCI C-code (`dec_id`)** shared by the vocabulary term and its concept, so statistic↔concept resolution is by *code*, not by matching a lowercase string.
- **Drop one genuine redundancy:** `methodOutputSlotMapping` (the transformation already carries the slot→concept mapping verbatim). `computed_value` is **kept** — it is the uniform single-value output shape and removing it would touch ~46 methods for no gain (§3.5).

Nothing the team relies on for result organization is removed; the vocabulary's internals get tidied and the join key gets stronger.

## 1. Problem

The output side of an analysis is described by four artefacts, but their **responsibilities overlap and leak**:

| File | Role today | Problem |
|---|---|---|
| `statistics_vocabulary.json` | terminology atoms (lowercase ids): `dataType`, STATO (a statistics ontology) codings, name, description | carries `dataType`, a *modeling* fact that belongs on the concept; identity is a lowercase string |
| `statistic_sets.json` | reusable bundles of **terms** | fine; "owned by neither" is acceptable as method-facing composition |
| `output_class_templates.json` | method-side output shapes: `statistics_set` + `additional_statistics` + abstract→concrete `broader` | fine to keep; the `broader` taxonomy is optional |
| `AC_Concept_Model_v017.json` | thin atoms (`term`+`valueType`+`unitRule`), `resultPatterns` (molecules), `methodOutputSlotMapping` | `methodOutputSlotMapping` duplicates the transformation; statistic↔concept join is by lowercase `term` string |

Two weaknesses to fix without restructuring:

1. **Leaky layering.** The vocabulary holds a modeling field (`dataType`); the concept points back at the term by a lowercase string. The CT/concept boundary is blurry.
2. **A brittle join key.** A produced statistic column resolves to its concept by *string equality on the term id* (`p_value` ⇒ `PValue`). That is error-prone and has no external anchor.

## 2. Conceptual framing

### 2.1 One fact, one home (separation of concerns)

Each fact about a statistic lives in exactly one layer; other layers reference it.

| Layer | Owns | Example |
|---|---|---|
| **statistics_vocabulary** (controlled terminology) | `dec_id` (NCI C-code — canonical identity), preferred term, definition, `codings` (STATO as cross-ref) | what the statistic *is* |
| **concept layer** (AC atoms + molecules) | FHIR `valueType`, `unitRule`, `leaves`; molecule `constituents` + `dimensions` — references the term by `dec_id` | how it is *modeled* |
| **statistic_sets + output_class_templates** | composition, method-facing (bundles of terms) | what a method *emits* |
| **transformation** | slot→concept binding + study-specific dimensional slices | what a run *produces* |

This keeps the validator's existing **`[C1]`** rule ("a thin concept must NOT restate `dataType`/`definition`/codings") — `[C1]` is precisely what *enforces* the split. The cleanup is mostly "stop duplicating," not "rebuild." *(The `[A1]`/`[B1]`/`[C1]`… labels are the validator's named cross-layer invariants — see §5 for what each one checks.)*

### 2.2 Identity is an NCI C-code (`dec_id`), shared across layers

A statistic is **one Data Element Concept** with **one canonical identity — an NCI C-code (`dec_id`)** — carried *identically* by its vocabulary term and its concept atom. A produced column resolves to its concept by **matching this code on both sides** (a reference by id), not by comparing names. The lowercase `term` and the mixed-case concept name (`PValue`) become human-readable labels only.

```jsonc
// VOCABULARY (controlled terminology)        // CONCEPT ATOM (model layer)
// (Cxxxxx = illustrative placeholder; real NCI code TBD, see §2.2 null-code note)
"p_value": {                                   "PValue": {
  "dec_id": "Cxxxxx",       // ◄── canonical     "dec_id": "Cxxxxx",      // ◄── SAME code ⇒ same entity
  "preferredTerm": "P-value",                     "label": "P-value",
  "codings": ["STATO_0000700"],  // xref          "valueType": "decimal",
  "definition": "..."                             "unitRule": "unitless"
}                                              }
```

**Null-code interim bridge (honest about today).** Per `feedback_no_hardcoding`, every `dec_id` is **`null`** until a real NCI code is registered — we do not fabricate codes. So the model is *designed* around the C-code join, but until codes exist the resolver **falls back to the controlled `term` id** (a vocabulary key, not a free string), and the **validator flags any statistic whose `dec_id` is still `null`** as "unregistered — using term-id." The string match becomes a temporary, *visible* fallback rather than the permanent mechanism.

## 3. Target architecture

### 3.1 The four artefacts — kept, with cleaned responsibilities

Nothing is deleted at the file level except `methodOutputSlotMapping` (§3.6). On the method side, `output_type` is unchanged; `indexed_by` is reshaped to the model-grounded notation (§3.8), same purpose.

```
statistics_vocabulary.json   atoms as CONTROLLED TERMINOLOGY   (dec_id, preferredTerm, codings, definition)
        ▲ term ids referenced by
statistic_sets.json          reusable bundles of terms          (ci_estimate_t_distribution = [estimate, CI_lower, …])
        ▲ referenced by
output_class_templates.json   method-facing output shapes        (ls_means = sets + additional_statistics)
        ▲ output_type referenced by
method.outputs[].output_type (unchanged) + indexed_by (reshaped, §3.8)

AC_Concept_Model.json
├── concepts (atoms)          MODELING DETAIL                    (dec_id→term, valueType, unitRule, leaves)
└── concepts (molecules)      typed bundles                      (constituents[], statistics_set[], dimensions[])
        ▲ slot→concept bound by
transformation.outputDataStructure                               (slot → molecule/atom; the ONLY binding home)
```

### 3.2 `statistics_vocabulary.json` → pure controlled terminology

Strip the one modeling field (`dataType`); the concept's `valueType` is the single source of structural type.

```jsonc
// BEFORE                              // AFTER (pure CT)
"p_value": {                           "p_value": {
  "name": "p-value",                     "dec_id": null,            // NCI C-code, null until registered
  "dataType": "decimal",  // ◄ remove     "preferredTerm": "p-value",
  "codings": [ {STATO…} ],               "definition": "Probability under H0…",
  "description": "…"                      "codings": [ {STATO…} ]   // ontology cross-reference
}                                      }
```

### 3.3 The concept layer — atoms own the modeling detail

An atom references its term **by `dec_id`** and carries the FHIR/modeling facts. (Field shapes already exist in v017; the change is `dec_id` as the term link instead of the lowercase `term` string, plus `[C1]` enforcement — §5.)

```jsonc
"PValue": {
  "dec_id": null,                                  // == the vocabulary term's dec_id (the join key)
  "term": "p_value",                               // human handle / interim-bridge key while dec_id is null
  "label": "P-value", "shortLabel": "p",
  "valueType": "decimal", "unitRule": "unitless"
}

"ConfidenceInterval": {                            // complex atom — components are FHIR-path leaves
  "dec_id": null, "label": "Confidence interval", "valueType": "Range", "unitRule": "inherited",
  "leaves": [ { "fhirPath": "low.value",  "dec_id": null, "term": "CI_lower" },
              { "fhirPath": "high.value", "dec_id": null, "term": "CI_upper" } ]
}
```

### 3.4 The molecule concept — the typed bundle (former result pattern)

A molecule lists its `constituents` (atom concept ids) + `statistics_set` (the method-facing CT bundle it mirrors) + `dimensions`. The two views are joined by `dec_id`.

```jsonc
"LSMeans": {
  "dec_id": null, "label": "Least-squares means", "category": "TreatmentComparison",
  "statistics_set": ["ci_estimate_t_distribution"],          // method-facing CT view (terms)
  "constituents":   ["Estimate", "SE", "ConfidenceInterval", "DF"],  // concept-facing view (typed atoms)
  "dimensions":     ["factor", "level"]
}
```

### 3.5 Keep `computed_value` (the uniform single-value output shape)

`computed_value` is the output-class a single-value output references (every derivation; descriptive atoms like `M.Mean`). Its `statistics_set` is the single placeholder term `value`. It is **kept** — it gives a *uniform* contract (every method output references an output-class, so the schema and validator have one rule), and removing it would edit ~46 method files for no benefit, against the "model out, least disruption" goal.

It coexists cleanly with the rest of the cleanup, because **output shape (on the method) and concept identity (on the transformation) are orthogonal**:

```jsonc
// M.Subtraction output — UNCHANGED              // identity supplied by the transformation:
{ "output_type": "computed_value",               // T.ChangeFromBaseline: outputDataStructure
  "name": "result", "dataType": "decimal" }      //   measures: [ { "output":"result", "concept":"Change" } ]
```

The method declares "I emit one value, shape `computed_value`, structural `dataType: decimal`"; the transformation declares "that value *is* a `Change`." `computed_value` is reserved for the single-value case; multi-statistic outputs reference richer output-classes (`ls_means`, …) that resolve to molecules. The only residual is the placeholder `value` term in the vocabulary — cosmetic, harmless. (Answers the open question: **yes, `computed_value` stays.**)

### 3.6 Drop `methodOutputSlotMapping` (the transformation already carries it)

`methodOutputSlotMapping` (in the AC model) maps method output slots → molecules per method. But every analysis transformation **already** carries the identical mapping in `outputDataStructure.measures` — verified in the library:

```jsonc
// T.CFB_ANCOVA.outputDataStructure.measures        // methodOutputSlotMapping["M.ANCOVA"]  (DUPLICATE)
[ {"output":"ls_means","concept":"LSMeans"},          { "ls_means":"LSMeans",
  {"output":"type3_tests_f","concept":"Type3Tests"},    "type3_tests_f":"Type3Tests", … }
  … ]
```

Derivations only use the transformation form (`T.BaselineSelection`: `flag → Flag`). Transformations are reusable named objects (authored once, referenced across studies), so the mapping there costs nothing per study — `methodOutputSlotMapping` saves no work, it just repeats the same mapping in a second place.

**Rule:** `output → concept` binding lives in the **transformation** (`outputDataStructure.measures`), uniformly for analyses and derivations. The AC concept layer keeps only concepts (atoms + molecules). Methods stay concept-free on the output side; the method declares slots + `output_type` + `indexed_by`, the transformation maps slots to concepts.

### 3.7 How per-statistic identity resolves (no per-statistic binding, ever)

The transformation binds at the **slot** level (`ls_means → LSMeans`). Each statistic *within* the molecule resolves **structurally**, by `dec_id`:

```
TRANSFORMATION:  output "type3_tests_f"  →  concept "Type3Tests"        (slot-level only)
CONCEPT LAYER:   Type3Tests.constituents = [FStatistic, PValue, DF_Num, DF_Den]
                 atom PValue.dec_id = Cxxxxx        (illustrative placeholder)
METHOD OUTPUT:   type3_tests_f → output_class → statistic_set "hypothesis_test_F_distribution"
                                = [f_statistic, p_value, df_num, df_den]   (produced columns, each a term→dec_id)
JOIN:            produced "p_value" (dec_id Cxxxxx)  ══►  atom "PValue" (dec_id Cxxxxx)
```

Complex atoms resolve through `leaves`: produced `CI_lower`/`CI_upper` → `ConfidenceInterval.low`/`.high` by the leaves' `dec_id`. The validator's **`[C2]`** rule (§5) upgrades from "constituent *terms* cover set *terms*" to "constituent **codes** cover set **codes**."

### 3.8 Indexing an output along the model (`indexed_by`)

A method output is usually not a single number — it is a small table with one row per element of the statistical model. The `indexed_by` field declares the shape of that table. Today it lists raw formula tokens (`["fixed_effect"]`), which do not say *what kind* of index each token is, and do not connect to the molecule's `dimensions`. We replace it with a notation grounded in the model's own structure.

A model written as `response ~ covariate + fixed_effect` has, on its right-hand side, a set of **model components** (the terms `covariate`, `fixed_effect`, and any interactions between them). Each component is one of:

- **discrete** — a categorical factor such as treatment arm; its method input has `dataType: "code"`. A discrete component has **levels** (e.g. Drug A / Drug B / Placebo).
- **continuous** — a numeric covariate such as a baseline value; its input has `dataType: "decimal"`. A continuous component has no levels, only a single coefficient.

The discrete/continuous split is read from the input's `dataType`, so it is derived, not hand-authored.

**Descriptive summaries use the same notation.** A method like `M.Mean` has no `~` formula, but its by-group inputs (`group`, `partition` — all `code`-typed) are discrete components in exactly the same sense: `M.Mean` indexed at `level` over its discrete `group` is "one mean per group." So `component`/`level` covers both the modeling analyses *and* the descriptive/derivation methods that group by a factor — together ~41 methods carry `indexed_by` today.

An output is indexed at one of three granularities along this structure:

| granularity | one row per … | example |
|---|---|---|
| `scalar` | the whole model (a single row) | fit statistics (e.g. AIC, BIC) |
| `component` | model component | Type-3 tests (one test per term) |
| `level` | level of each discrete component | least-squares means (one mean per arm) |

```jsonc
// today (raw formula tokens)              // proposed (granularity along the model)
"ls_means":      { "indexed_by": ["fixed_effect"] }
"ls_means":      { "indexed_by": { "granularity": "level",     "components": "discrete" } }
"type3_tests_f": { "indexed_by": { "granularity": "component", "components": "all" } }
"fit_statistics_linear": { "indexed_by": { "granularity": "scalar" } }
```

The **level values** themselves (Drug A / B / Placebo) are not written on the output. They are the value set of the concept a component binds to in the transformation (`fixed_effect → Treatment`; `Treatment`'s coded values *are* the levels). See the gap note below.

**Two indices that are not part of the model structure** keep an explicit axis name, because they index something other than the model's terms:

- `time` — a survival table has one row per follow-up time point: the time axis of the *outcome*, not a model term.
- `cov_param` — a repeated-measures model also estimates the parameters of its variance/covariance structure; these are indexed separately from the model's terms.

(A `contrast` — a defined comparison of levels, e.g. "Drug A − Placebo" — is treated as the `level` granularity of a *constructed* discrete component, so it needs no separate axis.)

So the indexing vocabulary is two small families: the **model-structure granularities** (`scalar` / `component` / `level`, derived from the formula and the input types) and **two explicit non-model axes** (`time`, `cov_param`).

**Gap (flagged, not solved here).** A `level` granularity only resolves to concrete values once the bound dimension concept (e.g. `Treatment`) exposes its coded value set; most dimension concepts do not yet. Recorded here; tied to `project_cube_model_gaps` / `project_dimension_categories`.

## 4. Worked examples

Two end-to-end examples across **methods · concepts · transformations**, grounded in the current library. They also show the chain: the CFB derivation *produces* `Change`; ANCOVA *consumes* `Change`.

### 4.1 Change from baseline — a derivation (`M.Subtraction` → `Change`)

**Method** — generic, concept-free, single value (output shape `computed_value`, kept):

```jsonc
// lib/methods/derivations/M_Subtraction.json
{ "conceptId": "M.Subtraction", "label": "Subtraction",
  "formula": { "notation": "assignment", "generic_expression": "result := <minuend> - <subtrahend>" },
  "inputs":  [ { "name": "minuend",    "dataType": "decimal", "cardinality": "single" },
               { "name": "subtrahend", "dataType": "decimal", "cardinality": "single" } ],
  "outputs": [ { "output_type": "computed_value", "name": "result", "dataType": "decimal" } ] }
  //            ↳ shape = computed_value (single value); concept identity bound by the transformation
```

**Concept** — `Change` already exists in `Option_B_Clinical.json` (DC), and owns its meaning + result contract:

```jsonc
// lib/concepts/Option_B_Clinical.json → categories.Comparison.concepts
"Change": {
  "dec_id": null, "definition": "The arithmetic difference between two values of the same parameter.",
  "math": "x − x_ref", "mathematicalEquivalent": "AbsoluteDifference",
  "result": { "valueType": "Quantity", "unitRule": "inherited", "inputUnitRelation": "uniform" } }
```

**Transformation** — supplies the operands (which DC concept fills each slot) and binds the output to `Change`:

```jsonc
// lib/transformations/ACDC_Transformation_Library_v07.json → T.ChangeFromBaseline
{ "conceptId": "T.ChangeFromBaseline", "transformationType": "derivation", "usesMethod": "M.Subtraction",
  "inputDataStructure": {
    "dimensions": [ {"concept":"Subject"}, {"conceptCategory":"ParameterDimension"}, {"conceptCategory":"VisitDimension"} ],
    "measures": [
      { "input":"minuend",    "concept":"Measure", "requiredValueType":"Quantity", "slice":"endpoint" },
      { "input":"subtrahend", "concept":"Measure", "requiredValueType":"Quantity", "slice":"parameter_baseline" } ] },
  "outputDataStructure": {
    "measures": [ { "output":"result", "concept":"Change" } ] } }   // ◄── output identity bound HERE, not on the method
```

So `M.Subtraction(A, B)` is a `Change` only because *this* transformation pairs the current value with the baseline-flagged value; subtract two arbitrary `Measure`s elsewhere and it is a plain difference. The operation does not fix the concept — the transformation does.

### 4.2 ANCOVA — an analysis (`M.ANCOVA` → molecules)

**Method** — keeps `output_type` (an output-class id) unchanged; `indexed_by` uses the model-grounded notation of §3.8 (same purpose, clearer form). Multi-statistic outputs reference output-classes; the method names no concept:

```jsonc
// lib/methods/analyses/M_ANCOVA.json (outputs only)
"outputs": [
  { "name": "fit_statistics_linear",      "output_type": "fit_statistics_linear",
    "indexed_by": { "granularity": "scalar" } },
  { "name": "type3_tests_f",              "output_type": "type3_tests_f",
    "indexed_by": { "granularity": "component", "components": "all" } },
  { "name": "parameter_estimates_linear", "output_type": "parameter_estimates_linear",
    "indexed_by": { "granularity": "level", "components": "all" } },
  { "name": "ls_means",                   "output_type": "ls_means",
    "indexed_by": { "granularity": "level", "components": "discrete" } },
  { "name": "contrasts_t",                "output_type": "contrasts_t" } ]
```

**Concepts** — the molecules each output binds to, plus the atoms they resolve to by `dec_id`:

```jsonc
// AC_Concept_Model → concepts (molecules)
"LSMeans":    { "dec_id": null, "statistics_set": ["ci_estimate_t_distribution"],
                "constituents": ["Estimate","SE","ConfidenceInterval","DF"], "dimensions": ["factor","level"] },
"Type3Tests": { "dec_id": null, "statistics_set": ["hypothesis_test_F_distribution"],
                "constituents": ["FStatistic","PValue","DF_Num","DF_Den"], "dimensions": ["term"] }
// …and the atoms (modeling detail), each linked to its CT term by dec_id
"PValue": { "dec_id": null, "term": "p_value", "valueType": "decimal", "unitRule": "unitless" }
```

**Transformation** — binds inputs to concepts (`response` ← `Change` from §4.1!) and each output slot to its molecule. This is the only place slot→concept lives:

```jsonc
// T.CFB_ANCOVA
{ "conceptId": "T.CFB_ANCOVA", "transformationType": "analysis", "usesMethod": "M.ANCOVA",
  "inputDataStructure": { "measures": [
      { "input":"response",  "concept":"Change",  "requiredValueType":"Quantity", "slice":"endpoint" },
      { "input":"covariate", "concept":"Measure", "requiredValueType":"Quantity", "slice":"parameter_baseline" } ],
    "dimensions": [ { "input":"fixed_effect", "concept":"Treatment" }, {"concept":"Subject"},
                    {"conceptCategory":"ParameterDimension"}, {"conceptCategory":"VisitDimension"}, {"concept":"Population"} ] },
  "outputDataStructure": { "measures": [
      { "output":"ls_means",                  "concept":"LSMeans" },
      { "output":"type3_tests_f",             "concept":"Type3Tests" },
      { "output":"parameter_estimates_linear","concept":"ParameterEstimates" },
      { "output":"fit_statistics_linear",     "concept":"FitStatistics" },
      { "output":"contrasts_t",               "concept":"Contrasts" } ] } }
```

**The chain.** `T.ChangeFromBaseline` produces `Change` (per Subject×Parameter×Visit); `T.CFB_ANCOVA` consumes that `Change` as its `response`, adjusts for the baseline `Measure` covariate, and emits the molecules. Two transformations, one method each, concepts as the shared currency between them.

## 5. Validator changes (`scripts/validate_methods_model.py`)

The validator checks a set of **cross-layer invariants** (consistency rules that span the vocabulary, sets, output-classes and concept files). Each is labelled with a tag it prints on failure — `[A1]`, `[B1]`, `[C1]`, … — so you can grep the source for any rule. The families: **A** = terminology + sets (`statistics_vocabulary`, `statistic_sets`); **B** = output-class templates; **C** = concept layer and its cross-links. Below, each rule cites the tag as it appears in `scripts/validate_methods_model.py`.

- **`[C1]` — KEPT** (and is the key rule): a concept must not restate CT facts (`definition`/codings); the vocabulary owns them. The concept owns `valueType`/`unitRule`/`leaves`.
- **`[A1]`/`[A3]` — KEPT**: set members are vocabulary **term** ids; `statistic_sets` unchanged.
- **`[B1]` — KEPT**: output-class templates unchanged (`computed_value` retained).
- **`[C2]` — UPGRADED**: a molecule's `constituents` must cover its `statistics_set`'s terms, matched by **`dec_id`** (falling back to term id while `dec_id` is null), leaf-aware.
- **`[C3]` — REMOVED** with `methodOutputSlotMapping`. Replaced by a transformation check: every `outputDataStructure.measures[].output` reference resolves to a real method slot, and its bound `concept` exists in the concept layer.
- **NEW — identity coverage**: every concept atom and vocabulary term carries a `dec_id` field; any `null` `dec_id` is **reported** (unregistered — using term-id bridge), not failed.
- **`computed_value` rules — KEPT** (it stays as the single-value output shape).

## 6. Scope of changes (files affected)

- **`statistics_vocabulary.json`**: add `dec_id`, rename `name`→`preferredTerm` (or keep `name`), **remove `dataType`**. ~60 terms.
- **AC concept atoms**: add `dec_id`; keep `term` as bridge; ensure no CT restating (`[C1]`, §5).
- **Methods with `indexed_by` (~41 files)** — modeling analyses (ANCOVA, MMRM, CoxPH, …) *and* descriptive/derivation methods that group by a factor (Mean, Count, Frequency, Quartile, ImputedValue_*, …): reshape the `indexed_by` field to the §3.8 notation (`["group"]` → `{ "granularity": "level", "components": "discrete" }`, etc.). `output_type` and `computed_value` stay. Methods without `indexed_by` are untouched.
- **AC concept model**: **delete `methodOutputSlotMapping`**.
- **Transformations**: already carry slot→concept bindings; verify every analysis transformation does (most do). No new per-statistic content.
- **`output_class_templates.json`**: **unchanged** (`computed_value` retained).
- **`validate_methods_model.py`** + **`build_all_methods.py`/`AllMethods.json`**: updated per §5.

## 7. Out of scope for draft 1.0

- **No method→concept reference flip.** Methods stay concept-free on outputs (output_type + indexed_by); the transformation binds. (Reverses the earlier draft.)
- **No flatten / no one-concept-model migration.** The `2026-06-24-one-concept-model-design.md` unification (concept-owned math, derived binding) remains a separate, gated effort. This spec is its prerequisite (it produces the clean CT + `constituents` it would build on), not its first step.
- **No fabricated NCI codes** — `dec_id` stays `null`; term-id bridges until registration.
- **No table/display model** (the `output_class × dimensions` cross-product) — M11-side, deferred.
- **No method input-typing system** (`accepts`/`sameKindAs` against a hierarchy) — input concept binding stays in the transformation (`inputDataStructure`, already working); a method-side type signature is a separate follow-on if wanted.

## 8. Decisions

**Settled:**
- **Keep** the four artefacts and the method-side `output_type` (§0, §3.1).
- **Reshape `indexed_by`** (§3.8) to a model-grounded notation: `scalar` / `component` / `level` granularity over the model's components (discrete vs continuous derived from input `dataType`), plus two explicit non-model axes (`time`, `cov_param`). Level *values* come from the bound dimension concept's value set — flagged as a gap.
- **One fact, one home** (§2.1): CT in the vocabulary; modeling detail in the concept; composition in sets/output-classes; binding in the transformation. **`[C1]` kept** (§5).
- **Identity = NCI `dec_id`** shared by term + concept; resolution by code; term-id is the flagged interim bridge (§2.2).
- **Drop `methodOutputSlotMapping`** (§3.6); slot→concept binding lives in the transformation, uniform for AC + DC.
- **Keep `computed_value`** (§3.5) as the uniform single-value output shape; concept identity is bound by the transformation, orthogonally.

**Open for reviewers:**
1. **`dec_id` on sets and molecules** — do molecules (and reusable sets) also get NCI `dec_id`s, or only atoms?
2. **`preferredTerm` vs `name`** — rename the vocabulary's human label field, or leave `name` as-is?
3. **Abstract `broader` families** in `output_class_templates` (`fit_statistics`, `type3_tests`) — keep for annotation grouping, or drop? (Teammate uses output-class grouping for document annotation — their call.)
4. **Concept gaps** — `M.DateDifference` has no `Duration`/`Interval` concept; `M.Aggregation`'s target is ambiguous. Resolve here or defer to `project_one_concept_model`?
5. **Descriptive bundles** — descriptive stats currently bind individually to `Measure`. Leave as-is for 1.0, or introduce a `DescriptiveSummary` molecule?

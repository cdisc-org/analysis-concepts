# Statistics Concept Consolidation — Design (Draft v1.0)

**Date:** 2026-06-26
**Status:** Draft for internal review
**Branch:** methods_02
**Related:** `2026-06-11-output-class-statistic-sets-design.md`, `2026-06-18-contrast-as-method-design.md`, `2026-06-24-one-concept-model-design.md`; memory `project_one_concept_model`, `project_terminology_concept_layering`, `project_orphan_term_triage`, `project_ratio_datatype_proportion`.

## 1. Problem

The output side of a statistical analysis is currently described by **four** artefacts:

| File | Role today |
|---|---|
| `lib/vocabulary/statistics_vocabulary.json` | terminology atoms (lowercase term ids); single source of `dataType`, STATO codings, name, description |
| `lib/vocabulary/statistic_sets.json` | reusable bundles of **terms** ("owned by neither") |
| `lib/vocabulary/output_class_templates.json` | method-side output shapes: `statistics_set` + `additional_statistics` + an abstract→concrete `broader` taxonomy |
| `lib/concepts/AC_Concept_Model_v017.json` → `sharedStatisticsVocabulary.concepts` | **thin** AC statistical concepts: a `term`/`leaves` pointer + FHIR `valueType` + `unitRule` |

This is heavier than it needs to be. Two layers do *composition* (`statistic_sets` and `resultPatterns`), one of them (`output_class_templates`) also does *classification*, and the concept layer is forbidden (by the validator's `C1` rule) from stating its own type — it must point back at terminology. The goal is a **lean draft-1.0 model** in which every produced statistic (a data point) is indexed by its dimensional context and the operation that produced it, with the minimum number of moving parts.

## 2. Conceptual framing (the decision that drives everything)

A **statistic_set is a meronomy (part-of relation not an is-a).** `{Estimate, ConfidenceInterval, SE, DF}` is a *part–whole composition* ("these are reported together because they jointly describe one estimated quantity under t-inference") — not an *is-a* hierarchy. The only genuinely taxonomic content in the stack is (a) optional `broader`/`narrower` relations among the atoms, and (b) the abstract→concrete `broader` inside `output_class_templates` — and that second one is a hybrid we can remove.

**Co-occurrence is a fact about the statistics, not about any method.** ANCOVA, MMRM, and a t-test all emit the same `{Estimate, CI, SE, DF}` shape. A fact about concepts belongs in the concept model. Therefore the meronomy **lives on the concept side**, and `statistic_sets`' "owned by neither" limbo is resolved: a bundle *of concepts* is a substructure *of the concept model*.

This yields **one node type — the concept — with composition as a property**, not a stack of distinct tiers (§3.1 flattens it):

| Element | What | Relation |
|---|---|---|
| **Category** | grouping (`TreatmentComparison`, `SurvivalAnalysis`…) | taxonomy |
| **Concept — atom** | `Estimate`, `PValue`… — `dec_id`, `result`(valueType/unitRule), codings | the irreducible data point |
| **Concept — molecule** | a concept with `constituents` + `dimensions` (`LSMeans = {Estimate, SE, CI, DF}`) — the former *result pattern* | meronomy bound to context |
| **Set** | reusable bundle of constituent concept ids a molecule pulls in | meronomy shorthand |
| *(method side)* | output → **concept** reference, at any level | *production / provenance*, not composition |

Composition is intrinsic to the data (a concept *is* atom-or-molecule); production is contextual to the run (method → concept). Keeping them apart is what makes each side thin.

## 3. Target architecture

### 3.1 One home, one common hierarchy (flattened)

The AC concept model becomes the **single home**, restructured onto a hierarchy **shared with the DC model** and the unified spike: **Category → Concept**, where a Concept may carry `constituents` (other concept ids). An atom has none; a molecule (the former *result pattern*) has several.

```
AC concept model  (pure vocabulary — points to nothing outside)
├── categories     grouping  (TreatmentComparison, SurvivalAnalysis, DescriptiveSummary, …)
└── concepts       the nodes; each carries result(valueType/unitRule), codings, dec_id,
                   optional constituents[] (→ molecule), optional dimensions (axis)
   (+ sets)        optional reusable constituent bundles a molecule can include
```

**There is no separate `resultPatterns` section and no `statisticalConcepts`/`patterns` split.** A "pattern" is simply **a concept that has `constituents`** — e.g. `LSMeans = {Estimate, SE, ConfidenceInterval, DF}`. This mirrors `ACDC_Concept_Library_v01.json`, where `LSMeans`/`MedianSurvival` are *concepts*, not a separate class ("layer is role+provenance metadata, not a file split").

**Common hierarchy vocabulary across OC / DC / AC:**
- **Category** — taxonomic grouping (DC: `PointComputation`, `Comparison`…; AC: `TreatmentComparison`…).
- **Concept** — a node. *Atom* if no `constituents`; *molecule* if it has them. Carries `result` (`valueType`/`unitRule`), `dec_id`, `codings`, optional `dimensions` (axis), optional `broader`.
- **Set** — a reusable bundle of constituent concept ids a molecule can pull in (the former `statisticSets`), kept only where reuse is real.

Fully migrating the DC + OC field names (`role`, `axis`, `provenance`) onto this shape is the `project_one_concept_model` effort; **this spec defines the common Category→Concept vocabulary and restructures AC onto it now**, so the method-reference mechanism (§3.4) is uniform immediately and DC/OC converge to the same names as that project lands.

**The AC model stays pure and symmetric with the DC model.** `Option_B_Clinical.json` holds no mapping back to methods — consumers point *into* it. The AC model matches: `methodOutputSlotMapping` is **removed**; nothing in the model knows about methods ("representation-neutral", as its own principles require).

The only shared vocabulary file that **remains** is `lib/vocabulary/fhir_value_types.json` (FHIR type registry: `Quantity`/`Range`/`Count`/`Ratio` + the primitive bridge). Concepts point into it.

**Deleted files:** `statistics_vocabulary.json`, `statistic_sets.json`, `output_class_templates.json`, and its frozen baseline `scripts/_template_statistics_baseline.json`. (`output_class_templates.json` declares a `$vocabulary` pointer to `output_class_concept_scheme.json`, which does not exist on disk — a stale reference that simply goes away.)

### 3.2 The atom concept (post-merge shape)

Each atom absorbs the terminology fact it used to point at and gains an identity code:

```jsonc
"Estimate": {
  "dec_id": null,                       // Data Element Concept id — an NCI C-code; null until assigned
  "label": "Point estimate",
  "shortLabel": "est",
  "description": "Point estimate of the quantity",
  "result": { "valueType": "Quantity", "unitRule": "inherited" },  // shared field name with DC concepts
  "codings": [                          // STATO etc. carried here now (was terminology-owned)
    { "system": "http://purl.obolibrary.org/obo/stato", "code": "STATO_0000599", "display": "point estimate" }
  ]
}
```

- **`dec_id` is the identity** — a Data Element Concept id, typed as an NCI C-code. We **do not fabricate** C-codes (per `feedback_no_hardcoding`): `dec_id` is `null` until a real NCI code is assigned. The old `code: {system:"NCI", value:null}` block collapses into `dec_id`.
- **Type is `result.valueType` + `result.unitRule`** (the same `result` shape DC concepts already use). Complex only where the statistic carries structure/unit — `Quantity` (Mean, SE), `Range` (ConfidenceInterval), `Ratio` (Proportion), `Count` (NRisk). Unitless test statistics (`PValue`, `TStatistic`, `DF`, `AIC`) are FHIR **primitives** (`decimal`). The old primitive `dataType` field disappears (subsumed by `valueType`).
- **Multi-component atoms keep `leaves`.** `ConfidenceInterval` (Range: `low.value`/`high.value`) and `Proportion` (Ratio: `numerator`/`denominator`) fold their former component terms into FHIR-path leaves — the leaves are the concept's own structure, not external terminology ids.

### 3.3 The molecule concept (composite) — former result patterns

A molecule is a concept with `constituents` (concept ids) + `dimensions` (its axis). The concrete `output_class_template` and the old `resultPattern` were the same object; they collapse into this:

```jsonc
"LSMeans": {
  "dec_id": null,
  "label": "Least-squares means",
  "category": "TreatmentComparison",
  "constituents": ["Estimate", "SE", "ConfidenceInterval", "DF"],   // may be drawn from a set
  "sets": ["ci_estimate_t_distribution"],                            // reusable bundle, optional
  "dimensions": ["factor", "level"]                                  // the axis (was indexed_by shape)
}
```

`sets` (the former `statisticSets`) remain a reusable shorthand whose members are now **concept ids** (CamelCase); leaf collapse shifts granularity up:

| Set | was (terms) | becomes (concept ids) |
|---|---|---|
| `ci_estimate` | `estimate, CI_lower, CI_upper` | `Estimate, ConfidenceInterval` |
| `ci_estimate_t_distribution` | `estimate, CI_lower, CI_upper, SE, df` | `Estimate, ConfidenceInterval, SE, DF` |
| `proportion_estimate` | `numerator, denominator, proportion, pct` | `Proportion` |

The abstract `broader` families (`fit_statistics`, `type3_tests`, …) are not molecules — they become `categories` (or optional `broader` on a concept) only where a real grouping is wanted; otherwise dropped. `computed_value`/`Value` is **deleted** (see §3.4).

### 3.4 The method output reference (any level)

A method's output references **a concept id — at whatever level fits**: an atom for a single value, a molecule for a multi-statistic result. Atom-vs-molecule is a property of the concept, not a different reference kind. Resolving the three method families:

1. **Analysis molecules** (`M.ANCOVA`, `M.MMRM`, `M.CoxPH`…) → reference a **molecule concept** (`LSMeans`, `Type3TestsF`, …). Required, fixed, 1:1 (§4).
2. **Descriptive atoms** (`M.Mean`, `M.Median`, `M.SD`…) → reference their **atom concept** directly (`Mean`, `Median`, `StandardDeviation` — all already exist). Dimensions come from the method's `indexed_by`. No `computed_value` wrapper.
3. **Derivations** → the output concept is a **DC** concept, and whether the *method* may name it depends on whether the operation's semantics **fix the output kind** — not on the most common binding:
   - **Operation fixes the output kind → method names that concept.** Methods named after a derived concept or a kind-constructing operation: `M.PercentChange → PercentChange`, `M.Categorization → Category`, `M.ThresholdCompare`/`M.RecordSelection → Flag`, `M.WindowedVisitAssignment → AnalysisVisit`. A threshold compare is always a flag.
   - **Generic arithmetic / concept-agnostic → method names nothing; the transformation binds.** `M.Subtraction`, `M.Division`, `M.AffineTransform`, `M.Rounding`, `M.UnitConversion`, `M.Aggregation`, `M.Imputation`, all `M.ImputedValue_*`, `M.WindowLookup`. The same operator serves many concepts, so `Transformation.outputDataStructure` carries the binding (the DC design intends exactly this). **Canonical case: `M.Subtraction(A, B)` is a `Change` only when `B` is a baseline; subtract two arbitrary `Measure`s and the result is a plain difference — the operation does not fix the concept.** (Scale/round/convert/impute additionally *preserve* the input's concept: rounding a `PercentChange` stays a `PercentChange`.)
   - **Concept gaps (flagged, not invented).** `M.DateDifference` has no `Duration`/`Interval` concept in the DC model; `M.Aggregation`'s target is ambiguous. Real model gaps to resolve during implementation (likely a new DC `Duration` concept), not fabricated here. Ties to `project_cube_model_gaps`.

   So a derivation names a **concept** only when the operation *constructs* a determined kind; for math primitives the **transformation**, not the method, owns the output identity — and the level needed there is "transformation-bound (often inherit-from-input)," never "category."

## 4. Alignment: closing the coverage gap

Dropping `output_class_templates` is only safe if **every `output_type` a method actually uses resolves to a concept** (an atom, or a molecule for multi-statistic output). It does not today. ("Result pattern" below means the molecule concept of §3.3.)

**Measured gap (current library):**
- **27 distinct `output_type` values** are used across the 39 analysis + derivation methods.
- **12 result patterns** exist (and the now-removed `methodOutputSlotMapping` wired only **5 methods** — MMRM, ANCOVA, LogRankTest, CoxPH, KaplanMeier — so most output slots resolved to nothing).
- The 12 are *collapsed* and **lose statistics**: `FitStatistics` omits `R_squared` (linear) and `concordance`; `Type3Tests` omits `SS`/`MS` (the F variant); the single chi-squared `TestResult` does not cover `t_test_result` or `exact_test_result`.
- **No pattern at all** for: `computed_value` (used by 46 outputs), `point_estimate`, `multivariate_tests`, `global_tests`, `odds_ratio_measures`, `landmark_estimates`.

**Resolution — one concept per distinct produced shape (1:1).** Create/repair molecule concepts so the 27 used `output_type`s each map to exactly one concept (a molecule for multi-statistic output, an atom for a single value), **preserving** the statistics the collapsed patterns dropped (R², concordance, SS/MS, the t/exact test variants; the descriptive single-value shapes now resolve to their atom concept, not a `computed_value` wrapper). Because the method references the concept *directly* (§5), the reference alone must fully determine the output — so molecules are kept **specific** rather than coarse-with-`optional_statistics`; the `output_type` value on each method output slot becomes a concept id 1:1. The invariant: every produced shape has its own concept, and **no molecule silently drops a statistic** relative to the method that produces it.

**Orphan terms.** Once terminology folds into concepts, **every statistic referenced by a retained pattern must be a concept.** Promote the referenced orphans that currently have no concept — `R_squared`, `concordance`, `SS`, `MS`, `p_value_adjusted`, `frequency`, `cumulative_n`, `cumulative_pct`, and the count `n` (via a `Count`/`N` concept) — and drop any unreferenced terms. This continues the triage recorded in `project_orphan_term_triage`.

## 5. The method points to the concept (direction of reference)

The reference runs **method → concept**, never the reverse. The AC concept model holds no knowledge of methods (`methodOutputSlotMapping` is removed, §3.1); a method's output slot names the concept id it produces (atom or molecule, §3.4), exactly as a transformation names the DC concept it produces. This **reverses** the prior principle:

> v0.18: *"Methods do not reference AC concepts — the Transformation maps method output slots to result patterns."*

We state the reversal explicitly because it is a real architectural change — but it is the *consistent* one:

- **Symmetry with the DC side.** A transformation already points into the DC concept model (`usesMethod` + measures bound to DC concepts); the DC model never points back. Method → concept is the same shape on the AC side. One direction of dependency across both concept models.
- **Why it is acceptable:** under the one-concept-model direction (`project_one_concept_model`, and the `lib_alternative/` / `model_alternative/linkML/` unified spike the user pointed to), the concept layer *is* the shared vocabulary. A method referencing it is the same class of dependency methods already had on terminology — not a new cross-layer leak. Methods already carry an `output_type` that names an external shape; we simply retarget it from an `output_class_template` id to a concept id.
- **The cost, and where it is paid:** renaming a concept is now a cross-file change touching method files. There is no indirection layer to absorb it (we deliberately removed `methodOutputSlotMapping` rather than relocate it onto the method) — the trade is *fewer moving parts* over *looser coupling*, consistent with the lean-1.0 goal. The 1:1 concept-per-shape rule (§4) keeps each reference unambiguous.
- **Precedent:** `lib_alternative/concepts/ACDC_Concept_Library_v01.json` ("Unified" model) and the LinkML schemas in `model_alternative/linkML/` already explore methods + concepts in one library; this design is the production-side step toward that, scoped to the statistics output model.

## 6. Blast radius

- **~60 method files** declare `statistics_vocabulary.json` + `output_class_templates.json` in `$vocabulary` (via a stale `model/method/...` path that no longer resolves). These declarations are updated/removed; output slots now reference concept ids.
- **`scripts/validate_methods_model.py`** is rewritten. Invariants that change:
  - `A1`/`A3` (term-based set membership) → set members are **concept ids**, and `concepts`/`sets` live in the one AC model file.
  - `C1` "thin concept must not restate `dataType`/`definition`/codings" → **reversed**: the concept *is* the single source and carries them; the new rule forbids re-stating them anywhere else.
  - `B1` (output_class template baseline) → **removed** with the file.
  - `C2` (pattern constituents cover set terms, leaf-aware) → a **molecule's `constituents` and `sets` must all be known concept ids**.
  - `C3` (`methodOutputSlotMapping` resolves to real patterns) → **removed** with the mapping; replaced by a method-file check (below).
  - **New:** every method `output_type` resolves to exactly one concept (atom or molecule), enforced on the method files; no molecule silently drops a statistic relative to the method that produces it.
- **`scripts/build_all_methods.py`** + `lib/methods/AllMethods.json` rebuilt (the `statisticSets` section now mirrors the concept-model module).
- **`lib/concepts/concept-variable-mappings.json`** and the spike scripts checked for term-id references.

## 7. Non-goals (YAGNI for draft 1.0)

- No table/display/layout model — that is the M11-side projection (`output_class × dimensions` cross-product), deferred past 1.0.
- No assignment of real NCI C-codes (`dec_id` stays `null`); codes are sourced later.
- No change to the derivation/transformation libraries beyond reference hygiene; the unified `{measures, dimensions}` output contract for derivations is tracked separately under `project_one_concept_model`.
- No new abstract output-shape taxonomy; `broader` is optional and only on atoms/categories if a real is-a relation exists.

## 8. Decisions

**Settled:**
- **Flatten** (§3.1): one node type — the **concept**; a "pattern" is a concept with `constituents` (a *molecule*); common `Category → Concept` hierarchy shared with DC/OC; no separate `resultPatterns`/`statisticalConcepts` split.
- **Direction of reference** (§5): **method → concept**, directly, at any level; `methodOutputSlotMapping` removed; AC model pure and symmetric with DC.
- **Concept granularity** (§4): **one concept per produced shape (1:1)**; molecules kept specific (no coarse-with-`optional_statistics`), because the direct reference must fully determine the output.
- **`computed_value`/`Value` deleted** (§3.4); single-value methods reference their atom concept, derivations defer to the transformation.

**Open for reviewers:**
1. **Abstract families** (§3.3): drop entirely, or retain as AC `categories`?
2. **`dec_id` for sets and molecules** — do molecules (and reusable sets) also get NCI `dec_id`s, or only atoms?
3. **`optional_statistics`** still has a role *within* a single molecule (e.g. an estimate whose CI is sometimes reported). Confirm it survives as a per-molecule field even though it is not used to merge shapes.
4. **Concept gaps** (§3.4): add a DC `Duration`/`Interval` concept for `M.DateDifference`, and decide `M.Aggregation`'s target — in this spec or deferred to `project_one_concept_model`?
5. **Method input typing** (Appendix A): the `accepts`/`sameKindAs` input type-signature against the hierarchy — fold into this spec, or split into a follow-on "method type signature" design? (Lean: follow-on; it depends on this spec but deserves its own treatment.)

## Appendix A — Worked method examples

Illustrative post-design shapes for one analysis and one derivation method. **Field names (`concept`, `accepts`, `sameKindAs`, `boundBy`) are proposals to settle in the implementation plan, not final syntax.** The parts marked *(typing follow-on)* are option 5 above — drawn in only to show where input typing lands; the part **this** spec settles is the output side (`outputs[].concept`, no output_class, no `computed_value`, transformation-bound derivation outputs).

### A.1 Analysis method — `M.ANCOVA`

The method **names** its output concepts; each is a molecule in the AC model.

```jsonc
{
  "$schema": "../../../model/json_schema/acdc_method.schema.json",
  "schema_version": "0.10.0",
  "$vocabulary": {
    // statistics_vocabulary + output_class_templates are DELETED.
    // Outputs now resolve against the one AC concept model.
    "concepts":   "../../concepts/AC_Concept_Model.json",
    "valueTypes": "../../vocabulary/fhir_value_types.json",
    "formula_grammar": "../../model/method/formula_grammar.json"
  },
  "conceptId": "M.ANCOVA",
  "name": "Analysis of Covariance",
  "label": "ANCOVA",
  "ncitCode": null,
  "codings": [{ "system": "http://purl.obolibrary.org/obo/stato", "code": "STATO_0000179", "display": "ANCOVA" }],
  "description": "Analysis of Covariance — ANOVA with continuous covariate adjustment",
  "formula": { "notation": "wilkinson_rogers", "default_expression": "response ~ covariate + fixed_effect", "...": "unchanged" },
  "configurations": [ { "name": "ss_type", "...": "unchanged" }, { "name": "alpha", "...": "unchanged" } ],

  "inputs": [
    // `accepts` = type constraint vs the hierarchy (typing follow-on); `dataType` unchanged.
    { "name": "response",     "dataType": "decimal", "accepts": { "valueType": "Quantity" }, "required": true,  "cardinality": "single",   "description": "Response/dependent variable" },
    { "name": "covariate",    "dataType": "decimal", "accepts": { "valueType": "Quantity" }, "required": false, "cardinality": "multiple", "description": "Continuous covariate(s)" },
    { "name": "fixed_effect", "dataType": "code",    "accepts": { "valueType": "code" },     "required": true,  "cardinality": "multiple", "description": "Grouping/factor variable(s)" }
  ],

  "outputs": [
    // FORMER `output_type` (output_class id) → now `concept` (a molecule-concept id in the AC model), 1:1.
    { "concept": "FitStatisticsLinear" },
    { "concept": "Type3TestsF",              "indexed_by": ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"] },
    { "concept": "ParameterEstimatesLinear", "indexed_by": ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"] },
    { "concept": "LSMeans",                  "indexed_by": ["fixed_effect"] },
    { "concept": "ContrastsT" }
  ]
}
```

The molecule it points at (so the reference resolves):

```jsonc
// AC_Concept_Model.json → concepts
"LSMeans": {
  "dec_id": null,
  "label": "Least-squares means",
  "category": "TreatmentComparison",
  "constituents": ["Estimate", "SE", "ConfidenceInterval", "DF"],   // molecule = has constituents
  "dimensions": ["factor", "level"]
}
```

### A.2 Derivation method — `M.Subtraction`

The method **names no output concept** — it declares only an input type signature and a guaranteed output `valueType`; the transformation supplies the identity.

```jsonc
{
  "$schema": "../../../model/json_schema/acdc_method.schema.json",
  "schema_version": "0.10.0",
  "$vocabulary": {
    "valueTypes": "../../vocabulary/fhir_value_types.json",
    "formula_grammar": "../../model/method/formula_grammar.json"
    // No `concepts` ref: OUTPUT identity is bound by the Transformation, not the method.
  },
  "conceptId": "M.Subtraction",
  "name": "Subtraction",
  "label": "Subtraction",
  "description": "Computes the difference between two numeric values",
  "formula": { "notation": "assignment", "default_expression": "result := minuend - subtrahend", "...": "unchanged" },

  "inputs": [
    // INPUT TYPE SIGNATURE vs the hierarchy (typing follow-on): two numeric Quantity concepts of the SAME kind.
    { "name": "minuend",    "dataType": "decimal", "accepts": { "valueType": "Quantity", "sameKindAs": "subtrahend" }, "required": true, "cardinality": "single", "description": "Value to subtract from" },
    { "name": "subtrahend", "dataType": "decimal", "accepts": { "valueType": "Quantity", "sameKindAs": "minuend" },    "required": true, "cardinality": "single", "description": "Value to subtract" }
  ],

  "outputs": [
    // CONCEPT-AGNOSTIC: no `concept` ⇒ identity supplied by the Transformation. `computed_value` is GONE.
    { "name": "result", "valueType": "Quantity", "boundBy": "transformation" }
  ]
}
```

Where `Change` is *detailed* — on the transformation, not the method:

```jsonc
{
  "conceptId": "T.ChangeFromBaseline",
  "usesMethod": "M.Subtraction",
  "inputDataStructure": { "measures": [
    { "input": "minuend",    "concept": "AnalysisValue", "requiredValueType": "Quantity" },
    { "input": "subtrahend", "concept": "Baseline",      "requiredValueType": "Quantity" }   // the "old value"
  ]},
  "outputDataStructure": { "measures": [
    { "concept": "Change", "requiredValueType": "Quantity" }   // OUTPUT IDENTITY bound here
  ]}
}
```

**The contrast in one line:** the analysis method *names* its output concepts (molecules in the AC model); the derivation method *names none* — input type signature + guaranteed output `valueType` only, with the transformation supplying the concept (`Change`) and the operands (incl. the baseline "old value").

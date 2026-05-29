# ACDC Method, Output-Type & Transformation Schema Alignment

**Status:** Draft for review
**Date:** 2026-05-27
**Owner:** kwl
**Scope:** `lib/methods/`, `lib/vocabulary/`, and `lib/transformations/`

---

## 1. Background

ACDC currently carries the description of each "method" (an analysis like ANCOVA, or a derivation like Percent Change) in three places that have drifted apart:

| Location | Status | Notes |
|---|---|---|
| `lib/methods/AllMethods.json` | Legacy single file | Uses `inputRoles`/`outputSpecifications`/`category`; carries `statisticalRole` and a populated `ncitCode` (e.g. `C00001_NEW`); missing `label`/`shortLabel`. Identifier field is `conceptId`. |
| `lib/methods/{analyses,derivations}/M_*.json` | Current per-file form | Uses `methodInput`/`methodOutput`/`class`/`label`/`shortLabel`/`unit_policy`; per-output `configurations`; `code.value` is `null`; identifier field is `name`; `statisticalRole` was dropped. |
| `lib/methods/_index.json` | Lightweight registry | Has `name`/`label`/`type`/`class`/`path` only. |

In parallel, the output-side vocabulary has its own pressure: `lib/vocabulary/output_class_templates.json` uses a SKOS family/concrete-template hierarchy where children differ only by distribution (`type3_tests_f` vs `type3_tests_mixed` vs `type3_tests_chi_squared`) or mash *estimates with CI* together with *tests with p-values* (`parameter_estimates_linear`). A colleague's proposal in `lib/methods/Analysis Methods.xlsx` (column "Suggested structure") decomposes each output into orthogonal axes (`output_class`, `statistics_type`, `distribution`, `additional statistics`) and splits the conflated templates.

This design settles the method schema, drops the legacy file, and adopts a decomposed output-type schema for both analysis and derivation methods.

## 2. Goals & non-goals

**Goals**

- One canonical, file-per-method representation under `lib/methods/{analyses,derivations}/`.
- A method file fully states identity, formula, inputs, outputs, configurations — readable in isolation.
- Inputs and outputs are addressable by a single name that doubles as the formula token and the transformation-binding role token.
- Output types compose from small, orthogonal vocabularies instead of an exploding concrete-template list.
- Derivation outputs use the same shape as analysis outputs, just simpler.

**Non-goals**

- Defining new statistics or new clinical/derivation concepts. The `statistics_vocabulary.json` and `lib/concepts/Option_B_Clinical.json` are the sources of truth for those.
- Multiplicity-adjustment configuration — explicitly out of scope for this revision (per spec discussion).

**In scope (companion):**

- The transformation library schema (`lib/transformations/ACDC_Transformation_Library_v06.json`). Because methods now carry their output structure (§3.5–§3.6), the transformation no longer needs to redeclare it; the binding contract changes shape accordingly. The transformation design lands in §6 of this doc.

## 3. Decisions

### 3.1 Single source of truth for methods

- **Delete** `lib/methods/AllMethods.json`.
- Per-file `lib/methods/{analyses,derivations}/M_*.json` files are canonical.
- `lib/methods/_index.json` is a build artifact: it is generated from the per-file fields (`conceptId`, `name`, `label`). Hand-editing `_index.json` is no longer required.
- Before deletion of `AllMethods.json`, harvest the `ncitCode` placeholders (e.g. `C00001_NEW`) into the per-file `ncitCode` field. See §3.3.

### 3.2 Method file canonical structure

*Revised 2026-05-28 (peer review)*: the `inputs[]`/`outputs[]` arrays replace `methodInput[]`/`methodOutput[]`; `name` is repurposed to hold the preferred (long-form) term; `shortLabel` is removed; `code`/`codings` flatten to a single `ncitCode` string; `type`/`class`/`intent`/`assumptions` are removed; cardinality reduces to `single | multiple`.

```json
{
  "$schema": "../../model/json_schema/acdc_method.schema.json",
  "schema_version": "0.10.0",
  "$vocabulary": {
    "statistics":     "../../model/method/statistics_vocabulary.json",
    "output_classes": "../../model/method/output_class_vocabulary.json",
    "shapes":         "../../model/method/output_shape_vocabulary.json",
    "distributions":  "../../model/method/distribution_vocabulary.json",
    "formula_grammar":"../../model/method/formula_grammar.json"
  },

  "conceptId":   "M.ANCOVA",                 // canonical id; matches file basename
  "name":        "Analysis of Covariance",   // preferred term (long form, written out)
  "label":       "ANCOVA",                   // short form / acronym (for compact display + SmartPhrase rendering)
  "ncitCode":    "C00001_NEW",               // NCI C-code (nullable until assigned)
  "codings":     [ { "system": "http://purl.obolibrary.org/obo/stato",
                     "code": "STATO_0000179", "display": "ANCOVA" } ],

  "description": "...",

  "formula": {
    "notation":           "wilkinson_rogers | assignment | survival",
    "default_expression": "response ~ covariate + fixed_effect",
    "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+",
    "notes":              "..."
  },

  "configurations": [ { "name", "dataType", "defaultValue",
                        "enumValues?", "description",
                        "conforms_to?" /* link to a vocabulary term */ } ],

  "inputs":  [ /* see §3.4 */ ],
  "outputs": [ /* see §3.5 (analysis) or §3.6 (derivation) */ ]
}
```

Notes:

- `conceptId` is the canonical identifier. It MUST match the file basename minus `.json` (e.g. `M_ANCOVA.json` → `conceptId: "M.ANCOVA"`). It is the field other ACDC files reference (`usesMethod: "M.ANCOVA"` in the transformation library) and is distinct from the slot-level `name` field inside `inputs[]`/`outputs[]`.
- `name` is the preferred (written-out) term — e.g. "Analysis of Covariance" for `M.ANCOVA`, "Last Observation Carried Forward" for `M.ImputedValue_LOCF`. This is the SKOS-prefLabel-style human form intended for documentation, glossaries, and any UI surface that needs the unambiguous full term.
- `label` is the short / acronym form (e.g. "ANCOVA", "MMRM", "LOCF") used for compact display and **SmartPhrase rendering**. When a SmartPhrase template references a method via the `method` role, the rendered phrase substitutes the method's `label`. For methods without a recognized acronym, `label` may equal `name`.
- `ncitCode` carries the NCI C-code as a flat string (currently the `C00001_NEW`-style placeholder, eventually the real C-code). When unassigned, the value is `null`. `codings[]` carries supplementary external code system mappings (STATO etc.) when present.
- Fields **removed** in this revision: `shortLabel` (collapsed into `label`), `type` / `class` / `intent` (the analysis-vs-derivation discriminator survives implicitly via the file's `formula.notation` and directory location; the free-text `class` and `intent` tags were unused by tooling), `assumptions` (free-text list with no machine-readable consumer; can be reintroduced if §7's open question gains a typed answer).

### 3.3 Identity and codings

The `conceptId` / `name` / `label` / `ncitCode` quartet replaces the legacy split:

| Legacy (`AllMethods.json`) | New (per-file) |
|---|---|
| `conceptId: "M.ANCOVA"` | `conceptId: "M.ANCOVA"` (unchanged) |
| `name: "M.ANCOVA"` (dotted ID — duplicate of conceptId) | `name: "Analysis of Covariance"` (repurposed: preferred term) |
| `label: "ANCOVA"` | `label: "ANCOVA"` (unchanged) |
| `shortLabel: "ANCOVA"` | *removed* (collapsed into `label`) |
| `ncitCode: "C00001_NEW"` | `ncitCode: "C00001_NEW"` (flat string, unchanged shape) |
| `codings: [...]` | `codings: [...]` (unchanged) |

`conceptId` is the identifier; `name` is the long-form human term; `label` is the short-form display token; `ncitCode` is the formal NCI registration. The slot-level `name` field on `inputs[]`/`outputs[]` items (the formula/binding role token, §3.4) is a different field and is unchanged by this decision.

### 3.4 Input / output naming as the formula and binding contract

The names in `inputs[]`, `outputs[]`, and `configurations[]` are **role tokens** with four simultaneous obligations:

1. **Formula bracket-token contract.** Every `<x>` in `formula.generic_expression` MUST resolve to an `inputs[i].name`, an `outputs[i].name`, OR a `configurations[i].name`. Cardinality suffixes (`*`, `+`, `?`) come from the formula grammar; the role token by itself names the slot. *(Extension added 2026-05-28: configurations are legal bracket-tokens. This formalizes a convention already used by many derivations — e.g. M.Aggregation's `<agg_func>` is a configuration, M.AffineTransform's `<scale>`/`<offset>` are configurations.)*
2. **Formula LHS contract** *(assignment notation only)*. For derivation formulas of the form `<lhs> := <expression>`, the bare LHS identifier MUST equal an `outputs[i].name`. The output's name is the formula's "what does this compute" — choose it to read naturally on the LHS (e.g. `result := ...`, `imputed_value := ...`, `analysisVisit := ...`). The previous one-size-fits-all `derived_value` convention was retired 2026-05-28; outputs now name themselves after the formula token they implement.
3. **Transformation binding contract.** A transformation measure binding's `input` / `output` FK MUST equal an `inputs[i].name` / `outputs[i].name`. (Example: `M.RecordSelection` declares `inputs[].name = "value"`; `T.BaselineSelection` binds `input: "value"`.)
4. **Indexing contract.** Strings in `outputs[i].indexed_by` MUST be input role names (or `role:role` interaction shorthand).

Implications:

- **No separate `statisticalRole` field.** The role IS the name. The roles `response`, `covariate`, `fixed_effect`, `strata`, `repeated_subject`, `repeated_factor` from the old `AllMethods.json` are kept as conventional names for analysis methods (and listed in the formula grammar's `<role_tag>` enum so a validator can recognize them), but they are not a separate slot of the schema.
- **`response` vs `value` — the modelling/descriptive split.** `response` is reserved for *modelling* methods (Wilkinson-Rogers notation: ANCOVA, ANOVA, MMRM, MANOVA, t-tests, logistic regression, etc.) where it carries the technical meaning of "the dependent variable in the `Y ~ X` model specification." For *descriptive* methods that summarise a single variable with no model (Mean, Median, SD, Quartile, Frequency, ...), the input is named `value` instead — it's the variable being summarised, not a model response. This split was applied 2026-05-28 across the 25 descriptive-stat methods.
- **Validation rules** (to add to the LinkML + a build-time validator):
  - Every `<token>` in `generic_expression` exists as an input, output, or configuration name.
  - For assignment formulas, the bare LHS identifier exists as an output name.
  - Every transformation `input` / `output` FK resolves to the method's `inputs[].name` / `outputs[].name`.
  - `indexed_by` entries reference input names (or `<input>:<input>` interactions).

`inputs[]` item shape:

```json
{
  "name":        "response",          // role token (see above)
  "dataType":    "decimal | code | boolean | id",
  "required":    true,
  "cardinality": "single | multiple",   // reduced from {single, multiple, single_or_multiple}: multiple now means "one or more" (covers the n=1 case)
  "description": "..."
}
```

### 3.5 Analysis output type — three-axis decomposition

Each `outputs[i]` for an analysis method is a TABLE described by four axes plus an optional escape hatch:

```json
{
  "name":          "type3_tests",            // slot name (unique within this method)
  "output_class":  "type3_tests",            // role of the table (vocabulary term)
  "shape":         "test_with_pvalue",       // inferential pattern (vocabulary term)
  "distribution":  "F",                      // probabilistic basis (vocabulary term, or "none")
  "indexed_by":    ["covariate", "fixed_effect",
                    "fixed_effect:fixed_effect", "covariate:fixed_effect"],
  "additional_statistics": ["SS", "MS"]      // optional; columns beyond shape's canonical set
}
```

#### 3.5.1 Vocabulary `output_class_vocabulary.json` (the role)

A flat SKOS scheme with ~12 concrete classes organised under a small family taxonomy. Concrete classes used in methods:

```
fit_statistics
type3_tests
test_result
parameter_estimates       parameter_tests
contrast_estimates        contrast_tests
ls_means                  point_estimate
odds_ratio_estimates      hazard_ratio_estimates      odds_ratio_measures
multivariate_tests        global_tests                homogeneity_test
survival_table            median_survival             event_summary       landmark_estimates
proportion_estimate       frequency_table             cumulative_frequency_table       quartile_estimates
scalar_value              categorical_value           flag                datetime_value      count_value
```

Each entry declares `label`, `description`, optional `broader` (SKOS family). Templates DO NOT declare statistics — that's now the `shape`'s job.

#### 3.5.2 Vocabulary `output_shape_vocabulary.json` (the inferential pattern)

A small enum that declares the **canonical statistics** the shape produces, drawn from `statistics_vocabulary.json`. Distribution-dependent inferential columns (`df`, `df_num`, `df_den`) are not in the canonical set — they're added by the distribution.

| shape | canonical statistics | typical use |
|---|---|---|
| `estimate_with_ci` | `estimate`, `SE`, `CI_lower`, `CI_upper` | LS-means, parameter estimates, contrasts, odds-ratio estimates |
| `test_with_pvalue` | `statistic`, `p_value` (`statistic` is filled by distribution) | Type III tests, omnibus tests |
| `computed_value` | `value` | descriptive statistics, derived values |
| `pvalue_only` | `p_value` | Fisher exact test result |
| `count_with_denominator` | `n`, `n_total`, `proportion`, `pct` | proportion tables, frequency tables |

(Exact set finalised during migration; the key invariant is that `shape` declares the canonical column set, not the `output_class`.)

#### 3.5.3 Vocabulary `distribution_vocabulary.json` (the probabilistic basis)

Declares which `statistic` column the `shape:test_with_pvalue` produces and which auxiliary columns (`df`, `df_num`, `df_den`) are present.

| distribution | statistic column | aux columns | typical use |
|---|---|---|---|
| `F` | `F_statistic` | `df_num`, `df_den` | Type III F-tests, multivariate tests |
| `chi_squared` | `chi_squared` | `df` | Wald/LR tests, chi-squared tests |
| `studentT_scaled` | `t_statistic` | `SE`, `df` | linear-model coefficients, LS-mean differences |
| `studentT_standard` | `t_statistic` | `df` | linear-model term tests |
| `normal_scaled` | `z_statistic` | `SE` | GLM coefficients, Wald CIs |
| `lognormal_scaled` | — | `SE` | hazard ratios / odds-ratio CIs |
| `none` | — | — | non-parametric (Kaplan-Meier table, median survival CI by Brookmeyer-Crowley, Fisher OR) |

Combined with `shape`, the four axes uniquely determine the column set of the output table:

> columns = shape.canonical_statistics ∪ distribution.aux ∪ additional_statistics
> distribution.statistic_column replaces the placeholder `statistic` in `test_with_pvalue`

#### 3.5.4 Splits we adopt

- `parameter_estimates` → `parameter_estimates` (shape `estimate_with_ci`) + `parameter_tests` (shape `test_with_pvalue`).
- `contrasts` → `contrast_estimates` (shape `estimate_with_ci`) + `contrast_tests` (shape `test_with_pvalue`).
- `type3_tests_f` / `type3_tests_mixed` / `type3_tests_chi_squared` collapse to one `output_class: "type3_tests"` with different `distribution`.

#### 3.5.5 Out of scope for this revision

- Per-output `configurations` for multiplicity adjustment (already present on some ANCOVA outputs). Drop these during migration; we'll revisit when an MCC design is settled.

### 3.6 Derivation output type — same shape, type flows from concept

*Revised 2026-05-28*: instead of declaring `value_type` per output, atomic outputs (descriptive analyses + derivations) reference a single new template `computed_value` in `output_class_templates.json`. The template declares only the *shape* (`statistics: ["value"]`). The FHIR datatype of the produced column is supplied by the bound concept at transformation time via `concept.result.valueType` — the concept is the single source of truth for value type, not the method or the template.

```json
"outputs": [
  {
    "name":         "result",                   // matches the formula's LHS (§3.4)
    "output_type":  "computed_value",           // FK to output_class_templates (atomic-value family)
    "dataType":     "decimal",                  // structural primitive — parallel to inputs[].dataType
    "unit_policy":  "preserved",                // method-side behavior (§3.6.1)
    "indexed_by":   ["partition"]               // method-side row indexing
  }
]
```

The keys consolidated by this revision:

- **`value_type` (FHIR complex type) removed from method outputs.** Was previously a FHIR-type string (`fhir:Quantity`, `fhir:CodeableConcept`, ...) on each atomic output. The FHIR complex datatype now flows from the bound concept's `result.valueType` field at transformation time. Methods stay type-agnostic, consistent with "methods are concept-free, reusable" (§3.6.2).
- **`dataType` (structural primitive) added to method outputs.** Parallels `inputs[].dataType`. Carries the computational shape the method's formula produces (`decimal` for numeric methods, `integer` for counts, `code` for flags/categories, `boolean`, `date`). This is intrinsic method-side knowledge — M.Mean computes a decimal regardless of what concept it's bound to; M.RecordSelection emits a code regardless of which flag concept it's bound to. At transformation binding time the validator checks that the method-output `dataType` is compatible with the bound concept's `result.valueType` (§6.6 rule 10).
- **`output_class` / `shape` / `distribution` collapsed into a single `output_type` FK.** The atomic-output template `computed_value` is the only entry needed for derivations and descriptive analyses; the structured-table templates (`ls_means`, `type3_tests_f`, ...) remain the entries used by modelling analyses. One field name (`output_type`), one FK target file (`output_class_templates.json`), uniform across all 60 methods.
- **`unit_policy` stays on the method.** Behavior (how units flow from input to output) is per-method: `M.Mean` preserves units from input; `M.PercentChange` is always dimensionless; `M.UnitConversion` reads the unit from a configuration. Pinning it onto the template would force a fan-out into `computed_quantity_preserved` / `computed_quantity_dimensionless` / `computed_quantity_configured` and buy nothing.
- **For structured outputs (modelling analyses)**: no per-output `dataType` field. The template's `statistics[]` list (FK into `statistics_vocabulary.json`) carries the per-column dataType — different columns have different types and a single field on the output entry doesn't fit. See §6.6 rule 11 for the binding-time validation.

The `output_class_templates.json` `computed_value` entry:

```jsonc
"computed_value": {
  "label": "Computed value",
  "description": "Family of single-value atomic outputs (one value per row) produced by descriptive statistics and derivations. The FHIR datatype is supplied by the bound concept at transformation time via concept.result.valueType — the template carries the shape only, not the type.",
  "broader": null,
  "statistics": ["value"]
}
```

#### 3.6.1 `unit_policy` lives on the method

`unit_policy` is per-output and per-method (it characterizes how the method's computation propagates units). For analysis methods with value-bearing outputs (e.g. `ls_means`, `point_estimate`, `parameter_estimates`), it MAY also be set per-output; on pure inferential outputs (`type3_tests`, `test_result`) it is omitted.

#### 3.6.2 Derivation outputs do NOT reference clinical concepts

The semantic typing of a derived value (`Flag`, `Measure`, `Change`, `PercentChange`, …) lives in `lib/concepts/Option_B_Clinical.json` and is **bound at the transformation layer**, never declared on the method. A derivation method is structural and reusable: `M.PercentChange` produces "a scalar percentage indexed by partition", and a transformation in `lib/transformations/` decides that this particular use of `M.PercentChange` represents the `PercentChange` clinical concept.

The contract this design preserves is: a method declares `outputs[i].name` as the slot identifier; a transformation references that slot through an `outputDataStructure.measures[].output` FK and attaches a `concept`. The same principle applies to analysis methods — an analysis method declares `outputs[].name = "ls_means"`, and the transformation binds that slot to an AC concept like `LSMeans`.

See **§6** for the full transformation schema, **§6.3** for the binding object shape, and **§6.7** for a concrete before/after of `T.BaselineSelection` (which binds `M.RecordSelection`'s output to the `Flag` concept). The cross-file invariants:

- A method file MUST NOT reference clinical, derivation, or analysis concepts. The only "concept-like" code on a method is its own `code` / `codings` (NCI / STATO identifiers for the method itself).
- A transformation file MUST cite its method by `usesMethod` and MUST bind every method output slot it cares about via an entry in `outputDataStructure.measures[]` (each item carries `output` + `concept`). Outputs the transformation does not bind are surfaced structurally with no semantic concept — that's an allowed state (see also §6.8).
- The `Option_B_Clinical.json` / `AC_Concept_Model_v017.json` concept files are loaded only when validating transformation bindings, never when validating methods.

This is the asymmetry that makes the library work: ~60 reusable methods × N concepts = ~hundreds of transformations, each a small file with no method-internals knowledge to repeat.

### 3.7 Vocabulary alignment

| File | Role | Status |
|---|---|---|
| `lib/vocabulary/statistics_vocabulary.json` | Column-level semantic vocabulary (the "Semantic Statistical Definitions" layer in the architecture diagram). Each entry has dataType, description, and (where available) STATO codings. | Keep as-is; this is the reference. |
| `lib/vocabulary/output_class_templates.json` | Current SKOS family/concrete-template hierarchy. | **Replace** with three new files (§3.5.1–§3.5.3): `output_class_vocabulary.json`, `output_shape_vocabulary.json`, `distribution_vocabulary.json`. Keep the old file during migration; delete when all methods are migrated. |
| `lib/vocabulary/formula_grammar.json` | BNF for the formula DSL. | Update the `<role_tag>` enum's purpose: it lists *conventional* role names useful across analysis methods, but the validator enforces `<token>` resolution against the method's own `inputs[]`/`outputs[]` `name` values, not against this enum. |
| `lib/vocabulary/fhir_value_types.json` | FHIR datatype enum. | No longer referenced from methods (per §3.6 revision 2026-05-28, methods don't carry `value_type` — it flows from concepts). Still referenced from `lib/concepts/*.json` where each concept's `result.valueType` is constrained by this enum. |

Concept files (`lib/concepts/*.json`) stay outside this design's scope: they define clinical/derivation/analysis concepts referenced by transformations, not by methods.

### 3.8 Schema file

A new JSON-Schema file lands at `model/method/acdc_methods.schema.json` (currently referenced by every method via `$schema` but missing). It MUST encode:

- The §3.2 top-level shape.
- The vocabulary cross-reference rules: `output_class`, `shape`, `distribution` must be terms in their respective vocabularies; `code.system` ∈ {`NCI`, …}.
- The formula-token contract (§3.4): the validator enforces that every `<x>` in `generic_expression` is a known input/output name, and that `indexed_by` items resolve to input names or `name:name` interactions.

## 4. Worked examples

### 4.1 M.ANCOVA — before / after

**Before** (`lib/methods/analyses/M_ANCOVA.json`, today — uses `name` as the method identifier):

```json
{
  "name": "M.ANCOVA", "label": "Analysis of Covariate", "shortLabel": "ANCOVA",
  "code": { "system": "NCI", "value": null, "_note": "NCI C-code to be assigned" },
  "type": "analysis", "class": "General Linear Models",
  "intent": ["GroupComparison"],
  "codings": [],
  "description": "Analysis of Covariance — ANOVA with continuous covariate adjustment",
  "formula": {
    "notation": "wilkinson_rogers",
    "default_expression": "response ~ covariate + fixed_effect",
    "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+ + (<fixed_effect>:<fixed_effect>)* + (<covariate>:<fixed_effect>)*"
  },
  "configurations": [
    { "name": "ss_type", "dataType": "enum", "defaultValue": "III", "enumValues": ["I","II","III","IV"] },
    { "name": "alpha",   "conforms_to": "alpha", "dataType": "decimal", "defaultValue": 0.05 }
  ],
  "methodInput": [
    { "name": "response",      "dataType": "decimal", "required": true,  "cardinality": "single" },
    { "name": "covariate",     "dataType": "decimal", "required": false, "cardinality": "multiple" },
    { "name": "fixed_effect",  "dataType": "code",    "required": true,  "cardinality": "single_or_multiple" }
  ],
  "methodOutput": [
    { "name": "fit_statistics_linear",    "output_type": "fit_statistics_linear" },
    { "name": "type3_tests_f",            "output_type": "type3_tests_f",
      "indexed_by": ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"],
      "configurations": [ { "name": "multiplicity_adjustment", "conforms_to": "multiplicity_adjustment", ... } ] },
    { "name": "parameter_estimates_linear","output_type": "parameter_estimates_linear",
      "indexed_by": [...] },
    { "name": "ls_means",                 "output_type": "ls_means", "indexed_by": ["fixed_effect"] },
    { "name": "contrasts_t",              "output_type": "contrasts_t", "indexed_by": ["fixed_effect"],
      "configurations": [ { "name": "multiplicity_adjustment", ... } ] }
  ]
}
```

**After** (proposed, revised 2026-05-28):

```json
{
  "conceptId":   "M.ANCOVA",
  "name":        "Analysis of Covariance",
  "label":       "ANCOVA",
  "ncitCode":    "C00001_NEW",
  "codings":     [ { "system": "http://purl.obolibrary.org/obo/stato",
                     "code": "STATO_0000179", "display": "ANCOVA" } ],
  "description": "Analysis of Covariance — ANOVA with continuous covariate adjustment",
  "formula": {
    "notation": "wilkinson_rogers",
    "default_expression": "response ~ covariate + fixed_effect",
    "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+ + (<fixed_effect>:<fixed_effect>)* + (<covariate>:<fixed_effect>)*"
  },
  "configurations": [
    { "name": "ss_type", "dataType": "enum", "defaultValue": "III", "enumValues": ["I","II","III","IV"] },
    { "name": "alpha",   "conforms_to": "alpha", "dataType": "decimal", "defaultValue": 0.05 }
  ],
  "inputs": [
    { "name": "response",     "dataType": "decimal", "required": true,  "cardinality": "single" },
    { "name": "covariate",    "dataType": "decimal", "required": false, "cardinality": "multiple" },
    { "name": "fixed_effect", "dataType": "code",    "required": true,  "cardinality": "multiple" }
  ],
  "outputs": [
    {
      "name":         "fit_statistics",
      "output_class": "fit_statistics",
      "shape":        "computed_value",
      "distribution": "none",
      "additional_statistics": ["AIC","BIC","minus2LogL","R_squared"]
    },
    {
      "name":         "type3_tests",
      "output_class": "type3_tests",
      "shape":        "test_with_pvalue",
      "distribution": "F",
      "indexed_by":   ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"],
      "additional_statistics": ["SS","MS"]
    },
    {
      "name":         "parameter_estimates",
      "output_class": "parameter_estimates",
      "shape":        "estimate_with_ci",
      "distribution": "studentT_scaled",
      "indexed_by":   ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"],
      "unit_policy":  "preserved"
    },
    {
      "name":         "parameter_tests",
      "output_class": "parameter_tests",
      "shape":        "test_with_pvalue",
      "distribution": "studentT_standard",
      "indexed_by":   ["covariate","fixed_effect","fixed_effect:fixed_effect","covariate:fixed_effect"]
    },
    {
      "name":         "ls_means",
      "output_class": "ls_means",
      "shape":        "estimate_with_ci",
      "distribution": "studentT_scaled",
      "indexed_by":   ["fixed_effect"],
      "unit_policy":  "preserved"
    },
    {
      "name":         "contrast_estimates",
      "output_class": "contrast_estimates",
      "shape":        "estimate_with_ci",
      "distribution": "studentT_scaled",
      "indexed_by":   ["fixed_effect"],
      "unit_policy":  "preserved"
    },
    {
      "name":         "contrast_tests",
      "output_class": "contrast_tests",
      "shape":        "test_with_pvalue",
      "distribution": "studentT_standard",
      "indexed_by":   ["fixed_effect"]
    }
  ]
}
```

What changed:

- Method identifier added: `conceptId: "M.ANCOVA"` (the old `name: "M.ANCOVA"` slot is repurposed).
- `name` repurposed to hold the preferred (long-form) term: `"Analysis of Covariance"`.
- `label` keeps the short / acronym form (`"ANCOVA"`); `shortLabel` removed (collapsed into `label`).
- `code: { system, value }` flattened to `ncitCode: "C00001_NEW"` (string, or null when unassigned).
- `type`, `class`, `intent`, `assumptions` removed.
- `inputs[]` → `inputs[]`; `outputs[]` → `outputs[]`.
- Cardinality enum reduced to `single | multiple`; the previous `fixed_effect.cardinality: "single_or_multiple"` is now `"multiple"` (the `multiple` value covers the n=1 case under the new contract).
- `outputs[].output_type` (single key into the SKOS catalogue) → four explicit axes (`output_class`, `shape`, `distribution`, optional `additional_statistics`).
- The output split: one `parameter_estimates_linear` becomes `parameter_estimates` + `parameter_tests`; one `contrasts_t` becomes `contrast_estimates` + `contrast_tests`.
- Per-output `multiplicity_adjustment` configurations dropped (out of scope, §3.5.5; confirmed during the 2026-05-28 peer review — outputs do not carry their own configurations).
- `unit_policy` lifted from method-level to per-output, only on value-bearing outputs.
- The slot-level `name` field on each `inputs[i]` / `outputs[i]` stays as the role token transformations bind to via `input` / `output` FKs.

### 4.2 M.PercentChange — before / after

**Before**:

```json
{
  "name": "M.PercentChange", "label": "Percent Change", "shortLabel": "%CFB",
  "type": "derivation", "class": "Arithmetic",
  "formula": {
    "notation": "assignment",
    "default_expression": "result := 100 * (post - pre) / pre",
    "generic_expression": "result := 100 * (<post> - <pre>) / <pre>"
  },
  "unit_policy": "dimensionless",
  "methodInput": [
    { "name": "pre",  "dataType": "decimal", "required": true, "cardinality": "single" },
    { "name": "post", "dataType": "decimal", "required": true, "cardinality": "single" }
  ],
  "methodOutput": [
    { "output_type": "fhir:Quantity", "name": "derived_value" }
  ]
}
```

**After** (revised 2026-05-28):

```json
{
  "conceptId":   "M.PercentChange",
  "name":        "Percent Change",
  "label":       "%CFB",
  "ncitCode":    null,
  "description": "Computes proportional change as a percentage",
  "formula": {
    "notation": "assignment",
    "default_expression": "result := 100 * (post - pre) / pre",
    "generic_expression": "result := 100 * (<post> - <pre>) / <pre>"
  },
  "inputs": [
    { "name": "pre",  "dataType": "decimal", "required": true, "cardinality": "single",
      "description": "The baseline/reference value" },
    { "name": "post", "dataType": "decimal", "required": true, "cardinality": "single",
      "description": "The post-baseline value" }
  ],
  "outputs": [
    {
      "name":         "result",                // matches the formula's LHS (§3.4)
      "output_type":  "computed_value",        // FK to output_class_templates (§3.6)
      "unit_policy":  "dimensionless"
    }
  ]
}
```

What changed (same revisions as §4.1, applied to a derivation):

- `name` repurposed to "Percent Change" (preferred term); `label: "% Change"` is the short form (the original `%CFB` overspecified — the method is not baseline-specific); `shortLabel` removed.
- `code: { system, value }` flattened to `ncitCode: null` (unassigned).
- `type`, `class`, `intent`, `assumptions` removed.
- `methodInput[]` → `inputs[]`; `methodOutput[]` → `outputs[]`.
- Output `name` aligned to the formula's LHS: `derived_value` → `result`.
- Atomic-output four-axis form (`output_class` + `shape` + `distribution` + `value_type`) collapsed to a single `output_type: "computed_value"` FK; the FHIR datatype now flows from the bound concept at transformation time, not the method (per §3.6 revision 2026-05-28). `unit_policy` stays on the method.

The transformation that *uses* this method binds the output to the `PercentChange` clinical concept (in §6 terms: `outputDataStructure.measures[].output: "result"`, `concept: "PercentChange"`), and the `Quantity` datatype propagates from `PercentChange.result.valueType` in `Option_B_Clinical.json`. The method itself stays concept-free.

## 5. Migration plan

In order, each step landable on its own:

1. **Write `model/method/acdc_methods.schema.json`** (currently missing). Encode §3.2 + §3.4 validation rules.
2. **Write `output_class_vocabulary.json`, `output_shape_vocabulary.json`, `distribution_vocabulary.json`** under `lib/vocabulary/`. (Pre-existing inconsistency: per-file `$vocabulary` blocks reference `../../model/method/…`, but the actual files live in `lib/vocabulary/`. Pick one location during this migration and update the references in every method file accordingly. Recommendation: keep `lib/vocabulary/` since the files are already there.)
3. **Harvest `ncitCode` placeholders** from `AllMethods.json` into per-file `code.value`. Mechanical pass keyed on `name`.
4. **Rewrite per-file `output` blocks** from `output_type` → 4-axis. Most are mechanical: the current `output_class_templates.json` carries enough info (template family + statistics) to derive `(output_class, shape, distribution, additional_statistics)`. The splits (parameter_estimates → +parameter_tests, contrasts → +contrast_estimates/contrast_tests) need a manual one-time choice.
5. **Add per-output `unit_policy`** on value-bearing outputs of every analysis method; remove method-level `unit_policy` from analysis methods (keep it on derivations only as a fallback, or remove entirely once outputs all carry it).
6. **Migrate derivation + descriptive-stat `outputs[]`** (~46 methods) to the §3.6 form (revised 2026-05-28): single `output_type: "computed_value"` FK referencing the new template in `output_class_templates.json`. The FHIR datatype is no longer carried on the method — it flows from the bound concept's `result.valueType` at transformation time. `unit_policy` stays on the method.
7. **Generate `_index.json`** from per-file fields; mark the file as generated.
8. **Delete `AllMethods.json`** and the old `output_class_templates.json`.
9. **Update validators / app code** that read the old shape (search for `outputSpecifications`, `inputRoles`, `outputClass`, `indexedBy` in `lib/`, `model/`, and `ac-dc-app/`).

Steps 1–4 produce a working state; 5–9 finish the migration.

## 6. Transformation schema (companion design)

A transformation in `lib/transformations/ACDC_Transformation_Library_v06.json` is the layer that *applies* a reusable method to a specific clinical/analysis concept. It does three things:

1. Names the method it uses (`usesMethod` → method `conceptId`).
2. Provides method configuration values (`methodConfigurations`).
3. **Binds** each of the method's input/output slots and the cube's dimensions to concepts (or concept categories) from `lib/concepts/`.

Since methods now declare their full output structure (§3.5–§3.6), the transformation no longer redeclares output shape/distribution/indexed_by. Its job narrows to identity + configuration + bindings.

### 6.1 Unified shape for analysis and derivation transformations

Today the file splits transformations into two top-level arrays: `derivationTransformations[]` and `analysisTransformations[]`. The split is incidental — the same schema applies on both sides; only the concept namespace differs (derivations bind to `Option_B_Clinical.json`, analyses to `AC_Concept_Model_v017.json`).

**Decision:** unify under a single `transformations[]` array with a `transformationType: "derivation" | "analysis"` discriminator. Consumers filter by type when needed.

### 6.2 Top-level transformation structure

```jsonc
{
  "conceptId":          "T.BaselineSelection",     // was: oid
  "label":              "Baseline Selection",      // SmartPhrase contract (§3.2 notes)
  "shortLabel":         "Baseline",                // optional, when a compact form exists
  "transformationType": "derivation",              // derivation | analysis
  "description":        "...",
  "usesMethod":         "M.RecordSelection",       // FK to method.conceptId

  "methodConfigurations": [
    { "configurationName": "selection_rule", "value": "last_non_missing" },
    { "configurationName": "scope",          "value": "pre_treatment" }
  ],

  "inputDataStructure":  { /* §6.3: dimensions, measures, slices */ },
  "outputDataStructure": { /* §6.3: dimensions, measures, slices? */ },

  "sliceKeys":         [ /* §6.4, optional */ ],
  "validSmartPhrases": []
}
```

Changes vs today:

| Today | Proposed | Reason |
|---|---|---|
| `oid: "T.X"` | `conceptId: "T.X"` | Match the §3.3 method decision; one identifier convention across method and transformation files. |
| `name: "Baseline Selection"` | `label` + optional `shortLabel` | SmartPhrase rendering needs both forms (same contract as §3.2). |
| `instanceOf: "Flag"` | *removed* | Redundant with the new output-side measure binding's `concept` field. See §6.3. |
| `derivationTransformations[]` + `analysisTransformations[]` | Single `transformations[]` array; `transformationType` discriminator | One schema, one validation pipeline. |
| `bindings[]` with `direction` + `dataStructureRole` | `inputDataStructure` + `outputDataStructure` blocks, each carrying its own `dimensions[]` + `measures[]` (§6.3) | Each block IS a `qb:DataStructureDefinition` 1:1 — qb expects each `qb:DataSet` to have its own DSD, not a flattened cross-direction structure. The JSON→RDF converter emits two DSDs mechanically. Authors duplicate dim entries when both cubes share them; the UI layer handles carry-forward ergonomics. |
| `composedPhrase: "..."` (rendered phrase baked into the source) | *removed* | The composed phrase is a deterministic render of `validSmartPhrases[]` × sliceKey-supplied values. Storing the rendered form in the source invites drift between the field and what would actually be rendered if the underlying SmartPhrases change. Render-time composition (in the UI / export layer) is the right home. |

### 6.3 Two DSD blocks: `inputDataStructure` and `outputDataStructure`

The transformation declares two `qb:DataStructureDefinition`s — one for the cube it consumes, one for the cube it produces. Each block is a self-contained DSD with its own `dimensions[]`, `measures[]`, and (input-side only) `slices[]`. The blocks are independent — dimensions a reviewer expects to "carry forward" (the common case) must be listed in both. This duplication is the price of qb fidelity; the authoring UI handles it for hand-edit ergonomics.

```jsonc
"inputDataStructure": {
  "dimensions": [
    { "input": "partition", "concept": "Subject" },
    { "input": "partition", "conceptCategory": "ParameterDimension" },
    { "input": "partition", "conceptCategory": "VisitDimension" }
  ],
  "measures": [
    { "input": "value", "concept": "Measure",
      "requiredValueType": null,
      "slice": "baseline_only" }                        // optional pre-filter (§6.4)
  ],
  "slices": [ /* §6.4 — input-side slice templates */ ]
},

"outputDataStructure": {
  "dimensions": [
    { "concept": "Subject" },
    { "conceptCategory": "ParameterDimension" },
    { "conceptCategory": "VisitDimension" }
  ],
  "measures": [
    { "output": "derived_value", "concept": "Flag" }
  ]
  // "slices": [...] permitted but typically empty for derivations.
}
```

**Binding object shape (same on both sides):**

| Field | On | Purpose |
|---|---|---|
| `input` | items in `inputDataStructure.measures[]` (required); items in `inputDataStructure.dimensions[]` (optional — see semantic note 2) | FK to method's `inputs[].name` (the slot this binding fills) |
| `output` | items in `outputDataStructure.measures[]` (required) | FK to method's `outputs[].name` |
| `concept` | any | Single clinical/analysis concept (e.g. `Subject`, `Measure`, `Flag`) |
| `conceptCategory` | any | Concept category — user picks a member at study-spec time (e.g. `ParameterDimension`); exclusive with `concept` |
| `requiredValueType` | `inputDataStructure.measures[]` | Optional: constrain the value type accepted (e.g. `NumericValue`) |
| `slice` | `inputDataStructure.measures[]` | Optional: name of a slice from `inputDataStructure.slices[]` that pre-filters this input cube |

**Semantic notes:**

1. **Each block IS a `qb:DataStructureDefinition`.** No carry-forward shorthand; if a dim appears on both cubes, it appears in both `dimensions[]` arrays. Drift between the two lists is what the diff (and the validator) catch.
2. **`input` on an `inputDataStructure.dimensions[]` item is optional.** Two distinct cases:
   - **Bound dim** — the dimension fills a specific method input slot (e.g. `Treatment` fills M.ANCOVA's `fixed_effect`). Set `input`.
   - **Context dim** — the dimension is pure cube scope; the method doesn't take it as an argument (e.g. `Subject`, `ParameterDimension`, `VisitDimension` for M.ANCOVA). Omit `input`. Study-time values for context dims come from `sliceKeys[]` (§6.4).
3. **`input` is never set on an `outputDataStructure` item.** The output side is what the transformation *produces*, not what it consumes. Even when a dim that was bound to a method input on the input side reappears on the output side (e.g. `Treatment`), the output-side entry just lists the concept — no FK. The validator strips/rejects `input` on the output side.
4. **The same `input` slot can be filled by multiple bindings.** Example: `M.Aggregation`'s `partition` slot (`cardinality: "multiple"`) can be filled by several dimension bindings (Subject, ParameterDimension, VisitDimension) at once. Cardinality is enforced against the method's `inputs[].cardinality`.
5. **Output measure bindings type the result with a concept.** `{ "output": "derived_value", "concept": "Flag" }` says "the method's `derived_value` output represents the clinical concept `Flag`." That's the semantic typing that the old `instanceOf` field carried, now consolidated where it belongs.
6. **Aggregations and other DSD-changing transformations are natural.** A transformation that consumes a Timing-ordered cube and produces a per-Subject summary (e.g. `T.PeakConcentration`) just lists `Timing` in `inputDataStructure.dimensions` and omits it from `outputDataStructure.dimensions`. No special syntax needed.

**Attributes (reserved).** A future `attributes[]` array would map to `qb:attribute` (cube metadata like unit-of-measure, observation status). It would live inside each DSD block (input-side and/or output-side, as appropriate). Reserved in the schema; not added until a concrete use case lands.

### 6.4 Slices and sliceKeys

Slices are pre-filtered views of a cube — a `qb:Slice` that fixes some dimensions to specific values before the method sees the data. Slice templates live inside the DSD whose dimensions they constrain (typically `inputDataStructure.slices[]`); the top-level `sliceKeys[]` block declares how the templates' placeholders bind to the endpoint spec at study time.

- **`sliceKeys[]`** (top-level) declares which dimensions are parameterized at study-spec time, and where the value comes from (e.g. the endpoint's biomedical concept, the user-picked analysis visit, the chosen population). This is the transformation's contract with the endpoint spec.
- **`inputDataStructure.slices[]`** defines named slice templates whose `constraints[]` use `{placeholder}` tokens that resolve against the sliceKeys at execution time. Every input measure that's filtered cites a slice by name; no implicit slicing.

```jsonc
"sliceKeys": [
  { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
  { "dimension": "VisitDimension",     "source": "visit" },
  { "dimension": "Population",         "source": "population" }
],

"inputDataStructure": {
  "dimensions": [ /* ... */ ],
  "measures": [
    { "input": "response",  "concept": "Change",  "slice": "endpoint" },
    { "input": "covariate", "concept": "Measure", "slice": "parameter_baseline" }
  ],
  "slices": [
    {
      "name": "endpoint",
      "description": "This parameter, this analysis visit, this population.",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{visit}" },
        { "dimension": "Population",         "value": "{population}" }
      ]
    },
    {
      "name": "parameter_baseline",
      "description": "Same parameter and population, but at the baseline visit.",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{baseline_visit}" },
        { "dimension": "Population",         "value": "{population}" }
      ]
    }
  ]
}
```

**Three conventions:**

1. **Every filtered input measure cites a named slice — no implicit slicing.** The endpoint cube is a named slice (`endpoint`) just like the covariate cube is a named slice (`parameter_baseline`). Reading the JSON tells you exactly what filter each input sees; nothing is hidden in engine convention. The two slices typically share most constraints and differ on one — the diff is the load-bearing signal.
2. **Slices attach only to input-side measure bindings.** You never "slice an output." `inputDataStructure.slices[].constraints[].dimension` references an `inputDataStructure.dimensions[].conceptCategory` (or `concept`), and `slice` values reference `inputDataStructure.slices[].name`. Validator rejects `slice` on any `outputDataStructure.measures[]` item.
3. **Slice templates spell out every constraint they apply — no inheritance.** If three slices all constrain Parameter, they all list it. This is verbose; the upside is that a reviewer can read any one slice in isolation and know exactly what cube it produces. If verbosity becomes painful later (5+ slices per transformation), slice composition (`extends: "endpoint", override: [...]`) is a clean future extension — but premature for the current library size.

### 6.5 W3C qb alignment at file scope

The transformation schema borrows qb's component model for describing cube structure, and extends it where qb declines scope (W3C Data Cube §8.4: *"how one dataset might be derived from another ... not supported in this version. ... may be addressed by future extensions"*). Each `*DataStructure` block is a `qb:DataStructureDefinition` 1:1 — the JSON→RDF converter emits two real DSDs without re-derivation. The `_w3c_alignment` block at the top of the transformation file declares the mapping once:

```jsonc
"_w3c_alignment": {
  "vocabulary": "https://www.w3.org/TR/vocab-data-cube/",
  "mapping_qb_native": {
    "inputDataStructure":             "qb:DataStructureDefinition for the qb:DataSet the transformation consumes.",
    "outputDataStructure":            "qb:DataStructureDefinition for the qb:DataSet the transformation produces.",
    "*DataStructure.dimensions[]":    "qb:dimension components of that DSD.",
    "*DataStructure.measures[]":      "qb:measure components of that DSD.",
    "*DataStructure.attributes[]":    "qb:attribute components of that DSD. (Reserved.)",
    "inputDataStructure.slices[]":    "qb:Slice templates — fixed-dimension subsets of the input qb:DataSet. Instantiated to real qb:Slices at execution time when sliceKeys bind.",
    "outputDataStructure.slices[]":   "qb:Slice templates for the output qb:DataSet (e.g. publishing 'LSMeans at Week 24'). Permitted, typically empty.",
    "sliceKeys[]":                    "qb:SliceKey — declares WHICH dimensions are fixed in slices using this key."
  },
  "mapping_acdc_extensions": {
    "transformation as a whole":  "AC/DC extension. qb is silent on dataset-to-dataset derivation (W3C §8.4); we add an explicit transformation vocabulary that USES qb cube terms for input and output DSDs.",
    "measures[].input":     "AC/DC extension — FK to method.inputs[].name. Required on inputDataStructure.measures[] items; rejected on outputDataStructure.measures[] items.",
    "measures[].output":    "AC/DC extension — FK to method.outputs[].name. Required on outputDataStructure.measures[] items; rejected on inputDataStructure.measures[] items.",
    "dimensions[].input":   "AC/DC extension on inputDataStructure.dimensions[] only — marks the dim as filling a specific method input slot (e.g. Treatment → fixed_effect). Rejected on outputDataStructure.dimensions[].",
    "measures[].slice":           "AC/DC extension on inputDataStructure.measures[] only — pre-filter this measure's cube to the named slice before the method sees it.",
    "sliceKeys[].source":         "AC/DC extension on qb:SliceKey — declares where the fixed-dim value comes from at run time (e.g. the endpoint's biomedicalConcept attribute). Vanilla qb:SliceKey lists only WHICH dim is fixed; our parameterized SliceKeys also say WHERE THE VALUE BINDS FROM.",
    "slices[].constraints[].value as \"{placeholder}\"": "AC/DC extension — slice TEMPLATES whose dimension values are bound at study-spec time from sliceKeys. A true qb:Slice has literal values; we instantiate the template into one at execution.",
    "*.conceptCategory":          "AC/DC extension — references a category instead of a concrete concept; the user picks a member at study-spec time."
  }
}
```

**No structural divergence from qb.** A previous draft flattened the two DSDs into one logical structure for authoring ergonomics; that was discarded in favour of explicit twin DSDs that map 1:1 to qb. The cost is dimension duplication when both cubes share a dim (the common case); the authoring UI absorbs that cost.

### 6.6 Validation contracts

The schema (and a JSON-Schema-based validator) enforce:

1. **`usesMethod` resolves.** Must match an existing `method.conceptId`.
2. **FK fields resolve into the named method:**
   - `inputDataStructure.dimensions[].input` (when present), `inputDataStructure.measures[].input` (required) ∈ `method.inputs[].name`
   - `outputDataStructure.measures[].output` (required) ∈ `method.outputs[].name`
   - `input` is rejected on `outputDataStructure.*` items; `output` is rejected on `inputDataStructure.*` items.
3. **`methodConfigurations` is valid:**
   - Every `configurationName` ∈ `method.configurations[].name`
   - Every `value` matches the configuration's `dataType` and (if present) `enumValues`
4. **Slice references resolve.**
   - `inputDataStructure.measures[].slice` ∈ `inputDataStructure.slices[].name`
   - `inputDataStructure.slices[].constraints[].dimension` ∈ `inputDataStructure.dimensions[].conceptCategory` ∪ `inputDataStructure.dimensions[].concept` (same applies inside `outputDataStructure.slices[]` if used)
   - Every `{placeholder}` in `slices[].constraints[].value` either resolves to a `sliceKeys[].source`-supplied value (`{parameter}`, `{visit}`, `{population}`) or to a transformation-local constant (`{baseline_visit}` — flagged for the endpoint to supply or the transformation to default).
5. **sliceKeys references resolve.** `sliceKeys[].dimension` ∈ `inputDataStructure.dimensions[].conceptCategory` ∪ `inputDataStructure.dimensions[].concept`; `sliceKeys[].source` is one of the recognized endpoint-spec attribute names (`biomedicalConcept`, `visit`, `population`, ...).
6. **Cardinality respected.** When several `inputDataStructure.measures[]` or `inputDataStructure.dimensions[]` bindings share the same `input` FK, their count satisfies the method's `inputs[].cardinality` (`single` / `multiple`).
7. **Concept / conceptCategory references resolve.** Against the concept files declared in `$references` (`Option_B_Clinical.json` for derivation transformations, `AC_Concept_Model_v017.json` for analyses).
8. **Mutual exclusion.** `concept` XOR `conceptCategory` on each binding item (never both).
9. **Twin-DSD consistency advisory (non-blocking).** The validator emits a warning when a dim appears on one side and not the other without a documented reason (e.g. an aggregation that legitimately drops Timing). This catches drift between the two `dimensions[]` lists without forbidding the legitimate diverge-case.
10. **Output-type compatibility (atomic outputs).** For each `outputDataStructure.measures[]` item whose bound method-output has `output_type: "computed_value"` (atomic): the method-output's `dataType` (`decimal` | `integer` | `code` | `boolean` | `date`) must be compatible with the bound concept's `result.valueType`. Compatibility table:
    - `decimal` / `integer` → compatible with FHIR `Quantity`, `Count`, `Duration`, and Option_B `NumericValue`.
    - `code` → compatible with FHIR `CodeableConcept`, `Coding`, and Option_B `CodedResponse`.
    - `boolean` → compatible with `boolean`.
    - `date` → compatible with FHIR `date`, `dateTime`.
    - Mismatched bindings (e.g. method emits `code`, concept requires `Quantity`) are rejected.
11. **Output-type compatibility (structured outputs).** For each `outputDataStructure.measures[]` item whose bound method-output has `output_type` referencing a structured-table template (e.g. `ls_means`, `type3_tests_f`, `contrasts_t`, ...):
    - **Constituents alignment.** The template's `statistics[]` list MUST be the same set as the bound AC concept's `constituents[]` list (modulo the case/naming reconciliation in §3.7).
    - **Per-statistic dataType.** Each statistic's dataType in `statistics_vocabulary.json` MUST equal the corresponding AC atomic concept's dataType in `AC_Concept_Model_v017.json.sharedStatisticsVocabulary`.
    - **Dimension chain-resolution.** The bound AC concept's `dimensions[]` (e.g. `["factor", "level"]`) describes a *semantic* dimensional shape — concepts know nothing about methods. The actual identity of each dimension is resolved at validation time by walking the transformation's existing bindings:
        1. Read the method-output's `indexed_by` (e.g. `["fixed_effect"]`).
        2. For each input slot named in `indexed_by`, look up its binding in `inputDataStructure.measures[]` or `inputDataStructure.dimensions[]` within the same transformation. That binding's `concept` (or `conceptCategory`) is the identity of the corresponding AC `factor`-class dimension (e.g. `Treatment`).
        3. The AC concept's `level`-class dimension is implicit: the runtime values of the resolved concept (e.g. `Drug A`, `Drug B`, `Placebo` from the bound Treatment column).
    - **Multi-factor outputs** (e.g. M.MMRM's `ls_means` with `indexed_by: ["fixed_effect", "repeated_factor"]`): the chain resolves each `indexed_by` slot independently, producing N (factor, level) pairs. The AC concept's flat `dimensions` field is interpreted as "this many factor/level pairs per row" — the concept stays generic; the transformation chain fills in the specifics.
    - **No `dimension_bindings` block is added to transformations.** The information is already present through the input bindings; the validator/resolver walks it.

### 6.7 Worked example — T.BaselineSelection before / after

**Before** (today):

```jsonc
{
  "oid": "T.BaselineSelection",
  "name": "Baseline Selection",
  "transformationType": "derivation",
  "description": "Identify the baseline record per subject per parameter using M.RecordSelection configured for baseline.",
  "instanceOf": "Flag",
  "usesMethod": "M.RecordSelection",
  "methodConfigurations": [
    { "configurationName": "selection_rule",  "value": "last_non_missing" },
    { "configurationName": "scope",           "value": "pre_treatment" },
    { "configurationName": "cardinality",     "value": "single" },
    { "configurationName": "reference_event", "value": "first_dose" }
  ],
  "validSmartPhrases": [],
  "bindings": [
    { "concept": "Measure",      "requiredValueType": null,
      "note": "RecordSelection operates on records, not values — no value type constraint",
      "direction": "input",  "dataStructureRole": "measure",   "methodRole": "value" },
    { "concept": "Flag",
      "direction": "output", "dataStructureRole": "measure",   "methodRole": "flag" },
    { "concept": "Subject",
      "direction": "input",  "dataStructureRole": "dimension", "methodRole": "partition" },
    { "conceptCategory": "ParameterDimension",
      "direction": "input",  "dataStructureRole": "dimension", "methodRole": "partition" },
    { "conceptCategory": "VisitDimension",
      "direction": "input",  "dataStructureRole": "dimension", "methodRole": "partition" }
  ]
}
```

**After** (proposed):

```jsonc
{
  "conceptId":          "T.BaselineSelection",
  "label":              "Baseline Selection",
  "shortLabel":         "Baseline",
  "transformationType": "derivation",
  "description":        "Identify the baseline record per subject per parameter using M.RecordSelection configured for baseline.",
  "usesMethod":         "M.RecordSelection",

  "methodConfigurations": [
    { "configurationName": "selection_rule",  "value": "last_non_missing" },
    { "configurationName": "scope",           "value": "pre_treatment" },
    { "configurationName": "cardinality",     "value": "single" },
    { "configurationName": "reference_event", "value": "first_dose" }
  ],

  "inputDataStructure": {
    "dimensions": [
      { "input": "partition", "concept": "Subject" },
      { "input": "partition", "conceptCategory": "ParameterDimension" },
      { "input": "partition", "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "input": "value", "concept": "Measure", "requiredValueType": null }
    ]
  },

  "outputDataStructure": {
    "dimensions": [
      { "concept": "Subject" },                          // duplicated, no input FK
      { "conceptCategory": "ParameterDimension" },       // duplicated
      { "conceptCategory": "VisitDimension" }            // duplicated
    ],
    "measures": [
      { "output": "derived_value", "concept": "Flag" }
    ]
  },

  "validSmartPhrases": []
}
```

What changed (mechanical):

- `oid` → `conceptId`; `name` → `label` (plus `shortLabel` added).
- `instanceOf: "Flag"` removed (subsumed by the output-side measure binding's `concept`).
- `bindings[]` split into twin `inputDataStructure` / `outputDataStructure` blocks, each a `qb:DataStructureDefinition` 1:1 (§6.5). Dimensions that appear on both cubes are listed in both arrays.
- Per-item `direction`, `dataStructureRole`, `methodRole` removed; replaced by block placement + `input`/`output` FK fields.
- The output FK changed from `methodRole: "flag"` to `output: "derived_value"` — this assumes the method-side rename to the standardized derivation output slot name `derived_value` (§3.6 examples). If `M.RecordSelection` declares a `flag` output slot instead, the FK stays `output: "flag"`.
- Output-side dims drop the `input: "partition"` FK — `input` is rejected on `outputDataStructure.*` items (the output is what the transformation *produces*, not what the method consumes).
- This transformation has no `sliceKeys` and no `slices` — `M.RecordSelection` operates on the full cube; no slice templates needed.
- The `T.BaselineSelection` entry in the current library has no `composedPhrase` field to drop (its `validSmartPhrases[]` is empty). Transformations that DO carry `composedPhrase` today (e.g. `T.ChangeFromBaseline`, `T.CFB_ANCOVA`, `T.CFB_MMRM_Primary`) have the field stripped per §6.9 step 5 — the rendered phrase becomes a UI-layer derivation from `validSmartPhrases[]` + sliceKey-bound values.

### 6.8 Worked example — analysis transformation (`T.CFB_ANCOVA`)

This is the existing `T.CFB_ANCOVA` from `ACDC_Transformation_Library_v06.json` (lines 1287–1394), migrated to the new shape. Every concept name appears in `Option_B_Clinical.json` (dimension / input-measure side) or `AC_Concept_Model_v017.json` (output-measure side); no concepts are invented.

```jsonc
{
  "conceptId":          "T.CFB_ANCOVA",
  "label":              "Change From Baseline ANCOVA",
  "shortLabel":         "CFB ANCOVA",
  "transformationType": "analysis",
  "description":        "ANCOVA on change from baseline at a specific visit, comparing treatment groups with baseline as covariate.",
  "usesMethod":         "M.ANCOVA",

  "methodConfigurations": [
    { "configurationName": "ss_type", "value": "III" }
  ],

  "inputDataStructure": {
    "dimensions": [
      // Bound dim — fills the method's fixed_effect slot.
      { "input": "fixed_effect", "concept": "Treatment" },

      // Context dims — pure cube scope, no method-input FK. Pinned at study
      // time via sliceKeys below.
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],

    "measures": [
      // Response: the *Change* cube, sliced to the endpoint (this parameter,
      // this analysis visit, this population).
      { "input":       "response",
        "concept":           "Change",
        "requiredValueType": "Quantity",
        "slice":             "endpoint" },

      // Covariate: a *Measure* cube, sliced to the SAME parameter and
      // population but a DIFFERENT visit ({baseline_visit} instead of
      // {visit}). The slice diff is the load-bearing signal.
      { "input":       "covariate",
        "concept":           "Measure",
        "requiredValueType": "Quantity",
        "slice":             "parameter_baseline",
        "description":       "Baseline value of the endpoint parameter" }
    ],

    "slices": [
      {
        "name": "endpoint",
        "description": "The endpoint's analysis cube: this parameter, this analysis visit, this population.",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{visit}" },
          { "dimension": "Population",         "value": "{population}" }
        ]
      },
      {
        "name": "parameter_baseline",
        "description": "Same parameter and population as the endpoint, but at the baseline visit instead of the analysis visit.",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{baseline_visit}" },
          { "dimension": "Population",         "value": "{population}" }
        ]
      }
    ]
  },

  "outputDataStructure": {
    "dimensions": [
      // All input dims carry forward — listed explicitly. No input FK
      // on the output side (the dims are not method args here).
      { "concept": "Treatment" },
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      // Each method-output slot binds to an AC result pattern from
      // AC_Concept_Model_v017.json. No invented concepts.
      { "output": "ls_means",                   "concept": "LSMeans" },
      { "output": "contrasts_t",                "concept": "Contrasts" },
      { "output": "type3_tests_f",              "concept": "Type3Tests" },
      { "output": "parameter_estimates_linear", "concept": "ParameterEstimates" },
      { "output": "fit_statistics_linear",      "concept": "FitStatistics" }
    ]
  },

  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" },
    { "dimension": "Population",         "source": "population" }
  ],

  "validSmartPhrases": [
    "SP_CFB_ENDPOINT", "SP_PARAMETER", "SP_TIMEPOINT", "SP_POPULATION",
    "SP_GROUPING", "SP_METHOD_ANCOVA", "SP_CONFIDENCE_LEVEL",
    "SP_COVARIATE_BASELINE", "SP_COVARIATE_SITE"
  ]
}
```

What this example demonstrates:

- **Real concepts only.** Inputs/dimensions bind to atomic clinical concepts from `Option_B_Clinical.json` (`Change`, `Measure`, `Treatment`, `Subject`). Outputs bind to AC result patterns from `AC_Concept_Model_v017.json` (`LSMeans`, `Contrasts`, `Type3Tests`, `ParameterEstimates`, `FitStatistics`). The transformation is *parameterized*, not concept-specific — the same `T.CFB_ANCOVA` serves SBP, DBP, heart rate, or any parameter whose AC endpoint is "change from baseline at a visit."
- **Both inputs cite a named slice — no implicit slicing.** The endpoint and the covariate are both filtered views, declared symmetrically in `inputDataStructure.slices[]`. The diff between the two slices (`{visit}` vs `{baseline_visit}`) is the load-bearing signal that says "the covariate is the baseline value of the same parameter and population." Nothing is hidden in engine convention.
- **The bound/context dim distinction.** `Treatment` carries `input: "fixed_effect"` on the input side — the method consumes it as an argument. `Subject` / `ParameterDimension` / `VisitDimension` carry no `input` — the method doesn't take them, but the cube still has them (and they pin the slice). On the output side, `Treatment` reappears as a plain dim (the output cube has Treatment too, but it's not a method arg there).
- **Every method output binds cleanly.** Each of M.ANCOVA's five output slots has a 1:1 match in an AC result pattern.
- **Twin-DSD shape is qb-aligned.** `inputDataStructure` and `outputDataStructure` are each `qb:DataStructureDefinition`s 1:1. The four dim entries listed twice (Treatment, Subject, ParameterDimension, VisitDimension) reflect that both cubes really do have those dims; the duplication is qb-honest, not a denormalization to undo at conversion time.

### 6.9 Migration of the transformation library

In addition to the method migration in §5:

1. **Schema first.** Write `model/transformation/acdc_transformation.schema.json` encoding §6.2–§6.6.
2. **Update `_w3c_alignment` block** at the top of the transformation library file (§6.5).
3. **Rewrite each entry** in `derivationTransformations[]` and `analysisTransformations[]` to the new shape (mechanical mapping per §6.7). Merge both arrays into one `transformations[]`.
4. **Drop `instanceOf`** during the rewrite — confirm each transformation's output bindings carry the same concept it previously held.
5. **Drop `composedPhrase`** during the rewrite. The rendered phrase is generated at display time from `validSmartPhrases[]` + sliceKey-supplied values (§6.2 table). Verify each transformation's `validSmartPhrases[]` list is complete enough that the render produces the same phrase the old `composedPhrase` field held; flag any divergences before the field is removed.
6. **Validate FKs** against the migrated method files (§5 step 4) — every `input`/`output` reference must resolve.
7. **Update consumers** (app code, validators) that read the old `bindings[].direction` / `dataStructureRole` / `methodRole` / `oid` / `instanceOf` / `composedPhrase` fields. The composed-phrase render becomes a UI/export utility.

Steps 1–3 produce a working state; 4–7 finish the migration.

### 6.10 Alternative transformation shapes considered

This appendix records the three transformation-shape options that were on the table during the §6 design discussion, with the same two example transformations (`T.ChangeFromBaseline` and `T.CFB_ANCOVA`) shown in each shape. Option B was chosen; A and C are preserved here so future readers know the choice was deliberate and what costs were knowingly paid.

All three options share the same slice-expression pattern (every input cites a named slice; no implicit slicing) so the comparison is purely about DSD shape.

#### Option A — Flattened (one logical cube)

Top-level `dimensions[]` + `measures[]`. Direction of a measure is inferred from `input` vs `output` on each entry. No partitioning into input/output blocks.

```jsonc
// T.ChangeFromBaseline
{
  "conceptId": "T.ChangeFromBaseline", "label": "Change From Baseline", "shortLabel": "CFB",
  "transformationType": "derivation", "usesMethod": "M.Subtraction",
  "methodConfigurations": [],
  "dimensions": [
    { "concept": "Subject" },
    { "conceptCategory": "ParameterDimension" },
    { "conceptCategory": "VisitDimension" }
  ],
  "measures": [
    { "input": "minuend",    "concept": "Measure", "requiredValueType": "Quantity",
      "slice": "endpoint",           "description": "Current visit value" },
    { "input": "subtrahend", "concept": "Measure", "requiredValueType": "Quantity",
      "slice": "parameter_baseline", "description": "Baseline value" },
    { "output": "difference", "concept": "Change" }
  ],
  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" }
  ],
  "slices": [
    { "name": "endpoint",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{visit}" } ] },
    { "name": "parameter_baseline",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{baseline_visit}" } ] }
  ]
}
```

```jsonc
// T.CFB_ANCOVA
{
  "conceptId": "T.CFB_ANCOVA", "label": "Change From Baseline ANCOVA", "shortLabel": "CFB ANCOVA",
  "transformationType": "analysis", "usesMethod": "M.ANCOVA",
  "methodConfigurations": [{ "configurationName": "ss_type", "value": "III" }],
  "dimensions": [
    { "input": "fixed_effect", "concept": "Treatment" },
    { "concept": "Subject" },
    { "conceptCategory": "ParameterDimension" },
    { "conceptCategory": "VisitDimension" }
  ],
  "measures": [
    { "input":  "response",  "concept": "Change",  "requiredValueType": "Quantity",
      "slice": "endpoint" },
    { "input":  "covariate", "concept": "Measure", "requiredValueType": "Quantity",
      "slice": "parameter_baseline", "description": "Baseline value of the endpoint parameter" },
    { "output": "ls_means",                   "concept": "LSMeans" },
    { "output": "contrasts_t",                "concept": "Contrasts" },
    { "output": "type3_tests_f",              "concept": "Type3Tests" },
    { "output": "parameter_estimates_linear", "concept": "ParameterEstimates" },
    { "output": "fit_statistics_linear",      "concept": "FitStatistics" }
  ],
  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" },
    { "dimension": "Population",         "source": "population" }
  ],
  "slices": [
    { "name": "endpoint",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{visit}" },
        { "dimension": "Population",         "value": "{population}" } ] },
    { "name": "parameter_baseline",
      "constraints": [
        { "dimension": "ParameterDimension", "value": "{parameter}" },
        { "dimension": "VisitDimension",     "value": "{baseline_visit}" },
        { "dimension": "Population",         "value": "{population}" } ] }
  ]
}
```

**Pros**
- Most compact authoring: dimensions that appear on both cubes are written once.
- Smallest amount of JSON for the common "all dims carry forward" case.
- Closest to the existing library's flat `bindings[]` array (smallest mental jump for current authors).

**Cons**
- **Not 1:1 with qb.** `qb:DataStructureDefinition` describes one DSD per dataset; this shape blends two DSDs (input + output) into one logical cube with direction-tagged measures. A JSON→RDF converter must re-derive the two real DSDs by partitioning `measures[]` on `input` vs `output`.
- **Aggregations need special syntax.** A transformation that drops a dim on output (e.g. `T.PeakConcentration` collapses Timing) has no clean way to express that without a bolted-on per-dim `scope: "input_only" / "both"` field.
- **No clean home for output-side slices.** If a transformation wants to publish named slices of its OUTPUT cube (e.g. "LS means at Week 24"), there's nowhere to put them — `slices[]` is implicitly input-side only.
- **The "input cube" and "output cube" notions are implicit.** A reader must mentally split `measures[]` by FK presence to understand the two cubes.

#### Option B — Strict twin DSDs (CHOSEN)

Each transformation declares two `qb:DataStructureDefinition`s explicitly: `inputDataStructure` and `outputDataStructure`. Shared dims are listed in both. No carry-forward shorthand.

This is the shape adopted in §6.3, §6.7, §6.8. Full worked examples for `T.BaselineSelection` and `T.CFB_ANCOVA` appear in §6.7 and §6.8 respectively; `T.ChangeFromBaseline` follows the same pattern with `M.Subtraction`'s `minuend` / `subtrahend` / `difference` slots in place of ANCOVA's.

**Pros**
- **1:1 with qb.** Each `*DataStructure` block IS a `qb:DataStructureDefinition`. JSON→RDF emits two real DSDs with no re-derivation step. The schema reflects the actual data flow exactly.
- **Aggregations are natural.** A transformation that drops a dim (`T.PeakConcentration` drops Timing; `T.ADAS_MissingScaleCapacity` collapses Topic) simply doesn't list that dim in `outputDataStructure.dimensions`. No special syntax.
- **Output-side slices have a home.** If a transformation wants to publish named slices of its output, they go in `outputDataStructure.slices[]`. Permitted; typically empty.
- **Reading the JSON tells you what each cube looks like.** No mental split required.
- **Validator is simpler.** Each block validates independently — no rules about "this field is allowed on input-direction measures but rejected on output-direction measures within the same array."

**Cons**
- **Dimension duplication.** When both cubes share a dim (the common case — `T.CFB_ANCOVA` repeats four dim entries; `T.ChangeFromBaseline` repeats three), authors write the entry twice. Drift between the two lists is possible.
- **More keystrokes** for hand-edited files. The authoring UI absorbs this; hand-edit becomes the exception.

**Costs accepted**
- The duplication cost (~3–4 dim entries × ~30 transformations in the current library) is one-time at migration and ongoing during UI-assisted authoring. Manageable.
- The validator emits a non-blocking advisory when a dim appears on one side and not the other without comment (§6.6 #9) — catches accidental drift while allowing legitimate diverge (aggregations).

#### Option C — Twin DSDs with carry-forward shorthand

Same two-block skeleton as Option B, but the output side can declare `dimensionsFrom: "input"` + optional `dimensionsDrop` / `dimensionsAdd` instead of listing every dim. The common all-carry-forward case becomes a one-line directive.

```jsonc
// T.ChangeFromBaseline
{
  "conceptId": "T.ChangeFromBaseline", "label": "Change From Baseline", "shortLabel": "CFB",
  "transformationType": "derivation", "usesMethod": "M.Subtraction",
  "methodConfigurations": [],
  "inputDataStructure": {
    "dimensions": [
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "input": "minuend",    "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "endpoint",           "description": "Current visit value" },
      { "input": "subtrahend", "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "parameter_baseline", "description": "Baseline value" }
    ],
    "slices": [
      { "name": "endpoint",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{visit}" } ] },
      { "name": "parameter_baseline",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{baseline_visit}" } ] }
    ]
  },
  "outputDataStructure": {
    "dimensionsFrom": "input",
    "dimensionsDrop": [],
    "dimensionsAdd":  [],
    "measures": [
      { "output": "difference", "concept": "Change" }
    ]
  },
  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" }
  ]
}
```

```jsonc
// T.CFB_ANCOVA
{
  "conceptId": "T.CFB_ANCOVA", "label": "Change From Baseline ANCOVA", "shortLabel": "CFB ANCOVA",
  "transformationType": "analysis", "usesMethod": "M.ANCOVA",
  "methodConfigurations": [{ "configurationName": "ss_type", "value": "III" }],
  "inputDataStructure": {
    "dimensions": [
      { "input": "fixed_effect", "concept": "Treatment" },
      { "concept": "Subject" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" }
    ],
    "measures": [
      { "input": "response",  "concept": "Change",  "requiredValueType": "Quantity",
        "slice": "endpoint" },
      { "input": "covariate", "concept": "Measure", "requiredValueType": "Quantity",
        "slice": "parameter_baseline", "description": "Baseline value of the endpoint parameter" }
    ],
    "slices": [
      { "name": "endpoint",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{visit}" },
          { "dimension": "Population",         "value": "{population}" } ] },
      { "name": "parameter_baseline",
        "constraints": [
          { "dimension": "ParameterDimension", "value": "{parameter}" },
          { "dimension": "VisitDimension",     "value": "{baseline_visit}" },
          { "dimension": "Population",         "value": "{population}" } ] }
    ]
  },
  "outputDataStructure": {
    "dimensionsFrom": "input",
    "dimensionsDrop": [],
    "dimensionsAdd":  [],
    "measures": [
      { "output": "ls_means",                   "concept": "LSMeans" },
      { "output": "contrasts_t",                "concept": "Contrasts" },
      { "output": "type3_tests_f",              "concept": "Type3Tests" },
      { "output": "parameter_estimates_linear", "concept": "ParameterEstimates" },
      { "output": "fit_statistics_linear",      "concept": "FitStatistics" }
    ]
  },
  "sliceKeys": [
    { "dimension": "ParameterDimension", "source": "biomedicalConcept" },
    { "dimension": "VisitDimension",     "source": "visit" },
    { "dimension": "Population",         "source": "population" }
  ]
}
```

**Pros**
- Carries Option B's qb fidelity after `dimensionsFrom` is mechanically expanded — both blocks resolve to real `qb:DataStructureDefinition`s.
- No dimension duplication for the all-carry-forward case (the common one).
- Aggregations are natural: `"dimensionsDrop": ["Timing"]` reads cleanly.

**Cons**
- **Expansion step before validation.** The validator (and the JSON→RDF converter) must resolve `dimensionsFrom` / `dimensionsDrop` / `dimensionsAdd` before doing any cross-block consistency check. Two layers of representation (authored + expanded) means more places for mismatch.
- **Two ways to express the same thing.** Authors can write either an explicit dim list OR `dimensionsFrom`, even within the same library. Linting can normalize, but the schema admits both forms.
- **Hides the "two cubes" structure from a casual reader.** With Option B you see the output cube's dims directly; with Option C you see a directive and have to mentally expand.
- **Output-side slices that reference output-only dims are awkward.** If `dimensionsAdd` introduces a dim, output slices that constrain it must wait for expansion to be valid.

#### Comparison summary

| Aspect | Option A (flattened) | Option B (strict twin DSD) | Option C (twin DSD + shorthand) |
|---|---|---|---|
| qb fidelity | 1 logical cube ≠ qb (qb has 2 datasets) | 1:1 with two `qb:DataStructureDefinition`s | 1:1 once `dimensionsFrom` is expanded |
| Dim duplication (CFB/ANCOVA case) | none | 3 / 4 dim entries duplicated | none (shorthand) |
| Direction signal | `input` vs `output` FK on each measure | block name (`inputDataStructure` vs `outputDataStructure`) | block name |
| Aggregations (T.PeakConcentration drops Timing) | needs a per-dim `scope` field bolted on | natural (omit Timing from `outputDataStructure.dimensions`) | natural (`"dimensionsDrop": ["Timing"]`) |
| Output-side slices | nowhere to put them | `outputDataStructure.slices` | `outputDataStructure.slices` |
| Author effort, simplest CFB case | smallest | largest (most duplication) | small (shorthand collapses common case) |
| Validator complexity | medium (must enforce in/out partition by FK) | low (each block validates independently) | medium (must resolve `dimensionsFrom` before validating output) |
| Two ways to write the same thing | no | no | yes (explicit list OR `dimensionsFrom`) |

#### Decision

**Option B (strict twin DSDs)** was adopted on 2026-05-28. The deciding factors:

1. **Schema fidelity to qb matters more than authoring brevity.** Schemas live for years; UI absorbs hand-authoring cost.
2. **One representation, not two.** Option C's shorthand creates two valid ways to write the same transformation, which fragments tooling and review.
3. **The JSON IS the truth.** No expansion step between what's authored and what gets validated/converted. A diff in code review reads as the actual cube structure, not as a directive that resolves to one.
4. **Aggregations stop being a special case.** ~20% of the existing library's transformations change DSD between input and output (aggregations, event-aggregates). Option B handles them with the same machinery as carry-forward cases.

What we accepted: dimension duplication for the carry-forward case (~3–4 entries per analysis transformation, ~3 for the typical derivation), absorbed by the authoring UI. The non-blocking twin-DSD consistency advisory (§6.6 #9) catches drift without forbidding legitimate diverge.

## 7. Open questions

- **`unit_policy` on inferential outputs.** Decision is "omit it." If a downstream consumer needs it (e.g. to render a contrast estimate with units), it can read the policy from the *companion* value-bearing output of the same method. Confirm this is acceptable.
- **`assumptions[]` semantics.** Currently a free-text list (`"Pre value is non-zero"`). Should these be machine-readable predicates? Out of scope here but worth noting.
- **Multiplicity-adjustment configurations.** Deferred (§3.5.5). When revisited, decide whether they live per-output or as a method-level configuration that applies to all p-value-bearing outputs.
- **Code-list authoring workflow for the new vocabularies.** Three new SKOS-shaped files appear; need to decide whether to author them by hand, generate from the migration, or anchor them in NCI EVS / STATO where possible.
- **`sliceKeys[].source` vocabulary is informal (§6.4, §6.5).** The existing transformation library uses three values across 31 sites — `biomedicalConcept`, `visit`, `population` — but no schema defines what's allowed. Decide whether to (a) freeze the set into a controlled vocabulary in the schema, (b) define an `endpoint_spec_attributes.json` vocab file that mirrors the endpoint spec's authoring model, or (c) leave it open-string with a validator warning.
- **`ParameterDimension` / `VisitDimension` concept categories are referenced but undefined.** The existing library uses these in `conceptCategory:` slots, and the library's `$references` block points to `model/concept/concept_categories.json` — but that file does not exist on disk. Pre-existing schema gap; the new transformation schema (§6.6 validation #7) will fail closed unless the file is authored. Either create the file, or change category references to bare concrete concepts (e.g. use `Population` directly the way the existing library already does for population).
- *Resolved 2026-05-28: twin `inputDataStructure` / `outputDataStructure` blocks (§6.3, §6.5). qb-aligned 1:1; dimension duplication accepted as the cost, absorbed by the authoring UI.*
- **Dimension carry-forward semantics (§6.3 note 1).** Carry-forward is implicit today ("input dimensions appear on the output cube unless overridden"). Decide whether the schema needs an explicit per-dimension `carryForward: false` escape for the rare case a method consumes a dimension without exposing it on the output (e.g. an aggregation that collapses Visit).
- **`attributes[]` reservation (§6.3).** Add now (empty arrays everywhere) or defer until a concrete use case lands. Recommendation in §6.3 is to defer; confirm.
- **Identifier prefix policy.** Methods use `M.<Name>`; transformations use `T.<Name>`. Concepts use the bare name (`Flag`, `Measure`). Should the schema enforce the prefix per file type, or is this purely convention?

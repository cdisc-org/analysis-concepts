# ACDC Method & Output-Type Schema Alignment

**Status:** Draft for review
**Date:** 2026-05-27
**Owner:** kwl
**Scope:** `lib/methods/`, `lib/vocabulary/`, and the binding contract with `lib/transformations/`

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
- Changing the transformation library schema. We rely on the existing `bindings[].methodRole` contract.
- Multiplicity-adjustment configuration — explicitly out of scope for this revision (per spec discussion).

## 3. Decisions

### 3.1 Single source of truth for methods

- **Delete** `lib/methods/AllMethods.json`.
- Per-file `lib/methods/{analyses,derivations}/M_*.json` files are canonical.
- `lib/methods/_index.json` is a build artifact: it is generated from the per-file fields (`name`, `label`, `shortLabel`, `type`, `class`, `intent`). Hand-editing `_index.json` is no longer required.
- Before deletion of `AllMethods.json`, harvest the `ncitCode` placeholders (e.g. `C00001_NEW`) into the per-file `code.value` field. See §3.3.

### 3.2 Method file canonical structure

```json
{
  "$schema": "../../model/method/acdc_methods.schema.json",
  "schema_version": "0.10.0",
  "$vocabulary": {
    "statistics":     "../../model/method/statistics_vocabulary.json",
    "output_classes": "../../model/method/output_class_vocabulary.json",
    "shapes":         "../../model/method/output_shape_vocabulary.json",
    "distributions":  "../../model/method/distribution_vocabulary.json",
    "formula_grammar":"../../model/method/formula_grammar.json"
  },

  "conceptId":       "M.ANCOVA",                   // canonical id; matches file basename
  "label":      "ANCOVA",
  "shortLabel": "ANCOVA",
  "code":       { "system": "NCI", "value": "C00001_NEW" },
  "codings":    [ { "system": "http://purl.obolibrary.org/obo/stato",
                    "code": "STATO_0000179", "display": "ANCOVA" } ],

  "type":  "analysis | derivation",
  "class": "General Linear Models",
  "intent":["GroupComparison"],
  "description": "...",

  "formula": {
    "notation":           "wilkinson_rogers | assignment | survival",
    "default_expression": "response ~ covariate + fixed_effect",
    "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+",
    "notes":              "..."
  },

  "unit_policy": "preserved | dimensionless | derived",

  "configurations": [ { "name", "dataType", "defaultValue",
                        "enumValues?", "description",
                        "conforms_to?" /* link to a vocabulary term */ } ],

  "methodInput":  [ /* see §3.4 */ ],
  "methodOutput": [ /* see §3.5 (analysis) or §3.6 (derivation) */ ],

  "assumptions": []
}
```

Notes:

- `conceptId` is the canonical identifier. It MUST match the file basename minus `.json` (e.g. `M_ANCOVA.json` → `conceptId: "M.ANCOVA"`). This name preserves the legacy field used in `AllMethods.json` and avoids confusion with the slot-level `name` field inside `methodInput[]`/`methodOutput[]`.
- `code.value` carries the NCI C-code (currently the `C00001_NEW`-style placeholder, eventually the real C-code). `codings[]` carries supplementary external code system mappings (STATO etc.).
- `label` and `shortLabel` are consumed both by UI surfaces AND by **SmartPhrase rendering** in the transformation library (`lib/transformations/ACDC_Transformation_Library_v06.json`). When a SmartPhrase template references a method via the `method` role, the rendered phrase substitutes the method's `label` (full form) or `shortLabel` (compact form), so both fields are part of the public contract — not just decoration.
- `shortLabel` is required for analysis methods (so SmartPhrases have a compact form to render — e.g. "ANCOVA", "MMRM"). For derivations it's required when the method has a recognized compact form (e.g. `%CFB` for `M.PercentChange`) and otherwise falls back to `label`.

### 3.3 Identity and codings

The `conceptId` / `code` / `codings` triad replaces the legacy split:

| Legacy (`AllMethods.json`) | New (per-file) |
|---|---|
| `conceptId: "M.ANCOVA"` | `conceptId: "M.ANCOVA"` (unchanged) |
| `ncitCode: "C00001_NEW"` | `code: { "system": "NCI", "value": "C00001_NEW" }` |
| `codings: [...]` | `codings: [...]` (unchanged) |

`conceptId` is the identifier other ACDC files reference (`usesMethod: "M.ANCOVA"` in the transformation library). `code` is the formal NCI registration, kept separate so we can populate it as codes are assigned without rewriting cross-references. The slot-level `name` field on `methodInput[]`/`methodOutput[]` items (the formula/binding role token, §3.4) is a different field and is unchanged by this decision.

### 3.4 Input / output naming as the formula and binding contract

The names in `methodInput[]` and `methodOutput[]` are **role tokens** with three simultaneous obligations:

1. **Formula contract.** Every `<x>` in `formula.generic_expression` MUST resolve to a `methodInput[i].name` or `methodOutput[i].name`. Cardinality suffixes (`*`, `+`, `?`) come from the formula grammar; the role token by itself names the slot.
2. **Transformation binding contract.** `bindings[].methodRole` in a transformation MUST equal a `methodInput[i].name` or `methodOutput[i].name`. (Today's example: `M.RecordSelection` declares `methodInput[].name = "value"`; `T.BaselineSelection` binds `methodRole: "value"`.)
3. **Indexing contract.** Strings in `methodOutput[i].indexed_by` MUST be input role names (or `role:role` interaction shorthand).

Implications:

- **No separate `statisticalRole` field.** The role IS the name. The roles `response`, `covariate`, `fixed_effect`, `strata`, `repeated_subject`, `repeated_factor` from the old `AllMethods.json` are kept as conventional names for analysis methods (and listed in the formula grammar's `<role_tag>` enum so a validator can recognize them), but they are not a separate slot of the schema.
- **Validation rules** (to add to `acdc_methods.schema.json` + a JSON-Schema-based validator):
  - Every `<token>` in `generic_expression` exists as an input or output name.
  - Every transformation `methodRole` resolves to the method's input/output names.
  - `indexed_by` entries reference input names (or `<input>:<input>` interactions).

`methodInput[]` item shape:

```json
{
  "name":        "response",          // role token (see above)
  "dataType":    "decimal | code | boolean | id",
  "required":    true,
  "cardinality": "single | multiple | single_or_multiple",
  "description": "..."
}
```

### 3.5 Analysis output type — three-axis decomposition

Each `methodOutput[i]` for an analysis method is a TABLE described by four axes plus an optional escape hatch:

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

### 3.6 Derivation output type — same shape, simpler vocabulary

Derivations don't carry inferential semantics, so `distribution` defaults to `"none"` and `shape` is typically `"computed_value"`. The interesting axis is the **value type** of the produced column. Two more keys:

```json
"methodOutput": [
  {
    "name":         "derived_value",
    "output_class": "scalar_value",       // or categorical_value | flag | datetime_value | count_value
    "shape":        "computed_value",
    "distribution": "none",
    "value_type":   "fhir:Quantity",      // structural type of the produced column
    "unit_policy":  "preserved",          // moved from method-level to per-output (see §3.6.1)
    "indexed_by":   ["partition"]
  }
]
```

#### 3.6.1 `unit_policy` moves to per-output

Currently `unit_policy` sits at the method level. Per-output is more accurate: a method that produces both a count and a ratio has two different policies. For analysis methods, `unit_policy` is set per output whose `output_class` is a *value-bearing* class (`ls_means`, `point_estimate`, `parameter_estimates`); on pure inferential outputs (`type3_tests`, `test_result`) it is omitted.

#### 3.6.2 Derivation outputs do NOT reference clinical concepts

The semantic typing of a derived value (Flag, Measure, Change, PercentChange, …) is **defined in `lib/concepts/Option_B_Clinical.json`** and **bound at the transformation layer**, not at the method layer. A derivation method is structural and reusable: `M.PercentChange` produces "a scalar percentage indexed by partition", and a transformation in `lib/transformations/ACDC_Transformation_Library_v06.json` decides that this particular use of `M.PercentChange` is `instanceOf: "PercentChange"` and binds the output to the `PercentChange` concept.

That separation is already in place:

```jsonc
// In ACDC_Transformation_Library_v06.json
{
  "oid": "T.BaselineSelection",
  "usesMethod": "M.RecordSelection",
  "instanceOf": "Flag",                    // ← semantic concept
  "bindings": [
    { "concept": "Flag",
      "direction": "output",
      "dataStructureRole": "measure",
      "methodRole": "flag" }                // ← matches methodOutput.name
  ]
}
```

This design preserves that contract: the method's `methodOutput[i].name` is the role token a transformation binds to.

### 3.7 Vocabulary alignment

| File | Role | Status |
|---|---|---|
| `lib/vocabulary/statistics_vocabulary.json` | Column-level semantic vocabulary (the "Semantic Statistical Definitions" layer in the architecture diagram). Each entry has dataType, description, and (where available) STATO codings. | Keep as-is; this is the reference. |
| `lib/vocabulary/output_class_templates.json` | Current SKOS family/concrete-template hierarchy. | **Replace** with three new files (§3.5.1–§3.5.3): `output_class_vocabulary.json`, `output_shape_vocabulary.json`, `distribution_vocabulary.json`. Keep the old file during migration; delete when all methods are migrated. |
| `lib/vocabulary/formula_grammar.json` | BNF for the formula DSL. | Update the `<role_tag>` enum's purpose: it lists *conventional* role names useful across analysis methods, but the validator enforces `<token>` resolution against the method's own `methodInput[]`/`methodOutput[]` `name` values, not against this enum. |
| `lib/vocabulary/fhir_value_types.json` | `value_type` enum for `methodOutput[].value_type`. | Reuse as-is. |

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
  "name": "M.ANCOVA", "label": "ANCOVA", "shortLabel": "ANCOVA",
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

**After** (proposed — switches the method identifier from `name` to `conceptId`):

```json
{
  "conceptId": "M.ANCOVA", "label": "ANCOVA", "shortLabel": "ANCOVA",
  "code": { "system": "NCI", "value": "C00001_NEW" },
  "codings": [ { "system": "http://purl.obolibrary.org/obo/stato",
                 "code": "STATO_0000179", "display": "ANCOVA" } ],
  "type": "analysis", "class": "General Linear Models",
  "intent": ["GroupComparison"],
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
    { "name": "response",     "dataType": "decimal", "required": true,  "cardinality": "single" },
    { "name": "covariate",    "dataType": "decimal", "required": false, "cardinality": "multiple" },
    { "name": "fixed_effect", "dataType": "code",    "required": true,  "cardinality": "single_or_multiple" }
  ],
  "methodOutput": [
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

- Method identifier renamed: `name` → `conceptId`.
- `code.value` populated.
- `methodOutput[].output_type` (single key into the SKOS catalogue) → four explicit axes.
- The split: one `parameter_estimates_linear` becomes `parameter_estimates` + `parameter_tests`; one `contrasts_t` becomes `contrast_estimates` + `contrast_tests`.
- Per-output `multiplicity_adjustment` configurations dropped (out of scope, §3.5.5).
- `unit_policy` lifted from method-level to per-output, only on value-bearing outputs.
- The slot-level `name` field on each `methodInput[i]` / `methodOutput[i]` stays as the role token transformations bind to via `methodRole`.

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

**After**:

```json
{
  "conceptId": "M.PercentChange", "label": "Percent Change", "shortLabel": "%CFB",
  "code": { "system": "NCI", "value": null },
  "type": "derivation", "class": "Arithmetic",
  "intent": ["ChangeComputation"],
  "description": "Computes proportional change as a percentage",
  "formula": {
    "notation": "assignment",
    "default_expression": "result := 100 * (post - pre) / pre",
    "generic_expression": "result := 100 * (<post> - <pre>) / <pre>"
  },
  "methodInput": [
    { "name": "pre",  "dataType": "decimal", "required": true, "cardinality": "single",
      "description": "The baseline/reference value" },
    { "name": "post", "dataType": "decimal", "required": true, "cardinality": "single",
      "description": "The post-baseline value" }
  ],
  "methodOutput": [
    {
      "name":         "derived_value",
      "output_class": "scalar_value",
      "shape":        "computed_value",
      "distribution": "none",
      "value_type":   "fhir:Quantity",
      "unit_policy":  "dimensionless"
    }
  ],
  "assumptions": ["Pre value is non-zero"]
}
```

The transformation that *uses* this method binds the output to the `PercentChange` clinical concept (`instanceOf: "PercentChange"`, `bindings[output].concept: "PercentChange"`, `methodRole: "derived_value"`). The method itself stays concept-free.

## 5. Migration plan

In order, each step landable on its own:

1. **Write `model/method/acdc_methods.schema.json`** (currently missing). Encode §3.2 + §3.4 validation rules.
2. **Write `output_class_vocabulary.json`, `output_shape_vocabulary.json`, `distribution_vocabulary.json`** under `lib/vocabulary/`. (Pre-existing inconsistency: per-file `$vocabulary` blocks reference `../../model/method/…`, but the actual files live in `lib/vocabulary/`. Pick one location during this migration and update the references in every method file accordingly. Recommendation: keep `lib/vocabulary/` since the files are already there.)
3. **Harvest `ncitCode` placeholders** from `AllMethods.json` into per-file `code.value`. Mechanical pass keyed on `name`.
4. **Rewrite per-file `methodOutput` blocks** from `output_type` → 4-axis. Most are mechanical: the current `output_class_templates.json` carries enough info (template family + statistics) to derive `(output_class, shape, distribution, additional_statistics)`. The splits (parameter_estimates → +parameter_tests, contrasts → +contrast_estimates/contrast_tests) need a manual one-time choice.
5. **Add per-output `unit_policy`** on value-bearing outputs of every analysis method; remove method-level `unit_policy` from analysis methods (keep it on derivations only as a fallback, or remove entirely once outputs all carry it).
6. **Upgrade derivation `methodOutput[]`** (~21 derivations) to the §3.6 form — mostly a `output_class`/`shape`/`distribution`/`value_type`/`unit_policy` block in place of the bare `output_type`.
7. **Generate `_index.json`** from per-file fields; mark the file as generated.
8. **Delete `AllMethods.json`** and the old `output_class_templates.json`.
9. **Update validators / app code** that read the old shape (search for `outputSpecifications`, `inputRoles`, `outputClass`, `indexedBy` in `lib/`, `model/`, and `ac-dc-app/`).

Steps 1–4 produce a working state; 5–9 finish the migration.

## 6. Open questions

- **`unit_policy` on inferential outputs.** Decision is "omit it." If a downstream consumer needs it (e.g. to render a contrast estimate with units), it can read the policy from the *companion* value-bearing output of the same method. Confirm this is acceptable.
- **`assumptions[]` semantics.** Currently a free-text list (`"Pre value is non-zero"`). Should these be machine-readable predicates? Out of scope here but worth noting.
- **Multiplicity-adjustment configurations.** Deferred (§3.5.5). When revisited, decide whether they live per-output or as a method-level configuration that applies to all p-value-bearing outputs.
- **Code-list authoring workflow for the new vocabularies.** Three new SKOS-shaped files appear; need to decide whether to author them by hand, generate from the migration, or anchor them in NCI EVS / STATO where possible.

# Contrast as a Separate Method — Design

**Date:** 2026-06-18
**Status:** Options for decision (team chose Scenario B — contrast as a method). Supersedes the Scenario-A lean in `2026-06-11-contrast-specification-design.md` §0/§9.

## 1. Fixed across all options

A contrast is `c = L·θ`, `Var(c) = L·Σ·Lᵀ`. Invariants:
1. **The method is the matrix algebra, concept-free** — inputs estimates `θ`, covariance `Σ`, coefficient matrix `L`; emits estimate/SE/test-statistic/p/CI.
2. **`L` stays on the transformation** — output `contrast` dimension's `contrastSpecification` (`over`/`basis`/`at`/`members`), unchanged from §3/§4.
3. **Assignment-style BNF formula** — matrix ops via the existing `<function_call>` production; document `MATMUL`/`TRANSPOSE`/`DIAG`/`SQRT` (no new grammar).
4. **Chaining is free** — a transformation consumes another's output by referencing the produced concept (concept-keyed cube; already how `T.CFB_ANCOVA` reads `Change`). No new chaining primitive.

### 1.1 The method, conformed to `acdc_method` schema
```jsonc
{
  "$schema": "../../../model/json_schema/acdc_method.schema.json",
  "schema_version": "0.9.1",
  "$vocabulary": {
    "statistics": "../../model/method/statistics_vocabulary.json",
    "output_classes": "../../model/method/output_class_templates.json",
    "formula_grammar": "../../model/method/formula_grammar.json"
  },
  "conceptId": "M.LinearContrast",
  "name": "Linear Contrast", "label": "Linear contrast", "ncitCode": null, "codings": [],
  "description": "Computes linear contrasts L·θ of model estimates with covariance propagation Var(Lθ)=L·Σ·Lᵀ. L comes from the bound output contrast dimension's contrastSpecification; df (when supplied) drives t inference, else normal/z.",
  "formula": {
    "notation": "assignment",
    "default_expression": "estimate := L %*% theta ; SE := sqrt(diag(L %*% Sigma %*% t(L))) ; t := estimate / SE",
    "generic_expression": "<contrast_estimates> := MATMUL(<coefficients>, <estimates>) ; SE := SQRT(DIAG(MATMUL(MATMUL(<coefficients>, <covariance>), TRANSPOSE(<coefficients>)))) ; <test_statistic> := <contrast_estimates> / SE",
    "notes": "Assignment grammar; matrix funcs extend the documented <function_call> set. The `covariance` input arrives as the long pairwise table (§2) and is assembled into Σ before MATMUL. p/CI from t(<df>) when df supplied, else normal."
  },
  "configurations": [
    { "name": "confidence_level", "dataType": "decimal", "defaultValue": 0.95, "description": "Two-sided confidence level for the CIs." }
  ],
  "inputs": [
    { "name": "estimates",    "dataType": "decimal", "required": true,  "cardinality": "multiple", "description": "Per-cell estimates θ (e.g. LS-means), one per column of L." },
    { "name": "covariance",   "dataType": "decimal", "required": true,  "cardinality": "multiple", "description": "Covariance of the estimates Σ as a long (cell_row, cell_col, value) table (§2)." },
    { "name": "coefficients", "dataType": "decimal", "required": true,  "cardinality": "multiple", "description": "Contrast matrix L; resolved from the output contrast dimension's contrastSpecification." },
    { "name": "df",           "dataType": "decimal", "required": false, "cardinality": "single",   "description": "Degrees of freedom from the fit (KR/Satterthwaite). Present → t; absent → normal/z." }
  ],
  "outputs": [ { "name": "contrast_estimates", "output_type": "contrasts_t" } ]
}
```

## 2. Defining the two new outputs — covariance-of-estimates and df

These are the only genuinely new outputs an analysis must expose for Scenario B. Both are defined as **ordinary output classes** (term → template → AC concept/pattern → method output → transformation binding); neither needs a new datatype.

### 2.1 Covariance-of-estimates — generic over the basis (LS-means **and** model coefficients)

The contrast needs `Var(θ)` for whatever `θ` it combines, and *what θ is* depends on the contrast `basis` (contrast spec §3.3):

| `basis` | `θ` = | `Σ` = covariance of… | source |
|---------|-------|----------------------|--------|
| `estimated_means` | LS-means (per cell) | the **LS-means** (cell × cell) | SAS `LSMEANS … / COV`; R `vcov(emmeans(...))` |
| `model_coefficients` | fitted parameters β | the **coefficients** (param × param = `COVB`) | SAS `MODEL … / COVB`; R `vcov(fit)` |

So this is **one generic covariance output with two concrete specializations**, not LS-means only. `M.LinearContrast` is identical for both — `estimates`, `covariance`, and `coefficients` (L) simply share the **same index space** (factor cells, or fitted parameters), which `basis` selects. Model it the repo's way — a **long, normalized cube** (one row per ordered index pair), matching `model/analysis-results`; the template carries just the `covariance` statistic and the *matrix shape* is row structure (two index axes), not a new datatype.

**(a) Terminology** — one new term in `statistics_vocabulary.json` (shared by both specializations):
```jsonc
"covariance": {
  "conceptId": "covariance",
  "name": "Covariance between two estimates", "label": null, "ncitCode": null,
  "codings": [ { "system": "http://purl.obolibrary.org/obo/stato", "code": "STATO_0000xxx", "display": "covariance" } ],
  "dataType": "numeric",
  "description": "Covariance between two model estimates (off-diagonal) or variance (diagonal). Scale = (estimate unit)²."
}
```
(STATO code to confirm.)

**(b) Output class templates** in `output_class_templates.json` — an abstract family + two concretes, each a single-`covariance` table:
```jsonc
"estimate_covariance":  { "conceptId": "estimate_covariance", "name": "Family — covariance of the estimates being contrasted",
                          "ncitCode": null, "codings": [], "abstract": true, "broader": "parameter_estimates" },
"lsmeans_covariance":   { "conceptId": "lsmeans_covariance",  "name": "Covariance of the LS-means (long form)",  "label": "LS-means covariance",
                          "ncitCode": null, "codings": [], "broader": "estimate_covariance",
                          "statistics_set": [], "additional_statistics": ["covariance"], "optional_statistics": [] },
"parameter_covariance": { "conceptId": "parameter_covariance","name": "Covariance of the fitted coefficients — COVB (long form)", "label": "Parameter covariance",
                          "ncitCode": null, "codings": [], "broader": "estimate_covariance",
                          "statistics_set": [], "additional_statistics": ["covariance"], "optional_statistics": [] }
```
Both concretes carry just `covariance`; they differ only in what the two index axes range over — factor levels vs fitted parameters.

**(c) AC concept + patterns** in `AC_Concept_Model_v017.json`:
```jsonc
"Covariance": { "label": "Covariance", "shortLabel": "cov", "term": "covariance",
                "fhirValueType": "decimal", "unit": "inherited", "code": { "system": "NCI", "value": null } }   // (estimate unit)²

"LSMeansCovariance":   { "definition": "Covariance of the LS-means, long form (one value per ordered cell pair).",
                         "statistics_set": [], "additional_statistics": ["Covariance"], "constituents": ["Covariance"],
                         "dimensions": ["cell_row", "cell_col"] }      // range over factor levels (e.g. Treatment[, ×Visit])

"ParameterCovariance": { "definition": "Covariance of the fitted model coefficients (COVB), long form.",
                         "statistics_set": [], "additional_statistics": ["Covariance"], "constituents": ["Covariance"],
                         "dimensions": ["term_row", "term_col"] }      // range over the fitted model parameters
```

**(d) Method output** on the analysis methods (M.ANCOVA/M.MMRM) — expose whichever matches the contrasts they support:
```jsonc
{ "name": "lsmeans_covariance",   "output_type": "lsmeans_covariance",   "indexed_by": ["fixed_effect#row", "fixed_effect#col"] }   // estimated_means
{ "name": "parameter_covariance", "output_type": "parameter_covariance", "indexed_by": ["term#row", "term#col"] }                   // model_coefficients (COVB)
```
(`#row`/`#col` = a documented convention for "the same index space taken twice"; for MMRM-by-visit the LS-mean cell is `fixed_effect × repeated_factor`, doubled.)

**(e) Transformation output binding** (in the analysis transformation, §3 step 1) — pick the specialization matching the contrast `basis`:
```jsonc
// estimated_means
"dimensions": [ /* context */, { "name": "cell_row", "concept": "Treatment" }, { "name": "cell_col", "concept": "Treatment" } ],
"measures":   [ { "output": "lsmeans_covariance", "concept": "LSMeansCovariance" } ]

// model_coefficients (the columns are the fitted parameters; coding/reference per contrast spec §3.3)
"dimensions": [ /* context */, { "name": "term_row", "conceptCategory": "ModelTerm" }, { "name": "term_col", "conceptCategory": "ModelTerm" } ],
"measures":   [ { "output": "parameter_covariance", "concept": "ParameterCovariance" } ]
```
So `Cov(θ_i, θ_j)` is the `covariance` value at `(row=i, col=j)`. The contrast method reads the long table as its `covariance` input and assembles Σ; `basis` guarantees `estimates`, `coefficients` (L) and `covariance` share the same index space (cells or parameters).

### 2.2 Degrees of freedom (df)

`df` is **already a terminology term** (`df`, plus `df_num`/`df_den`) and `DF` is **already an AC concept** — so only an output class + pattern + the wiring are new.

**(a) Output class template** (`output_class_templates.json`) — a tiny table carrying just `df`:
```jsonc
"inference_df": {
  "conceptId": "inference_df",
  "name": "Degrees of freedom for downstream inference", "label": "Inference df",
  "ncitCode": null, "codings": [], "broader": "fit_statistics",
  "statistics_set": [], "additional_statistics": ["df"], "optional_statistics": []
}
```
**(b) AC pattern** (`AC_Concept_Model_v017.json`) — reuse the existing `DF` concept:
```jsonc
"InferenceDF": {
  "definition": "Degrees of freedom exposed by a fit for downstream contrast/test inference.",
  "statistics_set": [], "additional_statistics": ["DF"],
  "constituents": ["DF"],
  "dimensions": []                 // scalar (model-level residual/denominator df); use ["term"] if per-term
}
```
**(c) Method output** (on M.ANCOVA/M.MMRM):
```jsonc
{ "name": "inference_df", "output_type": "inference_df", "indexed_by": [] }   // scalar; or ["fixed_effect"] per term
```
**(d) Transformation binding** (analysis step): `{ "output": "inference_df", "concept": "InferenceDF" }` with a matching (empty or per-term) dimension. The contrast step then reads `df ← DF` (its `df` input) exactly like the other result concepts.

**The honest subtlety — this is where the §7 df decision bites.** A *residual / containment* df is a model-level **scalar**, so the definition above works directly (ANCOVA, simple linear; an acceptable approximation for many MMRM reports). But **Kenward-Roger / Satterthwaite df is per-contrast** — it depends on `L` — so it cannot be exposed as one pre-contrast number. Two correct handlings, matching §7:
- **Scalar / approximate (simplest):** expose the model's denominator df as the scalar `inference_df` above; `M.LinearContrast` applies it to every contrast. Fine where residual df is appropriate; approximate for KR.
- **Exact KR/Satterthwaite:** the analysis exposes the KR/Satterthwaite *ingredients* (variance-component covariance + gradient) and `M.LinearContrast` computes per-contrast df itself (a `df_method` config: `residual | satterthwaite | kenward_roger`) — keeps correctness, but the method then consumes more than `(estimates, covariance, df)`. If exact KR is required without that extra input, that contrast stays in the model-owning method (Scenario A fallback).

## 3. How a transformation uses the method (and what it must specify)

Two-step pipeline; the contrast step consumes the analysis step's output **by referencing its result concepts** (the existing concept-keyed mechanism — *not* a new chaining primitive):

```text
T.LSMeans_ANCOVA (M.ANCOVA)  ─▶  ls_means (LSMeans) + lsmeans_covariance (LSMeansCovariance) + df (DF)
        │   (concept-keyed: the next step reads those concepts, exactly as T.CFB_ANCOVA reads `Change`)
        ▼
T.Contrast_TrtDiff (M.LinearContrast)  ─▶  contrasts_t
```

**Step 1 — analysis transformation exposes estimates + covariance + df** (output measures bind `ls_means→LSMeans`, `lsmeans_covariance→LSMeansCovariance` (with the `cell_row`/`cell_col` dims from §2.1e), `inference_df→InferenceDF` (§2.2)).

**Step 2 — contrast transformation:**
```jsonc
{
  "conceptId": "T.Contrast_TrtDiff_ANCOVA",
  "label": "Treatment contrasts vs control (ANCOVA)",
  "transformationType": "analysis",
  "usesMethod": "M.LinearContrast",
  "methodConfigurations": [ { "configurationName": "confidence_level", "value": 0.95 } ],
  "inputDataStructure": {
    "dimensions": [
      { "concept": "Treatment" },
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" },
      { "concept": "Population" }
    ],
    "measures": [
      { "input": "estimates",  "concept": "LSMeans" },            // ← read the upstream result concepts
      { "input": "covariance", "concept": "LSMeansCovariance" },
      { "input": "df",         "concept": "DF" }
    ]
  },
  "outputDataStructure": {
    "dimensions": [
      { "conceptCategory": "ParameterDimension" },
      { "conceptCategory": "VisitDimension" },
      { "concept": "Population" },
      {
        "name": "contrast", "concept": "Contrasts",
        "contrastSpecification": {                                 // this IS L (and feeds the method's `coefficients`)
          "over": "Treatment", "basis": "estimated_means",
          "members": { "generator": { "kind": "vs_reference", "reference": "{control_arm}" } }
        }
      }
    ],
    "measures": [ { "output": "contrast_estimates", "concept": "Contrasts" } ]
  },
  "sliceKeys": [ { "dimension": "Treatment", "value": "{control_arm}" } ]
}
```

### 3.1 What a transformation must specify (checklist)
1. **`usesMethod`** = `"M.LinearContrast"`.
2. **Input cube:** `dimensions` (the cells = `L`'s columns: `Treatment` + context) and `measures` binding the method's input slots to the **upstream result concepts** — `estimates ← LSMeans`, `covariance ← LSMeansCovariance`, `df ← DF`. (No `from`/chaining field; the engine connects producer→consumer by concept and orders execution accordingly.)
3. **Output cube:** a `contrast` dimension (`name:"contrast"`, `concept:"Contrasts"`) carrying the **`contrastSpecification`** (`over`/`basis`/`at`/`members`) — this *is* `L` and the only place "which contrasts" is declared; plus `contrast_estimates → Contrasts`; plus context dims.
4. **`methodConfigurations`** (e.g. `confidence_level`; `scale` under Option 3).
5. **`sliceKeys`** — study-time resolution of generator placeholders like `{control_arm}`.
6. **Not specified manually:** the `coefficients` (`L`) input is resolved from the output `contrastSpecification`.

## 3.2 The three options, by example (each defined in §4–§6)

All three options compute the **same** `L·θ` with the **same** `M.LinearContrast` algebra. They differ on only two things: **how many method files exist**, and **where the t-vs-z choice and the natural-scale (OR/HR) exponentiation live.** Three running cases make it concrete:

- **Case A — t-based:** ANCOVA/MMRM, "Drug − Placebo" on the analysis scale → `contrasts_t`.
- **Case B — z-based:** logistic regression, "Drug vs Placebo" log-odds on the link scale → `contrasts_z`.
- **Case C — natural scale:** the odds ratio itself (`exp` of Case B) → `odds_ratio_estimates`.

At a glance:

| | method file(s) | t vs z chosen by | OR/HR (Case C) produced by |
|--|----------------|------------------|----------------------------|
| **Option 1** | 1 — `M.LinearContrast` | whether a `df` input is bound | a separate downstream `exp` transformation |
| **Option 2** | 2 — `M.LinearContrast` (t) + `M.LinearContrastZ` (z) | which method the transformation binds | a separate downstream `exp` transformation |
| **Option 3** | 1 — `M.LinearContrast` + a `scale` config | whether a `df` input is bound | the method itself, `scale:"exp"` (no extra step) |

The pipelines, case by case (`▶` = one transformation step; the method it binds is in parens):

**Option 1 — one generic method**
```text
A: T.LSMeans_ANCOVA ▶ T.Contrast (M.LinearContrast, df bound)  ▶ contrasts_t
B: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrast, no df)     ▶ contrasts_z
C: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrast, no df) ▶ contrasts_z
                    ▶ T.Exp_OR  (M.AffineTransform / exp)      ▶ odds_ratio_estimates
```
One method everywhere; Case C adds a separate `exp` step.

**Option 2 — t/z family**
```text
A: T.LSMeans_ANCOVA ▶ T.Contrast (M.LinearContrast)            ▶ contrasts_t
B: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrastZ)           ▶ contrasts_z
C: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrastZ) ▶ contrasts_z
                    ▶ T.Exp_OR  (M.AffineTransform / exp)      ▶ odds_ratio_estimates
```
Same shape as Option 1, but you **pick the method** (t vs z) instead of relying on `df` presence; Case C still adds the `exp` step.

**Option 3 — one method, `scale` config**
```text
A: T.LSMeans_ANCOVA ▶ T.Contrast (M.LinearContrast, scale=identity, df bound) ▶ contrasts_t
B: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrast, scale=identity, no df)    ▶ contrasts_z
C: T.Coef_Logistic  ▶ T.Contrast (M.LinearContrast, scale=exp)                ▶ odds_ratio_estimates
```
One method; Case C produces the odds ratio **directly** via `scale=exp` — no separate `exp` step.

**The take-away:** Case A is identical in all three. **Option 1 vs Option 3** differ only in Case C (a separate `exp` transformation vs a `scale` config inside the method). **Option 2** differs from both only by splitting the t and z paths into **two** method files instead of one.

## 4. Option 1 — one generic method (df-driven t/z; OR/HR via downstream exp)
Single `M.LinearContrast` (§1.1). t vs z chosen by presence of `df` (`contrasts_t`/`contrasts_z`). Natural-scale OR/HR = a separate exp step: `T.Contrast_LogOR (no df → contrasts_z) ▶ T.Exp_OR (M.AffineTransform/exp) ▶ odds_ratio_estimates`. **Pros:** algebra once; t/z is data; OR/HR reuses an existing transform. **Cons:** output template resolved at binding; 2-step OR/HR.

## 5. Option 2 — a t/z family
`M.LinearContrast` (df required, `contrasts_t`) + `M.LinearContrastZ` (no df, `contrasts_z`); OR/HR via downstream exp. **Pros:** 1:1 method↔template; `df` explicit. **Cons:** two near-identical files; a 3rd distribution = a 3rd method.

## 6. Option 3 — one method including exponentiation (a `scale` config)
Add `configurations: [{ name:"scale", dataType:"code", defaultValue:"identity", description:"identity → contrasts_t/_z; exp → OR/HR" }]`; `scale=exp` emits the exponentiated set directly. **Pros:** one method and one step for OR/HR. **Cons:** bundles a general transform into the contrast method; output template becomes config-dependent (harder to validate).

## 7. Cross-cutting — df / mixed-model correctness
- **Option A — analysis exposes `df` + model-adjusted covariance; method consumes them** (what §2/§3 show). Correct for mixed models. *Cost:* the covariance output (§2) + df exposure — **no chaining cost** (concept-keyed).
- **Option B — restrict the method to df-safe cases; keep Scenario A for mixed models.** Smaller, but two contrast mechanisms coexist (the inconsistency the team's decision was removing).

## 8. Recommendation
**Option 1 + df-handling A.** One operation; t/z is data; OR/HR reuses exp; exposing `df` + `lsmeans_covariance` from the fit makes the separate method correct for mixed models — answering §7's objection while keeping one mechanism. The only real cost is the covariance output (§2) + df exposure; chaining is free.

## 9. If approved — implementation outline (separate plan)
1. `M.LinearContrast` method file (§1.1) + matrix funcs documented in `formula_grammar.json`.
2. Covariance output (§2.1): `covariance` term; abstract `estimate_covariance` family + concretes `lsmeans_covariance` (cells, `estimated_means`) and `parameter_covariance` (COVB, `model_coefficients`); `Covariance` concept + `LSMeansCovariance`/`ParameterCovariance` patterns; the `#row`/`#col` indexing convention.
   df output (§2.2): `inference_df` template + `InferenceDF` pattern (reuse the existing `df` term / `DF` concept); decide scalar vs per-contrast / KR ingredients (§7).
3. MMRM/ANCOVA expose `lsmeans_covariance` + `df`; remove their built-in `contrasts_t`.
4. Worked `T.LSMeans_* → T.Contrast_*` pair (concept-keyed inputs; `contrastSpecification` on the contrast step's output dimension). No chaining primitive.
5. Validator checks: well-formed `contrastSpecification`; contrast inputs resolve to produced result concepts (`LSMeans`/`LSMeansCovariance`/`DF`); contrast transformations bind `M.LinearContrast`.

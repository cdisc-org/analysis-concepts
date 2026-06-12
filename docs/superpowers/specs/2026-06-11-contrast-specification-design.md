# Contrast Specification — Design

**Date:** 2026-06-11 (reworked)
**Status:** **Scenario A recommended** (§7, §9.1). The contrast *representation*
(§3) and its placement in `outputDataStructure` (§4) are the proposed core.
Companion to `2026-06-11-output-class-statistic-sets-design.md`, which owns the
*output statistics* of a contrast (the `contrasts_t`/`contrasts_z` templates and
the AC `Contrasts` pattern). This doc owns the *specification* of a contrast —
which comparisons, what coefficients — and where it lives.

## 0. Recommendation (summary)

The choice is really **two** decisions on different layers, which do not trade
off against each other:

- **Specification** (the matrix — which comparisons, what weights): **always in
  the transformation**, as the output `contrast` dimension's members (§4). It is
  study/factor-specific, so it cannot live in a concept-free method.
- **Computation** (which method emits `contrasts_t`): **the model-owning analysis
  method — Scenario A** (§6). A contrast's inference (the degrees of freedom,
  and under Kenward-Roger the covariance adjustment) is part of the model fit and
  **cannot** be reconstructed from the estimates and their covariance matrix
  alone, which is why every package computes contrasts in-procedure. A separate
  `M.LinearContrast` (§7) looks like a cleaner decomposition, but for mixed
  models (MMRM) it would produce **wrong df / CI / p**. For that reason we
  **recommend Scenario A** and do not pursue the separate method for now.

One line: **the model-owning method *produces* the contrast output; the
transformation *specifies* which contrasts; a separate contrast method is a
future option.**

## 1. The gap

Contrasts are modelled today only on the **output** side: `contrasts_t` /
`contrasts_z` templates, the AC `Contrasts` pattern (dimensions
`[contrast, at_level]`), and a transformation binding
`{ output: "contrasts_t", concept: "Contrasts" }`. **Which** comparisons are
computed and **what** their coefficients are is unmodelled. That is this doc.

Requirements (from review): the contrast metadata must be (1) understandable to
statisticians, (2) translatable to SAS and R, and (3) fit the AC
Method/Transformation structure and the AC Concept layer — including the ability
to store the contrast **matrix**.

## 2. What a contrast is

A contrast is a linear combination `L·θ` of a model's estimates `θ`, with
inference from their covariance `Var(L·θ) = L·Var(θ)·Lᵀ`. Because it needs the
full covariance, software computes contrasts **with the full fitted model in
hand** — in SAS within the modelling procedure
(`LSMEANS`/`LSMESTIMATE`/`ESTIMATE`/`CONTRAST`), in R as post-fit calls on the
model object (`emmeans`+`contrast`, or `multcomp::glht`).

A contrast set is a **matrix `L`**: rows = named contrasts, columns = the things
weighted, entries = weights. The AC `Contrasts` pattern already names the axes:
`contrast` (one row per comparison) and `at_level` (the same contrast evaluated
at each level of a second factor, e.g. per visit).

## 3. Specifying the contrast: the coefficient matrix `L`

The analysis result is a cube (§3.1); this section defines the **coefficient
matrix `L`** that specifies it. Order: what `L` is and how it relates to the cube
(§3.1) → the rule for writing `L` (§3.2) → who owns `L`'s columns (§3.3) → `L`'s
member shapes (§3.4) → templating (§3.5) → why `L`'s rows are not `indexed_by`
(§3.6) → what changes in the output-class spec (§3.7).

### 3.1 The output cube vs the coefficient matrix `L`

What a statistician reads — rows = contrasts, columns = the statistics — **is a
cube**: the `contrast` dimension (with `at_level` and the context dimensions
parameter/population) indexes the rows, and the statistics are the measures. That
cube *is* the transformation's `outputDataStructure` (§4) — nothing new. This
section is about the **other** artifact: the coefficient matrix `L` that *defines*
the cube's `contrast` dimension.

```text
OUTPUT CUBE   (§4 — what the analysis produces)
  dimensions = contrast   (× at_level, × context: parameter, population, …)
  measures   = the statistics    (estimate, SE, CI, t/z, p, [p_adj], df)

COEFFICIENT MATRIX  L   (§3 — how each contrast is defined)
  rows    = the contrasts             (Drug−Placebo, High−Low, …)
  columns = the factor levels / cells (DRUG, PBO, …)
  entries = the weights               (+1, −1, …)
```

The link: **one row of `L` defines one member of the cube's `contrast`
dimension.** `L` is not itself a cube — it is the recipe stored on the contrast
dimension binding (§4.3).

The cube's statistic measures are not new — they are the `contrasts_t` /
`contrasts_z` sets from the companion spec:

| Statistic | Meaning | FHIR type |
|-----------|---------|-----------|
| `estimate` | the contrast value `L·θ` | `Quantity` |
| `SE` | standard error | `Quantity` |
| `CI_lower` + `CI_upper` | confidence interval | one `Range` |
| `t_statistic` *or* `z_statistic` | test statistic (t linear; z GLM/Cox) | `decimal` |
| `p_value` | unadjusted p | `decimal` |
| `p_value_adjusted` *(opt)* | multiplicity-adjusted p (Tukey/Dunnett) | `decimal` |
| `df` *(t only)* | degrees of freedom | `decimal` |

`contrasts_t = ci_estimate_t_distribution + hypothesis_test_t_distribution`;
`contrasts_z = ci_estimate_normal + hypothesis_test_normal`; both `+` optional
`p_value_adjusted`. Natural-scale contrasts — an odds ratio (OR, from logistic
regression) or hazard ratio (HR, from Cox) — use the exponentiated set
(`ci_estimate_odds_ratio` / `ci_estimate_hazard_ratio`).

**Everything this doc models is the coefficient matrix `L` — the rows and their
level-weights. The cube's statistic measures are unchanged.**

### 3.2 The coefficient-matrix rule: declared columns (= levels) + sparse weights, omitted = 0

A contrast row of `L` is *(a declared column space — the factor levels) + (sparse
nonzero weights)*. The executable vector is: for each column, the weight if
given, else **0**. This works only because the column space is *declared* — and
who declares it is the key point, splitting by basis (§3.3).

Storage is **labelled and sparse** (named columns, nonzero weights only) — the
same matrix as a dense grid, but robust to study-specific level codes and column
reordering. The dense, engine-ordered vector is produced at code generation (§5).

### 3.3 Two bases — what the columns are, and who defines them

| | `estimated_means` (default) | `model_coefficients` |
|--|------------------------------|----------------------|
| Columns are | the **levels/cells** of the contrasted factor(s) | the **fitted model's parameters** |
| Defined by | the **concept layer** (e.g. `Treatment` arms from USDM) | the **fitted model + its coding** |
| Complete on its own? | **Yes** — the columns are known without the model | **No** — needs the model to fill in |
| Coding-dependent? | No (you write both `+1` and `−1`) | Yes (a reference-coded parameter already encodes a difference) |
| Software (SAS / R) | `LSMEANS`/`LSMESTIMATE`, `emmeans`+`contrast` | `ESTIMATE`/`CONTRAST`, `multcomp::glht` |
| Covers | LS-means, raw group means (t-test), proportions, link-scale predictions | log-odds-ratio / log-hazard-ratio coefficient contrasts |

In short: **`estimated_means` is the default** because its columns are the
factor's levels — which already live in the concept layer — so the short form
(listing only the nonzero weights) is complete and works unchanged on any
software. `model_coefficients` cannot be both short and complete on its own: you
either write out the whole list of fitted parameters (tied to that one model, and
easy to get wrong) or name the model terms and leave the software to fill in the
rest against the fitted model. Treat it as the special, model-bound case.

**The same contrast under each basis** — "Drug − Placebo" for the model
`change ~ treatment + baseline`, treatment levels `{DRUG, PBO}`, `PBO` reference.

**`estimated_means`** — weights over the LS-mean cells. **Identical in both
engines:** you always write `+1` and `−1`.

```jsonc
{ "label": "Drug − Placebo", "weights": { "DRUG": 1, "PBO": -1 } }
```

```sas
lsmestimate treatment 'Drug - Placebo' 1 -1 ;
```

```r
contrast(emmeans(fit, ~treatment), list("Drug - Placebo" = c(DRUG = 1, PBO = -1)))
```

> **Everything about reference and coding from here to the end of §3.3 is
> `model_coefficients`-only — and exists to explain why it is *not* the default.**
> In `estimated_means` a contrast is just a weighted difference of means (one
> pairwise contrast); there is no reference and no coding. If you are on the
> default path, skip to §3.4.

**`model_coefficients`** — weights over the **whole** list of fitted model
parameters `β`. No shortcuts: the full `L` carries a weight (often `0`) for
**every** parameter, and that list is the model's own — which is what makes it
model-bound. The two stored forms below are the same `L` under two **codings**
(not two pieces of software — both R and SAS can do either):

**Reference (treatment) coding** — `β = (Intercept, treatmentDRUG, baseline)`:

```text
parameter:      Intercept   treatmentDRUG   baseline
L (Drug−PBO):       0             1             0
```

The full `L = (0, 1, 0)`. Reading it left to right:

- **`Intercept` → 0, `baseline` → 0.** Both arms share one intercept and one
  baseline slope, so they cancel in any treatment difference.
- **`treatmentDRUG` → 1.** With PBO chosen as the reference, PBO is folded into
  the intercept and the `treatmentDRUG` coefficient *already* measures DRUG
  relative to PBO — i.e. it is `E[DRUG] − E[PBO]`. So the contrast just picks out
  that one coefficient: weight 1.

**This only holds because PBO is the reference — and the reference is not in the
data, it is an engine setting.** R defaults to the first factor level
alphabetically (and is changed with `relevel()`); SAS depends on the procedure and
the `CLASS … / REF=` option. So the same factor can yield a *different* `β` and a
*different* `L` on a different engine or setting. That is precisely why
`model_coefficients` metadata must pin `coding` and `reference` explicitly (the
JSON below) — without them, `{ "treatment:DRUG": 1 }` is ambiguous. Stored sparse
(omitted = 0): `{ "treatment:DRUG": 1 }`.

```r
# fit = lm(change ~ treatment + baseline)   # PBO is the reference (first level)
# columns: (Intercept, treatmentDRUG, baseline)
glht(fit, linfct = matrix(c(0, 1, 0), nrow = 1))          # L = (0, 1, 0)
```

**The asymmetry was the coding, not the contrast.** Drop the reference (cell-means
coding — R `~ 0 + treatment`, where every arm gets its own parameter) and the same
Drug − Placebo contrast becomes the **symmetric** `L = (1, −1, 0)` — the same
`1 −1` that `estimated_means` uses. So the lone `1` above was an artifact of PBO
being absorbed into the intercept; change the coding and the `−1` comes back.

```text
                treatmentDRUG   treatmentPBO   baseline
L (Drug−PBO):        1              -1            0
```

**Why this is the model-bound basis — and where it gets unwieldy.** Notice
`baseline` is weighted `0` only *because* its slope is shared by both arms — that
is a fact about the **model**, not the contrast. The moment the contrast is at a
specific covariate value, or the model has a treatment×covariate interaction,
those columns carry **nonzero** weights too, and the tidy `±1` picture is gone.
That is the case `estimated_means` avoids entirely: its columns are the arms
(concept-owned, no model needed) and its weights are always `1 −1` regardless of
coding — complete and portable. Hence it is the default.

**What actually gets stored — the full `contrastSpecification`, both bases.** The
member `weights` shown above sit inside the contrast dimension's
`contrastSpecification` (§4). The two bases store **different** things:

```jsonc
// estimated_means — self-contained; weights name the arms, no parameterization needed
{
  "over": "Treatment",
  "basis": "estimated_means",
  "members": [
    { "label": "Drug − Placebo", "weights": { "DRUG": 1, "PBO": -1 } }
  ]
}
```

```jsonc
// model_coefficients — MUST also pin the parameterization (coding + reference);
// the weight keys are fitted-model parameter names, valid only for that model
{
  "over": "Treatment",
  "basis": "model_coefficients",
  "coding": "reference",          // reference | cell_means
  "reference": "PBO",             // required when coding = reference
  "members": [
    { "label": "Drug − Placebo", "weights": { "treatment:DRUG": 1 } }
  ]
}
```

So `model_coefficients` carries two extra fields (`coding`, `reference`) that
`estimated_means` does not need — and even then its `weights` keys only mean
something against the specific fitted model. One more reason `estimated_means` is
the portable default.

**Three arms — and where the reference actually lives.** Arms
`{HIDOSE, LODOSE, PBO}`, wanting `HiDose−LoDose`, `HiDose−PBO`, `LoDose−PBO`.

`estimated_means` — columns are the three means; **no reference**, every weight
explicit (this is just "all pairwise"):

```text
                 HIDOSE  LODOSE  PBO
HiDose − LoDose     1      −1     0
HiDose − PBO        1       0    −1
LoDose − PBO        0       1    −1
```

`model_coefficients` with PBO as reference —
`β = (Intercept, treatmentHIDOSE, treatmentLODOSE, baseline)`; **PBO has no
column** (it was made the reference at *model-fit* time — R `relevel()`, SAS
`CLASS treatment(ref='PBO')`):

```text
reference = PBO  →  PBO has no column; it is absorbed into the Intercept
                 Intercept  treatmentHIDOSE  treatmentLODOSE  baseline
HiDose − PBO         0            1                0             0     ← the HIDOSE dummy IS HiDose−PBO
LoDose − PBO         0            0                1             0     ← the LODOSE dummy IS LoDose−PBO
HiDose − LoDose      0            1               −1             0     ← difference of two dummies; PBO cancels
```

So **"PBO = 0" is never written in `L`** — it is encoded in the *model* (PBO has
no parameter). A contrast against the reference picks a single dummy; a contrast
*between two non-reference arms* (`HiDose−LoDose`) is the difference of their
dummies, and the reference cancels: `(HiDose−PBO) − (LoDose−PBO) = HiDose−LoDose`.
Under `estimated_means` there is no reference at all — every arm is a column you
weight directly, which is again why it is the default.

As stored `contrastSpecification` members, the all-pairwise set is **symmetric**
for `estimated_means` but **asymmetric** for `model_coefficients`:

```jsonc
// estimated_means — every member names two arms; PBO is a normal column
{
  "over": "Treatment", "basis": "estimated_means",
  "members": [
    { "label": "HiDose − PBO",    "weights": { "HIDOSE": 1, "PBO": -1 } },
    { "label": "LoDose − PBO",    "weights": { "LODOSE": 1, "PBO": -1 } },
    { "label": "HiDose − LoDose", "weights": { "HIDOSE": 1, "LODOSE": -1 } }
  ]
}
```

```jsonc
// model_coefficients — vs-reference members are single-key; the non-reference
// pair needs two keys; PBO never appears (it has no parameter)
{
  "over": "Treatment", "basis": "model_coefficients",
  "coding": "reference", "reference": "PBO",
  "members": [
    { "label": "HiDose − PBO",    "weights": { "treatment:HIDOSE": 1 } },
    { "label": "LoDose − PBO",    "weights": { "treatment:LODOSE": 1 } },
    { "label": "HiDose − LoDose", "weights": { "treatment:HIDOSE": 1, "treatment:LODOSE": -1 } }
  ]
}
```

The asymmetry is purely a side-effect of the parameterization: change `reference`
and every `model_coefficients` member changes (different keys and signs), while the
`estimated_means` set above does not move.

**Is the reference random? No — and it is not an `L` field.** The reference level
is a deliberate choice: the automatic default (R's alphabetical-first level;
SAS's sort order) is normally overridden to the control arm (R
`relevel(ref = "PBO")`, SAS `CLASS treatment(ref='PBO')`). It changes only the
*parameterization*, never the results — the LS-means and the DRUG−PBO difference
are identical whichever level is the reference. So for the metadata:

- `estimated_means` needs **no** reference field — the member weights name the
  arms directly.
- The control/reference arm is nonetheless real study metadata, specified **once**
  at the study/estimand layer (the designated comparator). From there it already
  supplies the comparator for the "versus reference" shortcut (the `{control_arm}`
  value filled in at study time, §3.5), and — only if `model_coefficients` is ever
  used — it sets the model's reference level at fit time. It is **not** a
  per-contrast `L` field.

Distributional comparisons (log-rank, Wilcoxon) have **no** coefficient matrix —
they are a grouping/strata definition feeding `test_result`, not a contrast
table. Out of scope for this object.

### 3.4 Member shapes (simple → general)

Canonical member: a label plus a list of `{cell, weight}`, where a `cell` maps
each relevant factor to a level. A single-factor contrast uses the `weights`
shorthand.

```jsonc
// single-factor shorthand (over = one factor):
{ "label": "Drug − Placebo", "weights": { "DRUG": 1, "PBO": -1 } }

// general multi-factor cells (interaction / difference-in-differences):
{ "label": "Δ(Drug−PBO): W12 vs W0",
  "cells": [
    { "cell": { "Treatment": "DRUG", "VisitDimension": "W12" }, "weight":  1 },
    { "cell": { "Treatment": "PBO",  "VisitDimension": "W12" }, "weight": -1 },
    { "cell": { "Treatment": "DRUG", "VisitDimension": "W0"  }, "weight": -1 },
    { "cell": { "Treatment": "PBO",  "VisitDimension": "W0"  }, "weight":  1 } ] }
```

On `estimated_means`, covariates never appear in cells — LS-means integrate them
out at their reference values, so the vector stays at cell level no matter how
many covariates/interactions the model has. (That growth happens only on
`model_coefficients`.)

### 3.5 Templating: generators resolved at study time

The *pattern* is study-independent and lives in the template; the *coefficients*
depend on the factor's actual levels, which resolve at study-spec time — exactly
the `sliceKeys` placeholder mechanism.

```jsonc
"members": { "generator": { "kind": "vs_reference", "reference": "{control_arm}" } }
//   kind ∈ { pairwise, vs_reference, trend, custom }
//   resolves against `over`'s levels (from the bound concept) → explicit §3.4 rows
```

`over` is **expressed in concept terms** (the dimension `Treatment`, not the
method's internal role name `fixed_effect`) — because the levels come from the
concept, and the role is recovered via the transformation binding
`fixed_effect ← Treatment` when the code is generated. `{control_arm}` resolves
like a `sliceKey` value from the endpoint/estimand.

### 3.6 `indexed_by` does NOT define contrast rows

`indexed_by` declares rows as a *cross of input-slot levels* — mechanical, from
the model inputs. Contrast rows are an *explicit specified set*, so the `contrast`
axis is defined by the **members**, not `indexed_by`. The only `indexed_by`-style
cross is `at_level` (one row per visit), which is built into the method. So today's
`contrasts_t: indexed_by ["fixed_effect"]` is misleading and should be dropped:
the contrast axis comes from the members; `at_level` (if any) is the cross.

### 3.7 Impact on the output-class spec (what changes there)

The companion spec `2026-06-11-output-class-statistic-sets-design.md` owns the
**columns**; this doc owns the **rows**. The two compose into the cube. Concrete
effects on the output-class side:

- **`contrasts_t` / `contrasts_z` templates are unchanged.** Their statistic sets
  (§3.1) stand as-is — a contrast introduces no new statistics. A template is a
  code-list of *columns* with no row structure; the `contrast` dimension's
  `members` (§4) supply the *rows*. So: **template = columns, contrast spec =
  rows.**
- **`basis` / distribution selects which template applies** (a mapping the
  code generator / validator uses; it does not edit the templates):
  - `estimated_means`, linear → **`contrasts_t`** (t-based)
  - link scale, GLM/Cox → **`contrasts_z`** (z-based)
  - natural scale (odds ratio / hazard ratio) → the exponentiated set
    (`ci_estimate_odds_ratio` / `ci_estimate_hazard_ratio`)
- **Method-file `indexed_by` cleanup** (companion §7 item 4 — the analysis
  method files): drop `contrasts_t: indexed_by ["fixed_effect"]` (§3.6). A
  method's `contrasts_t` output keeps only an `at_level` cross if intrinsic
  (e.g. MMRM by visit), otherwise nothing — the contrast axis is member-defined
  at the transformation, not at the method.
- **AC `Contrasts` pattern** (concept layer, companion §5 unification): its
  `[contrast, at_level]` dimensions get their **members** from the contrast
  specification — `contrast` members from `contrastSpecification.members`,
  `at_level` members from the `at` factor's levels. The pattern's *constituents*
  (the statistics) are unchanged.

Net: **no change to the output-class templates**; the contrast work slots in as
the *row definition* for the `contrasts_*` measures, plus the small `indexed_by`
cleanup in the method files. The only schema change is the contrast dimension
binding in `acdc_transformation` (§4.3) — the companion spec's §6.3 noted
`acdc_transformation` needed no change for the statistic-set work; the contrast
dimension binding is the one addition it does need.

## 4. Where it lives: the transformation `outputDataStructure`

The contrast matrix must comply with the transformation's `outputDataStructure`
(the input/output data-cube structure). That structure is:

```text
outputDataStructure:
  dimensions: [ { concept | conceptCategory } ... ]   // the cube's qb:dimensions
  measures:   [ { output: <method slot>, concept: <AC concept> } ... ]
```

Under the revised approach, the contrast matrix is **the definition of the
`contrast` dimension's members** — a new kind of output dimension binding whose members are
study-defined and carry the coefficient recipe. It is *not* a method
configuration.

### 4.1 Simple example — ANCOVA, Drug vs Placebo at one visit

`T.CFB_ANCOVA`'s output cube, with the `contrast` dimension added. Authored
(template) form:

```jsonc
"outputDataStructure": {
  "dimensions": [
    { "conceptCategory": "ParameterDimension" },
    { "conceptCategory": "VisitDimension" },
    { "concept": "Population" },
    { "concept": "Treatment" },                        // used by ls_means
    {
      "name": "contrast",                               // the AC Contrasts.contrast axis
      "concept": "Contrasts",
      "contrastSpecification": {
        "over": "Treatment",
        "basis": "estimated_means",
        "members": { "generator": { "kind": "vs_reference", "reference": "{control_arm}" } }
      }
    }
  ],
  "measures": [
    { "output": "ls_means",    "concept": "LSMeans"   },   // indexed by Treatment
    { "output": "contrasts_t", "concept": "Contrasts" }    // indexed by contrast
  ]
}
```

Resolved (study-spec) — `{control_arm}→PBO`, generator expanded against
`Treatment` = `{DRUG, PBO}`:

```jsonc
"contrastSpecification": {
  "over": "Treatment", "basis": "estimated_means",
  "members": [ { "label": "Drug − Placebo", "weights": { "DRUG": 1, "PBO": -1 } } ]
}
```

The output cube: `ls_means` is indexed by `Treatment` (one row per arm);
`contrasts_t` is indexed by `contrast` (one row per member). Both share the
context dimensions (`ParameterDimension`, `VisitDimension`, `Population`). `Treatment`
is *collapsed* into `contrast` for the contrast measure.

### 4.2 Complex example — MMRM, treatment diff by visit + a difference-in-differences

Two members: a single-factor contrast replicated across visits (`at`), and an
explicit multi-factor difference-in-differences.

```jsonc
"outputDataStructure": {
  "dimensions": [
    { "conceptCategory": "ParameterDimension" },
    { "concept": "Population" },
    { "concept": "Treatment" },
    { "conceptCategory": "VisitDimension" },            // the at_level factor
    {
      "name": "contrast",
      "concept": "Contrasts",
      "contrastSpecification": {
        "over": "Treatment",
        "basis": "estimated_means",
        "at": "VisitDimension",                          // replicate single-factor members per visit
        "members": [
          { "label": "Drug − Placebo",                   // replicated → one row per visit
            "weights": { "DRUG": 1, "PBO": -1 } },
          { "label": "Δ(Drug−PBO): W12 vs W0",           // explicit cells → self-contained, NOT replicated
            "cells": [
              { "cell": { "Treatment": "DRUG", "VisitDimension": "W12" }, "weight":  1 },
              { "cell": { "Treatment": "PBO",  "VisitDimension": "W12" }, "weight": -1 },
              { "cell": { "Treatment": "DRUG", "VisitDimension": "W0"  }, "weight": -1 },
              { "cell": { "Treatment": "PBO",  "VisitDimension": "W0"  }, "weight":  1 } ] }
        ]
      }
    }
  ],
  "measures": [
    { "output": "ls_means",    "concept": "LSMeans"   },   // indexed by Treatment × VisitDimension
    { "output": "contrasts_t", "concept": "Contrasts" }    // indexed by contrast (× at_level for replicated members)
  ]
}
```

Row interaction with `at`: a member with `weights` over `over` only is
**replicated** across each `at` level (producing the `at_level` axis); a member
with explicit multi-factor `cells` already fixes those factors and is **not**
replicated. So the `contrasts_t` cube here has `contrast` × `at_level` (visit)
for the first member, and a single `contrast` row spanning visits for the second.

### 4.3 Schema impact (`acdc_transformation`)

- `OutputDimensionBinding` gains an optional **contrast variant**: a `name`
  (`"contrast"`) + `concept: "Contrasts"` + a `contrastSpecification`
  (`over`, `basis`, optional `at`, `members`). When present, `concept` and
  `conceptCategory` rules relax (a contrast dimension is derived, not a plain
  concept codelist).
- When `basis = "model_coefficients"`, the `contrastSpecification` additionally
  requires `coding` (`reference` | `cell_means`) and, for reference coding,
  `reference` — the parameterization the weight keys refer to. `estimated_means`
  needs neither (its `weights` are concept-level arm names).
- `contrastSpecification.members` is either a `generator` (template) or a list of
  member rows (resolved); each member is `{label, weights | cells}`.
- No change to `OutputMeasureBinding` — `contrasts_t → Contrasts` is unchanged;
  it is simply indexed by the new `contrast` dimension.
- (Alternative placement, noted not chosen: attach `contrastSpecification`
  directly to the `contrasts_t` `OutputMeasureBinding`. More localised, but less
  consistent with the data-cube model — the matrix defines a *dimension*, so it
  belongs on the dimension.)

## 5. From specification to executable code (SAS / R)

The stored matrix is software-independent; the code generator (a) resolves any
generator against the levels, (b) translates the `over` (in concept terms) to the
model term via the transformation binding, then (c) produces either the
**engine's built-in statement** (preferred — it inherits the standard errors and
degrees of freedom the software vendor has already validated) or a **fully
spelled-out, ordered, zero-padded vector**.

### 5.1 Simple — Drug − Placebo (`estimated_means`)

```r
emm <- emmeans(fit, ~ treatment)
contrast(emm, "trt.vs.ctrl", ref = "PBO")                       # built-in-statement path (from vs_reference)
contrast(emm, method = list("Drug - Placebo" = c(DRUG = 1, PBO = -1)))  # fully spelled-out path
```

```sas
lsmeans treatment / diff=control('PBO');                         /* built-in-statement path */
lsmestimate treatment 'Drug - Placebo' 1 -1 ;                    /* spelled out: CLASS order [DRUG,PBO] */
```

### 5.2 Complex — by-visit + difference-in-differences (`estimated_means`)

```r
emm <- emmeans(fit, ~ treatment | visit)                        # treatment diff within each visit
contrast(emm, method = list("Drug - Placebo" = c(DRUG = 1, PBO = -1)))
# difference-in-differences over the treatment×visit grid:
emm2 <- emmeans(fit, ~ treatment * visit)
contrast(emm2, method = list(
  "d(Drug-PBO): W12 vs W0" =
    c("DRUG W12"=1, "PBO W12"=-1, "DRUG W0"=-1, "PBO W0"=1)))    # cell-keyed → grid coefficients
```

```sas
lsmestimate treatment*visit 'Drug-PBO @W12' 1 -1 0 0 ... / ... ;  /* per-visit, code generator orders cells */
lsmestimate treatment*visit 'd(Drug-PBO): W12 vs W0'
            1 -1 0 ... -1 1 0 ... ;                               /* DiD over the cell grid */
```

In every case the code generator expands the listed cells to the software's
cell/parameter order and fills zeros over the **declared** column space
(§3.2–3.3). For `model_coefficients` it must additionally read the fitted model's
parameter list (the case that needs the model).

## 6. Scenario A — contrast *within* the analysis method

The analysis method (`M.ANCOVA`, `M.MMRM`, …) already lists `contrasts_t` as an
output. The contrast **matrix lives on the transformation's output `contrast`
dimension** (§4), not on the method's configuration. The method declares only
that it *produces* `contrasts_t` over a term; it holds no study-specific matrix,
so it stays free of any particular study's arms or visits. The covariance the
contrast needs is right there inside the model-fitting step.

- **What it asks of the model:** one method, one transformation; the single
  schema change in §4.3 and nothing more.
- **In its favour:** the smallest change; it mirrors how SAS and R compute
  contrasts — inside the same procedure that fits the model — so the path from
  specification to running code is the most direct.
- **The trade-off:** every method that produces contrasts has to list a
  `contrasts_t` output of its own, because the contrast computation is not a
  separately reusable piece — it travels with each model.

## 7. Scenario B — contrast as a separate method (`M.LinearContrast`)

A reusable building block consuming a term's estimates **and their covariance**:

```jsonc
{ "conceptId": "M.LinearContrast",
  "inputs": [
    { "name": "estimates",  "cardinality": "multiple", "description": "Per-cell estimates (LS-means)." },
    { "name": "covariance", "cardinality": "multiple", "description": "Covariance of the estimates (cell × cell)." } ],
  "outputs": [ { "name": "contrast_estimates", "output_type": "contrasts_t" } ] }
```

It forces upstream: (1) a **covariance output cube** (`lsmeans_covariance`, a new
output class + AC concept — no method exposes covariance today), and (2)
**transformation chaining** (the analysis output cube becomes this method's input
cube), which the one-method-per-transformation cube model does not yet do:

> **Tooling is not the blocker.** Both engines can emit the covariance: SAS via
> `MODEL … / COVB` (`Var(β̂)`), `LSMEANS … / COV` (LS-means covariance), or
> `STORE` + `PROC PLM` (post-hoc contrasts with no refit); R via `vcov(fit)` /
> `vcov(emm)`. So Scenario B is blocked only by the **modelling** work above (a
> covariance output class + chaining), not by the analysis software.

```text
T.LSMeans_ANCOVA  →  ls_means + lsmeans_covariance  →  T.Contrast_TreatmentDiff (M.LinearContrast)  →  contrasts_t
```

The §3/§4 contrast matrix is **identical** here — it just defines the output
`contrast` dimension of the contrast step instead of the analysis step.

- **In its favour:** one reusable contrast building block. But the reuse that
  matters — a shared contrast *definition* — is already provided by the
  `ContrastSpecification` object (identical in A and B, §3–§4), so B adds little
  on that front.
- **The main concern — the statistics may not come out right.** A separate step
  receives only `(estimates, covariance)`. But a contrast's **degrees of freedom**
  (Kenward-Roger / Satterthwaite for MMRM and mixed models) are a nonlinear
  function of the *full* fitted model — the covariance of the variance-component
  estimates, the residual structure — and under Kenward-Roger the covariance of
  the estimates is itself model-adjusted. Neither can be reconstructed from the
  means and their covariance matrix alone. So a downstream contrast step would
  produce **wrong df, CI and p-values** for exactly the methods that need
  contrasts most. To do it correctly it would have to re-import essentially the
  whole model — at which point little is gained by separating it.
- **Other costs:** needs a covariance cube *and* transformation chaining; diverges
  from how every analysis package works.
- **Where B *could* still fit:** self-contained `model_coefficients` contrasts
  whose df is plain residual df (e.g. exponentiating a GLM/Cox coefficient) — and
  Scenario A already covers those. For these reasons we **recommend Scenario A
  for now** and treat the separate method as a possible later option rather than
  part of the current design.

## 8. Side-by-side

| Dimension | A — within method | B — separate method |
|-----------|-------------------|---------------------|
| New method | No | Yes (`M.LinearContrast`) |
| New output class / concept | No | Yes (`lsmeans_covariance`) |
| Transformation structure | + contrast dimension (§4.3) | + chaining (output cube → input cube) |
| Covariance | implicit, inside the procedure | explicit, as a cube |
| Reuse of the contrast *definition* | shared `ContrastSpecification` | same (no extra reuse) |
| Inference for mixed models (df/CI/p) | **correct** (computed in the fit) | **wrong** — df not recoverable from means+covariance |
| Matches SAS/`emmeans` | Yes | No |
| Contrast matrix (§3–§4) | identical | identical |
| Verdict | **recommended** | considered and rejected |

The contrast matrix and its `outputDataStructure` placement are the same in both;
only *which method's* output cube hosts it differs.

## 9. Open questions

1. **A vs B.** **Decided: A** — model-owning method produces `contrasts_t`,
   transformation specifies the matrix (§0). B is **considered and rejected**, not
   deferred: it cannot produce correct df/CI/p for mixed models from
   `(estimates, covariance)` alone (§7), and its only real benefit (a reusable
   contrast definition) is already provided by the `ContrastSpecification` object.
2. **`basis` set:** `estimated_means` (default) + `model_coefficients`. Is it
   acceptable that `model_coefficients` depends on the fitted model and isn't
   complete on its own, or do we restrict 1.0 to `estimated_means`?
3. **Generators:** is `{pairwise, vs_reference, trend, custom}` the right starter
   set?
4. **`at` semantics** (§4.2): confirm the "replicate single-factor members across
   `at`; explicit-cells members are self-contained" rule.
5. **Schema placement** (§4.3): contrast dimension binding (chosen) vs measure-
   attached `contrastSpecification`.
6. **Estimand origin:** should the comparison originate at the endpoint/estimand
   layer and flow into the `contrast` dimension's members?
</content>

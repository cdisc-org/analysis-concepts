# OutputClass via Statistic Sets — 1.0 Design

**Date:** 2026-06-11
**Status:** Approved (brainstorm) — pending spec review
**Driver:** Updated `lib/methods/Analysis Methods.xlsx` (Sheet 1 "Tabelle1", Sheet 2
"Statistic set classes") proposing a compositional OutputClass structure for the
first 1.0 draft of the methods, transformation, and concept model.

## 1. Goal

Land a 1.0 draft of the method/output-class model in which:

1. An OutputClass template declares the statistics it produces by **composing
   reusable statistic sets** (Sheet 2), instead of inlining a flat list.
2. The AC concept model is **unified** with the method-side output classes via a
   shared statistics vocabulary + sets and a build-validated crosswalk.
3. The linkML schemas under `model/linkML` and the vocabulary files under
   `lib/vocabulary` are updated and mutually consistent.

This is the result of a brainstorming session; the pivotal decisions are
recorded in §2.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| D1 | How an OutputClass declares its statistics | **statistics_set** (Roman / Sheet-2 column F): compose named sets + `additional_statistics`. Not `statistics_type + distribution`. |
| D2 | Method `indexed_by` shape | **Unchanged** — keep today's flat string list (e.g. `["covariate", "fixed_effect", "fixed_effect:fixed_effect"]`). The structured `{source, sourceValue, cardinality}` form from the sheet was considered and **dropped** for 1.0. |
| D3 | Migration scope | **Full at the vocab + concept + schema layer** (new `statistic_sets`, rewritten `output_class_templates`, unified AC concept model, new vocab linkML). **Method files need no structural edit** — `indexed_by` is unchanged and `output_type`/`name` FKs are stable. |
| D4 | Vocab gets its own linkML schema | **Yes** — new `model/linkML/acdc_output_classes.yaml`. |
| D5 | Sheet-2 `point_estimate` vs existing atom `estimate` | **Map to existing `estimate`** (keeps its STATO code); `point_estimate` is a display alias. |
| D6 | FHIR datatypes on AC concepts | **AC statistical concepts carry proper FHIR `valueType`s**, like the other concept files — dimensionless → `decimal`, single measured value → `Quantity`, counts → `Count`, the **confidence interval → one `Range` concept** (`low`/`high`). General rule: a method atom is a FHIR *leaf value*; the AC concept wraps one or more leaves (§4.1). Lifts the `layerMapping.ac_concept_statistics → primitiveTypes` restriction. **Method side stays primitive** (sets/templates keep `CI_lower`/`CI_upper` as two leaf atoms; §3.2.1 invariant intact). See §4. |
| D7 | Reconcile `AC_Concept_Model_v017.json` with the output classes | **Single source of truth + crosswalk, both namings kept.** One shared `statistic_sets` (and the shared statistic atoms) are authoritative, referenced by **both** sides. **Method layer keeps snake_case** (FK-stable machine ids: `estimate`, `ls_means`); **AC keeps PascalCase `conceptId`s** aligned with sibling concept files (OC, Option_B): `Estimate`, `LSMeans`. The two are bound by an explicit, **build-validated** `sameAs` crosswalk — not hand-synced copies. `methodOutputSlotMapping` repaired. AC model is **in scope** for 1.0. See §5. |

## 3. The three-layer vocabulary stack

```text
statistics_vocabulary.json   atoms        e.g. estimate, SE, CI_lower, p_value, df
        ▲ referenced by
statistic_sets.json  (NEW)    bundles      e.g. ci_estimate_t_distribution
        ▲ referenced by                         = [estimate, CI_lower, CI_upper, SE, df]
output_class_templates.json   templates    e.g. parameter_estimates_linear
                                            = sets[...] + additional_statistics[...]
```

Methods reference a **template** via `outputs[].output_type` (unchanged). The
template, not the method, owns the statistics composition.

### 3.1 `lib/vocabulary/statistic_sets.json` (NEW)

Sheet 2 verbatim, as SKOS-style concept entries. One object keyed by set id,
each with `conceptId`, `name`, `label`, `ncitCode`, `codings`, `description`,
and `statistics: [...]` (FKs into `statistics_vocabulary.json`).

The 13 sets (typos normalized; `point_estimate`→atom `estimate`; `Z_statistic`→
`z_statistic`; `chi_squred`→`chi_squared`):

| Set id | statistics |
|--------|-----------|
| `hypothesis_test_F_distribution` | F_statistic, p_value, df_num, df_den |
| `hypothesis_test_t_distribution` | t_statistic, p_value, df |
| `hypothesis_test_chi_squared` | chi_squared, p_value, df |
| `hypothesis_test_normal` | z_statistic, p_value |
| `hypothesis_test_p_value` | p_value |
| `ci_estimate` | estimate, CI_lower, CI_upper |
| `ci_estimate_normal` | estimate, CI_lower, CI_upper, SE |
| `ci_estimate_t_distribution` | estimate, CI_lower, CI_upper, SE, df |
| `ci_estimate_odds_ratio` | odds_ratio, CI_lower, CI_upper |
| `ci_estimate_hazard_ratio` | hazard_ratio, CI_lower, CI_upper |
| `point_estimate_SE` | estimate, SE |
| `proportion_estimate` | numerator, denominator, proportion, pct |
| `computed_value` | value |

New atoms to add to `statistics_vocabulary.json`: `numerator`, `denominator`
(referenced by `proportion_estimate`; not currently present).

### 3.2 `lib/vocabulary/output_class_templates.json` (rewrite)

Each **concrete** template replaces its inline `statistics: [...]` with:

```json
"parameter_estimates_glm": {
  "conceptId": "parameter_estimates_glm",
  "name": "...", "label": "...", "broader": "parameter_estimates",
  "statistics_set": ["point_estimate_SE", "hypothesis_test_normal", "ci_estimate_odds_ratio"],
  "additional_statistics": ["coefficient"],
  "optional_statistics": []
}
```

- **Abstract families kept**: SKOS `broader` and the abstract parents
  (`fit_statistics`, `type3_tests`, `parameter_estimates`, …) are unchanged.
  Abstracts carry neither `statistics_set` nor `statistics`.
- The flat `statistics` array is **removed** from concrete templates and becomes
  *derived* (union of the referenced sets' statistics + `additional_statistics`).
- `optional_statistics` is retained for members that may be absent at runtime
  (e.g. `p_value_adjusted` on contrasts, `CI_lower/CI_upper` on
  `proportion_estimate`).

#### 3.2.1 Migration safety invariant (the verifiable rule)

> For every concrete template, the **union of the statistics of its referenced
> `statistics_set` entries, plus `additional_statistics`, MUST equal the
> template's prior `statistics` array** (order-insensitive).

This makes the refactor non-destructive and mechanically checkable. Leftover
atoms that no set supplies go into `additional_statistics`. The one atom needing
care is `coefficient` (parameter tables): the generic sets supply `estimate`, so
the parameter-table templates carry `coefficient` in `additional_statistics` and
do **not** include a generic point-estimate set member that would inject
`estimate`. See the per-template mapping in §3.2.2.

#### 3.2.2 Per-template mapping (concrete templates)

Sets `+ additional` chosen so the union equals each template's current
statistics. `[]` sets = pure `additional_statistics`.

| Template | statistics_set | additional_statistics |
|----------|----------------|-----------------------|
| `fit_statistics_basic` | — | AIC, BIC, minus2LogL |
| `fit_statistics_linear` | — | AIC, BIC, minus2LogL, R_squared |
| `fit_statistics_concordance` | — | AIC, BIC, minus2LogL, concordance |
| `type3_tests_f` | hypothesis_test_F_distribution | SS, MS |
| `type3_tests_mixed` | hypothesis_test_F_distribution | — |
| `type3_tests_chi_squared` | hypothesis_test_chi_squared | — |
| `chi_squared_test_result` | hypothesis_test_chi_squared | — |
| `t_test_result` | hypothesis_test_t_distribution | — |
| `exact_test_result` | hypothesis_test_p_value | — |
| `homogeneity_test` | hypothesis_test_chi_squared | — |
| `parameter_estimates_linear` | ci_estimate_t_distribution, hypothesis_test_t_distribution | coefficient |
| `parameter_estimates_glm` | point_estimate_SE→*, hypothesis_test_normal, ci_estimate_odds_ratio | coefficient |
| `parameter_estimates_cox` | point_estimate_SE→*, hypothesis_test_normal, ci_estimate_hazard_ratio | coefficient |
| `covariance_parameters` | point_estimate_SE | — |
| `contrasts_t` | ci_estimate_t_distribution, hypothesis_test_t_distribution | (p_value_adjusted → optional) |
| `contrasts_z` | ci_estimate_normal, hypothesis_test_normal | (p_value_adjusted → optional) |
| `odds_ratio_measures` | ci_estimate_odds_ratio | — |
| `ls_means` | ci_estimate_t_distribution | — |
| `point_estimate` | ci_estimate_normal | — |
| `odds_ratio_estimates` | ci_estimate_odds_ratio | — |
| `hazard_ratio_estimates` | ci_estimate_hazard_ratio | — |
| `multivariate_tests` | hypothesis_test_F_distribution | estimate |
| `global_tests` | hypothesis_test_chi_squared | — |
| `survival_table` | ci_estimate_normal→survival_prob | n_risk, n_event, n_censored |
| `median_survival` | ci_estimate→median | — |
| `event_summary` | — | n_risk, n_event, n_censored |
| `landmark_estimates` | ci_estimate_normal→survival_prob | — |
| `proportion_estimate` | proportion_estimate | (CI_lower, CI_upper → optional) |
| `frequency_table` | — | frequency, n |
| `cumulative_frequency_table` | — | cumulative_n, cumulative_pct |
| `quartile_estimates` | — | Q1, Q3 |
| `computed_value` | computed_value | — |

`→*` / `→atom` notes a template where the set's generic `estimate` slot stands
for the template's domain point statistic (`coefficient`, `survival_prob`,
`median`). **This "point-estimate role specialization" is the one item to confirm
during spec review** (§8, Q1): the alternative is to keep these atoms purely in
`additional_statistics` and drop the generic-point set. The invariant in §3.2.1
holds either way; only authoring style differs. The table above will be
finalized against the invariant during implementation, with the build check as
the backstop.

## 4. FHIR datatypes on AC concepts (D6)

**Question:** should an AC statistical concept carry a FHIR datatype like the
rest of the concept files? **Yes.**

Two clarifications:

- "FHIR datatype" spans **primitives** (`decimal`, `integer`, `boolean`) **and**
  **complex types** (`Quantity`, `Range`, `CodeableConcept`, `Count`). So
  today's `dataType: "decimal"` on every AC statistic is *a* FHIR datatype — but
  it is under-specified (everything is bluntly `decimal`), and the vocab's
  `layerMapping` currently **forbids** complex types on AC statistics
  (`ac_concept_statistics → primitiveTypes`). That restriction is what we lift.
- This is consistent with the existing principle that FHIR complex types are a
  **concept-side** concern (`acdc_method.yaml` §3.4/§3.6): the AC concept layer
  is exactly where they belong; it is the **method** layer that stays primitive.

So each AC statistical concept declares its real FHIR `valueType`:

| AC statistic(s) | FHIR `valueType` |
|-----------------|------------------|
| p_value, df, df_num, df_den, F/t/z/χ² statistics, odds_ratio, hazard_ratio (dimensionless) | `decimal` |
| estimate, SE, survival_prob, median, mean (single measured value, carries a unit) | `Quantity` (= `value` + `unit`; unit bound at transformation time) |
| n_risk, n_event, n_censored (counts) | `Count` |
| the confidence interval (`CI_lower` + `CI_upper`) | `Range` (= `low` + `high`, each a `SimpleQuantity`) |

### 4.1 The general rule: method atom = FHIR leaf value

A FHIR datatype is a mini-model of value leaves: `Quantity` has one value
(`value`); `Range` has two (`low.value`, `high.value`). The clean mapping across
the two layers is:

> **Each method-side statistic atom is a FHIR *leaf value*; the AC concept wraps
> one or more leaves in its FHIR datatype.**

| AC concept | FHIR `valueType` | leaves ← method atom(s) |
|------------|------------------|--------------------------|
| `Estimate` | `Quantity` | `value` ← `estimate` |
| `SE` | `Quantity` | `value` ← `SE` |
| `ConfidenceInterval` | `Range` | `low.value` ← `CI_lower`; `high.value` ← `CI_upper` |
| `PValue` | `decimal` | (the value itself) ← `p_value` |
| `NRisk` | `Count` | `value` ← `n_risk` |

So the confidence interval is **one** `ConfidenceInterval` concept typed `Range`,
not two — its two bounds live at `low.value` / `high.value`, exactly as a measured
value lives at `Quantity.value`. This is more faithful than two standalone
bound-Quantities (a lone upper bound is not a meaningful concept).

`Range.low` and `Range.high` are each a `SimpleQuantity` — i.e. a `Quantity`
(same `value` + `unit` fields) with the `comparator` element prohibited. So both
CI bounds are genuine measured quantities with a unit, not bare decimals. **The
unit is shared:** the transformation binds a single unit (the analyte's, from the
bound concept) across the estimate and its confidence interval — i.e. across
`Estimate.value`, `SE.value`, and the `Range`'s `low.value` / `high.value`. The
method side still emits only the bare decimal leaves; the unit is supplied once
at transformation time.

What this does and does not touch:

- **Method side unaffected.** `statistic_sets` and `output_class_templates` keep
  the decomposed leaf atoms (`CI_lower`, `CI_upper` remain two columns). The
  §3.2.1 invariant holds.
- **Single source of truth (D7).** The shared statistic atom carries **both** a
  primitive `dataType` (read by the method / sets / templates) **and** a
  `fhirValueType` (read by the AC concept layer and the recording layer). One
  record, two typed views — exactly what `layerMapping` anticipates.
- **Crosswalk is leaf-aware, not strictly 1:1.** A `Range`/`Quantity`-with-
  multiple-leaves concept maps to >1 atom via its leaves (see §5.2). For all
  single-leaf types it stays effectively 1:1.
- **Vocab change.** Add `Range` and `Count` to `fhir_value_types.json`
  `complexTypes`; relax `layerMapping.ac_concept_statistics` to resolve to the
  atom's `fhirValueType` rather than `primitiveTypes` only.

## 5. Unifying `AC_Concept_Model_v017.json` with the output classes (D7)

Today there are **two parallel, drifting hierarchies** for the same content:

| Layer | Method side (`lib/vocabulary/`) | AC concept side (`AC_Concept_Model_v017.json`) |
|-------|----------------------------------|------------------------------------------------|
| Atoms | `statistics_vocabulary.json` (`estimate`, `CI_lower`, …) | `sharedStatisticsVocabulary.concepts` (`Estimate`, `CI_Lower`, …) |
| Molecules | `output_class_templates.json` (`ls_means`, …) | `resultPatterns` (`LSMeans`, …) |
| Groupings | (none) | `categories` (`TreatmentComparison`, …) |
| Bridge | — | `methodOutputSlotMapping` (method slot → pattern) |

The atom vocabularies duplicate each other in different casing, the molecule
sets duplicate each other, and `methodOutputSlotMapping` is **stale** (its MMRM
slot names — `adjusted_means`, `fixed_effects`, … — don't match the actual
method files' output names, and it maps `M.Quartile → ComputedValue`, a pattern
that no longer exists).

### 5.1 Best practice: one source of truth per fact, two namings, validated crosswalk

The two naming conventions are **deliberate and both kept** — they were made for
a reason confirmed against the codebase:

- **Method layer** uses snake_case machine ids (`estimate`, `ci_lower`,
  `ls_means`) — JSON keys and **FK targets** referenced by the method files and
  the transformation library. Renaming would break those FKs.
- **Concept layer** (AC, OC, `Option_B_Clinical`) uses PascalCase `conceptId`s
  (`Estimate`, `LSMeans`) as a consistent concept-model convention. AC must stay
  aligned with its **sibling concept files**, not the method library.

Best practice for the same concept appearing under two id systems is **not** to
pick one name; it is to record each fact **once** and bind the two id systems
with an **explicit, build-validated crosswalk**. The current drift (stale
`methodOutputSlotMapping`) is the symptom of the anti-pattern: two independent
copies hand-kept in sync. The fix makes drift impossible by failing the build,
not by discipline.

```text
shared statistic atoms  +  statistic_sets.json   ← single source of truth
   (definition, STATO, dataType, constituents)      "owned by neither" (per the model's own principle)
        ▲                                    ▲
        │ snake_case ids                     │ snake_case set ids
        │                                    │
output_class_templates.json            AC sharedStatisticsVocabulary + resultPatterns
(method side; no dimensions)           (concept side; PascalCase conceptId + `sameAs`
                                        crosswalk to the atom; adds `dimensions`)
```

### 5.2 Scope this adds to 1.0

1. **One authoritative statistics vocabulary + sets, owned by neither layer.**
   The shared atoms (definition, STATO code, dataType) and the `statistic_sets`
   are recorded once. Honors the model's stated principle that the shared
   statistics vocabulary is *"referenced by both … owned by neither."*
2. **Keep both namings; add a `sameAs` crosswalk.** Method side keeps snake_case
   (unchanged FKs). Each AC `sharedStatisticsVocabulary` concept keeps its
   PascalCase `conceptId` **and** gains a `sameAs` (e.g. `Estimate.sameAs =
   "estimate"`) resolving to the shared atom. The AC entries become thin
   references to the shared semantics, not independent definitions.
3. **Share the sets.** AC `resultPatterns` reference the same `statistic_sets`
   (by their snake_case set ids) so the two molecule layers cannot diverge. A
   pattern's `constituents` are the AC concepts whose FHIR **leaves cover** the
   referenced sets' atoms (§4.1) — e.g. one `ConfidenceInterval` (`Range`)
   covers the `CI_lower` + `CI_upper` atoms.
4. **Keep the one genuine difference.** `resultPatterns` retain `dimensions`
   (`factor`, `level`, `term`, `group`, `time`) — the concept-side row
   structure — which templates deliberately omit. (The method-side row shape
   stays in each method's existing flat `indexed_by`; D2.)
5. **Repair `methodOutputSlotMapping`** to use the real method output-slot names
   (`ls_means`, `type3_tests_f`, `parameter_estimates_linear`, …) and real
   patterns; drop dangling references (e.g. `ComputedValue`).
6. **Build-validated crosswalk.** Every AC concept's `sameAs` leaves must resolve
   to shared atoms; every pattern's concepts' leaves must **cover exactly** the
   union of its referenced sets' atoms (leaf-aware, §4.1); every
   `methodOutputSlotMapping` value must resolve to a real pattern and slot. These
   checks live alongside the §3.2.1 invariant.
7. **`acdc_output_classes.yaml`** (the new vocab linkML, D4/§6.2) governs the
   shared atoms, the sets, the templates, **and** the AC `resultPatterns` shape
   incl. the `sameAs` crosswalk.

One sub-decision remains open (§8 Q4): the **physical home** of the single
source of truth — whether the shared atoms/sets live in the method-side
`lib/vocabulary/*` referenced by AC, or are extracted to a neutral `lib/shared/*`
referenced by both. Naming (D7) and pattern shape (reference shared sets +
`sameAs` + `dimensions`, per items 3–4) are now settled.

## 6. linkML schema changes (`model/linkML`)

### 6.1 `acdc_method.yaml`

- **No change to `MethodOutput.indexed_by`** — it stays `string[]` (D2).
- Reconcile stale enums `OutputClass`, `OutputShape`, `Distribution`: these
  encoded the abandoned "three-axis" model and are now superseded by the vocab
  files. **Remove** them (with a comment pointing to `acdc_output_classes.yaml`).
- Bump schema `version` to `0.3.0` to track the enum cleanup.

### 6.2 `acdc_output_classes.yaml` (NEW)

A standalone linkML schema governing the vocab files:

- `StatisticSetLibrary` (tree root) → `statistic_sets: StatisticSet[]`.
  `StatisticSet { conceptId(id), name, label, ncitCode, codings, description,
  statistics: string[] }`.
- `OutputClassTemplateLibrary` (tree root) → `output_class_templates:
  OutputClassTemplate[]`. `OutputClassTemplate { conceptId(id), name, label,
  ncitCode, codings, description, abstract, broader, statistics_set: string[],
  additional_statistics: string[], optional_statistics: string[] }`.
- Cross-field rule (documented, validator-enforced): a concrete template has at
  least one of `statistics_set`/`additional_statistics`; an abstract template
  has neither.

### 6.3 `acdc_transformation.yaml`

No structural change required (it FKs `method.outputs[].name`, which is
preserved). Bump version note only if regenerated.

## 7. Library + aggregate changes (`lib/`)

1. `lib/vocabulary/statistic_sets.json` — new (§3.1).
2. `lib/vocabulary/statistics_vocabulary.json` — add `numerator`, `denominator`
   atoms; bump version.
3. `lib/vocabulary/output_class_templates.json` — rewrite per §3.2; bump version.
4. `lib/methods/analyses/*.json` — **no structural change**: `indexed_by` stays
   as today's flat string list, `output_type`/`name` preserved. Optional
   `schema_version` bump only, to track the `acdc_method.yaml` enum cleanup.
5. `lib/methods/derivations/*.json` — **no change required** (single
   `computed_value` output, no `indexed_by`). Optional `schema_version` bump.
6. `lib/methods/AllMethods.json` — rebuild aggregate; add a `statisticSets`
   section alongside `outputClassTemplates`/`statistics`. (`_index.json` registry
   is unaffected — no output structure in it.)
7. `lib/vocabulary/fhir_value_types.json` (§4) — add `Range` and `Count` to
   `complexTypes`; **relax `layerMapping.ac_concept_statistics`** to allow
   complex types (resolve to the atom's `fhirValueType`, not `primitiveTypes`
   only).
8. Shared statistic atoms (§4, §5) — each atom gains a `fhirValueType` (e.g.
   `estimate → Quantity`, `p_value → decimal`, `n_risk → Count`) alongside its
   existing primitive `dataType`. Lives wherever the shared spine lands (§8 Q4).
9. `lib/concepts/AC_Concept_Model_v017.json` (§5) — `sharedStatisticsVocabulary`
   concepts gain `sameAs` crosswalk to the shared atoms (and surface the
   `fhirValueType`) and stop redefining semantics; `resultPatterns` reference the
   shared `statistic_sets` (constituents derived/validated) and keep `dimensions`;
   `methodOutputSlotMapping` repaired to real slot names + patterns; version bump.

The transformation library (`ACDC_Transformation_Library_v07.json`) is **not**
edited (no `output_type`/`indexed_by`/`statistics` references in it).

## 8. Open items to confirm during spec review

1. **Point-estimate role specialization** (§3.2.2): confirm whether
   parameter/survival/median templates express their domain point statistic by
   reusing a generic-point set (`estimate` slot stands in) or keep those atoms
   in `additional_statistics`. Invariant §3.2.1 holds either way.
2. **`proportion_estimate` atoms**: Sheet 2 lists `numerator, denominator,
   proportion, pct`; the current `proportion_estimate` template lists
   `proportion, pct, CI_lower, CI_upper`. The set covers numerator/denominator;
   CI bounds remain `optional_statistics`. Confirm numerator/denominator are
   wanted as first-class atoms.
3. **`AllMethods.json` regeneration**: confirm there is (or we add) a build step;
   otherwise it is rebuilt by bundling the source files during implementation.
4. **Physical home of the shared spine** (§5.2): whether the authoritative
   shared atoms + `statistic_sets` live in the method-side `lib/vocabulary/*`
   (referenced by AC), or are extracted to a neutral `lib/shared/*` referenced by
   both layers. Affects file paths and `$vocabulary` resolver hints only.

## 9. Out of scope (1.0)

- `statistics_type + distribution` semantic axis (D1 rejected for 1.0).
- A formal `distribution` vocabulary.
- **Structured method `indexed_by`** (`{source, sourceValue, cardinality}` from
  the sheet) — considered and dropped (D2); today's flat string list is kept.
- **Collapsing the two CI bounds on the *method* side** (one `Range` column in
  `statistic_sets`/templates instead of `CI_lower`+`CI_upper`) — out of scope;
  the method side stays decomposed leaf atoms. (On the *AC concept* side the CI
  is one `Range` concept whose `low`/`high` leaves map to those two atoms — §4.1,
  in scope.)
- Re-deriving / re-writing the transformation library.
- The OC recording model (separate spec `2026-06-09-oc-recording-model-design.md`).
</content>

# Migration notes

What had to change to bring the three bodies of work together.

## Method layer

**Result of the trial migration.** Seven methods (ANCOVA, MMRM, Kaplan-Meier,
log-rank, subtraction, aggregation, mean) were converted from the `methods_02`
form into the base method schema from `model-schema`. All validated, and the
Transformations that use them could still bind their input roles and outputs.
No fallback to the `methods_02` method form was needed. The remaining 53
methods were then migrated the same way; all 60 validate.

### How each `methods_02` feature is carried

| `methods_02` | Candidate v1 (base schema) |
| --- | --- |
| `inputs[].name` | `inputs[].role` |
| `inputs[].dataType` | `inputType`: decimal and integer become `ContinuousVariable`; code, boolean, string and id become `CategoricalVariable` (with one generic factor level); date becomes `InputVariable` |
| `inputs[].cardinality` single / multiple | `multivalued` false / true |
| `formula.generic_expression` | `formula.text` (on the method for aggregation and derivation methods; on `statisticalModel` for model-based methods) |
| `formula.notation` assignment | `derivation` or `aggregation`, by method type |
| A method in Wilkinson–Rogers or survival notation | `ModelBasedMethod`. The model terms and parameters are derived from the formula: one term per right-hand-side role, one per interaction, an intercept when the formula has no other term. Roles after `|` or inside `strata()` become conditioning terms |
| `outputs[]` on a model-based method | One `SubMethod` per output, `SM.<Method>.<Output>` |
| `outputs[].output_type` | `output.outputClass`, with the class's statistic sets and statistics copied onto the output |
| `outputs[].indexed_by` | `forModelTerms` / `forModelParameters` on the sub-method output, by output-class family: type III tests point at every model term; parameter estimates at every effect and coefficient parameter; marginal means at the `_ls_mean` parameters; contrasts at the `_contrast` parameters |
| `outputs[].sub_types`, `test_types` | Listed in the sub-method description; the model terms a sub-type refers to are added to `forModelTerms` |
| The single output of an aggregation or derivation method | `output` on the method |
| Statistic, statistic-set and output-class names | Identifiers `S.<name>`, `SS.<name>`, `OC.<name>` |

A contrast is a sub-method (decision D2). Where a method produces both marginal
means and contrasts, the contrast sub-method takes the marginal-means
sub-method's estimate as its input.

### Extensions to the base method schema

Each is a small addition; nothing in the base schema was removed or changed in
meaning.

| # | Extension | Why |
| --- | --- | --- |
| X1 | `OutputSpec` gains `outputClass`, `optionalStatistics` and an optional `dataType` | Carries the output-class typing from `methods_02`, which Transformations, analysis concepts and SmartPhrases bind to; keeps optional statistics (an adjusted p-value) and the data type of a derived value |
| X2 | `Configuration` gains `conformsTo` | Lets `alpha` or `conf_level` be recognised as the same setting across methods |
| X3 | `FormulaSpec` gains `defaultExpression` and `notes` | Keeps the common form of the formula and its usage guidance |
| X4 | `DataTypeEnum` gains `object` | One configuration (visit windows) is a list of records, which no FHIR primitive describes |
| X5 | New `OutputClass` schema and library; container classes for the statistic, statistic-set and output-class libraries; a `status` on every library entry | The base schema defined `Statistic` and `StatisticSet` but no library to hold them |

### Fallbacks to the `methods_02` form

None.

### Findings for the working group

1. **Hypothesis tests have no natural class.** The base schema offers model-based,
   aggregation and derivation methods. Tests such as chi-squared, Fisher's exact,
   log-rank and the t-tests are written in Wilkinson–Rogers notation, and the
   only class that carries that notation is `ModelBasedMethod`. They are migrated
   as model-based methods with a design formula. A dedicated test-method class,
   or allowing a formula on `CompositeMethod`, would be cleaner. Fourteen methods
   are model-based under this rule; six of them fit a model in the usual sense
   (ANOVA, ANCOVA, MMRM, MANOVA, Cox PH, logistic regression).
2. **The base schema's own ANOVA example validates only against its own class.**
   LinkML's JSON Schema generator roots the schema at `Method`, so a
   `ModelBasedMethod` instance fails when checked against the root. The candidate
   validator checks each instance against the class its `methodType` names.
3. **Model terms and parameters are generated, not authored.** They follow the
   pattern of the ANOVA example, but a statistician should review them, in
   particular the generic factor levels, the self-interaction terms
   (`fixed_effect:fixed_effect`) and which parameters each sub-method output
   refers to.
4. **`indexed_by` is not carried verbatim.** Its granularity and component
   information is expressed through the model-term and parameter links instead.
   The `axis` hint (response, time, cov_param) has no counterpart and is dropped.
5. **`dec_id` on statistics is dropped.** It was null for every statistic. NCIt
   codes are still to be assigned (`ncitCode` is absent throughout).
6. **Configured sub-methods are inferred.** `ss_type` is attached to the type III
   test sub-method, and `alpha` / `conf_level` to every sub-method whose output
   carries a confidence interval. Other configurations are left unattached.

## Concept layer

The three concept models on `methods_02` are merged into one library,
`v1/lib/concepts/concepts.json` (106 concepts), following the June 2026 spike
and its recommended revision (decision D3).

| Source | Becomes |
| --- | --- |
| Observation model (`OC_Recording_Model` v0.17): spine, qualifiers and class nodes | 57 collected concepts and groupings, definition form `none`. FHIR datatype leaves (`value`, `code`, `period` …) are structure, not concepts, and are left out |
| Derivation model (`Option_B_Clinical` v0.20) | 28 derived concepts in five categories. Five are closed-form (Measure, Change, PercentChange, Ratio, LogRatio); 23 are method-bound |
| Analysis model (`AC_Concept_Model` v0.18): result patterns and categories | 12 analysis concepts (method-bound) in three categories |
| Shared dimensions of the observation and derivation models | One set of dimension concepts (Subject, Study, Site, Visit, Timepoint, Treatment, Population, Parameter, Period, Timing, Event) |
| The analysis model's "statistical concepts" (Estimate, SE, ConfidenceInterval …) | Not concepts. They are the statistics vocabulary (`S.*`); their value type and unit rule moved onto the statistic |
| Concept-to-variable provenance in the spike | Not on the concept. It is the Data Binding layer's job (decision D8) |

Changes to the spike schema:

- Identifiers take a `C.` prefix (`C.Change`), in line with `M.`, `T.`, `S.`.
- Categories are abstract concepts; membership is `broader`, which may name
  several (AnalysisVisit is both a Classification and a visit dimension).
- A third definition form, **method-bound**, replaces the spike's "estimand
  contract" and its forced algebraic identities for integrals, counts and
  windowing. A method-bound concept states an operation and operands (derived)
  or the statistics it is made of (analysis). It never names a method; the
  Transformation chooses one, and the binding is valid when the method output
  carries the concept's statistics. The word "estimand" is not used (D10).
- Names that clashed across the three models were made distinct:
  `ObservationCategory`, `ObservationSubcategory`, `CollectionMethod`,
  `DoseFrequency`.

### Findings for the working group

7. **Analysis concepts are specific to one test distribution.** A result
   pattern is defined by its statistic sets, so Contrasts needs a t-statistic and
   degrees of freedom, Type III tests an F-statistic, and TestResult a chi-squared
   statistic. Output classes of the same kind but another distribution do not
   satisfy them: `contrasts_z`, `type3_tests_chi_squared`,
   `parameter_estimates_glm`, `parameter_estimates_cox`, `t_test_result` and
   `exact_test_result`. Either the concepts should be generalised (a test
   statistic of any distribution) or variant concepts added. Until then an
   analysis that produces those outputs has no analysis concept to bind to.
8. **The older `constituents` lists disagree with the statistic sets.**
   For example MedianSurvival listed a `median` statistic, while its statistic
   set and the matching output class carry a generic `estimate`. The statistic
   sets are used, as v0.18 of the analysis model intended.
9. **Almost no concept has an NCIt code.** Only observation concepts that came
   with a single CDISC data-element concept code have one.
10. **Population is recorded as a derived dimension with no definition.**
    Analysis-set membership is defined per study, not by the library.

## Transformation layer

`v1/lib/transformations/transformations.json` holds 26 templates: the 25 of
Transformation Library v0.7 on `methods_02`, and `T.PFS_KaplanMeier`, proposed
on `estimands_01` and marked `provisional`.

| `methods_02` v0.7 | Candidate v1 |
| --- | --- |
| `concept: "Change"` | `concept: "C.Change"` (a Concept identifier) |
| `conceptCategory: "ParameterDimension"` | `conceptCategory: "C.ParameterDimension"` (an abstract Concept) |
| `concept: "Observation"` | `conceptCategory: "C.Observation"` — Observation is a grouping, so it can only be referenced as a category |
| Input measure `input: "response"` | Unchanged; it now names `Method.inputs[].role` |
| Output measure `output: "ls_means"` | `output: "SM.ANCOVA.LsMeans"` — the SubMethod that produces it; for a method with one output, the Method itself (`M.Subtraction`) |
| `smartPhrases`, `roleDefinitions`, `configurationOptions` in the same file | Moved to the SmartPhrase library (D9). `validSmartPhrases` stays on the template |
| `methodConfigurations[].value` holding a list | `valueList` (a single value stays in `value`) |
| Design-document section references (§6.3 …) in the schema | Removed; the cross-file rules are restated as T1–T10 in the schema and enforced by the validator |

The schema itself is otherwise the `methods_02` transformation schema: twin
input and output data structures, slices and slice keys, model interactions,
contrast specifications.

Two slice-key sources were added (`event`, `treatment`) for time-to-event
templates.

### Findings for the working group

11. **`T.PFS_KaplanMeier` used two concepts the analysis model does not have.**
    `SurvivalFunction` is mapped to `C.SurvivalTable`, which is the same thing.
    `LandmarkEstimate` had no counterpart, so `C.LandmarkEstimates` is added as a
    provisional concept.
12. **Placeholders are not declared.** Templates use `{parameter}`, `{visit}`,
    `{population}`, `{baseline_visit}`, `{control_arm}` and `{event}`, but only
    the first three and `{event}` have a slice key. The validator derives the
    full set from the template and checks that a study supplies each one.

## SmartPhrase layer

`v1/lib/smartphrases/smartphrases.json` holds 31 phrases in ten roles, with
language packs for English, French and German.

| Source | Candidate v1 |
| --- | --- |
| 23 phrases and 8 roles inside the Transformation Library v0.7 | Their own library and schema (D9, D12) |
| 8 phrases and 2 roles (`ice_handling`, `summary_measure`) proposed on `estimands_01` | Included, marked `provisional`. The role order is the merged order the proof of concept used |
| `oid` | `conceptId` (the shared identifier slot); values unchanged (`SP_CFB_ENDPOINT`) |
| snake_case fields (`phrase_template`, `concept_constraint`, `default_render` …) | camelCase, as in the rest of the model |
| `anchors.produced_concept: "Change"` | `anchors.producedConcept: "C.Change"` |
| Language overlay (sentence templates, conjunctions, translated phrases, method and output names) | `languagePacks` in the library. Translations of *study* concepts stay with the study |
| An `output_ref` bound to an output-class name | Bound to the producing SubMethod (see the study layer) |

Added for decision D13 (extension points for an eSAP model):

- a placeholder kind `extension_ref`, with `extensionType`, for a phrase slot
  that points at an entity the extending model owns;
- `definedBy` on a role, for a role the extending model adds.

### Findings for the working group

13. **Two roles repeat but were not flagged.** `covariate` and
    `method_qualifier` are each filled several times in the worked studies. Both
    are marked repeating.
14. **The French and German packs are illustrative.** They are marked
    `validated: false`. German needs case declension for the intercurrent-event
    noun, which a single name per concept cannot give.
15. **`population` binds an analysis set, not the estimand's target population.**
    The role is mapped to the Population attribute of ICH E9(R1), with that
    caveat in its description.

## Implementation layer

### Data bindings (normative)

| Source | Candidate v1 |
| --- | --- |
| `concept-variable-mappings.json` on `methods_02` — the ADaM section | `v1/lib/bindings/adam_bindings.json`, 49 class-level bindings. One binding per variable, with its facet (value, unit, code, decode), data type and qualifiers (intent Planned or Actual; which population) |
| The observation model's SDTM variable aliases and data-element-concept codes, and the SDTM section of the mapping file | `v1/lib/bindings/sdtm_bindings.json`, 72 class-level bindings. Each records the data-element-concept code(s) the variable carries in the SDTM Dataset Specialisations, so the specialisations remain the source of truth |
| The OMOP and FHIR sections of the mapping file | Not migrated. Non-CDISC standards are out of scope for v1 (D8). The locator is typed (`tabular`, with `path` reserved) so that they can be added without changing the model |
| A variable listed for several concepts, with nothing to tell them apart (`AVAL` for Measure, PeakValue, AreaUnderCurve, EventCount, TimeToEvent) | Each such binding is marked `parameterDependent`. A value-level binding in the study says which Concept the variable carries for which parameter |

### Implementation catalogues (informative)

The R (19 methods) and SAS (11 methods) catalogues on the `model-schema`
lineage are carried into `v1/lib/implementations/`. Each output mapping now
names the Method or sub-method that produces it, and each result column the
statistic it holds where there is one.

### Findings for the working group

16. **Five ADaM concepts had nowhere to bind.** The mapping file binds Age, Sex,
    Race, Region and Epoch, but no concept model defines them. They are not
    migrated; demographic and epoch concepts are a gap in the concept library.
17. **The catalogues are out of step with the methods.** Their call templates
    use role names the methods no longer have (33 warnings, rule I4), and both
    map a `covariance_parameters` output for ANCOVA that the method does not
    produce. They need revising against the migrated methods.
18. **SDTM bindings are by reference in intent, not yet in mechanism.** They
    carry data-element-concept codes copied from the observation model. A
    production library would resolve them against the CDISC Library.

## Study layer

The two study graphs of the SmartPhrase proof of concept become study analysis
sets (`v1/studies/<study>/analysis_set.json`).

| Proof of concept | Candidate v1 |
| --- | --- |
| Analysis instance | `AnalysisConcept` (D11) |
| `estimand` | `addressesEstimand` (D5) |
| Slice values implied by phrase bindings | Stated as `placeholderValues`, one per template placeholder |
| Intercurrent-event strategy and `implementedBy` on the event concept; the analysis inheriting a study default | Resolved onto every Analysis Concept as `iceHandlings`, one per event in the estimand's scope, each saying whether a phrase states it or the study default applies (D4) |
| `ascertainedBy` on the event concept | Moved to the non-normative eSAP extension example. How an event is detected is not AC's (D13) |
| An `output_ref` bound to an output-class name (`contrasts_t`) | Bound to the sub-method that produces it (`SM.ANCOVA.ContrastsT`) |
| `data` hooks on concepts and free-text trace templates | `dataSelection` on the study concept (dataset, conditions) and value-level data bindings (D8) |
| Translations of study concepts in the language overlay | `translations` on the study concept |
| Templates copied into the study | Referenced; the study pins library versions (D6) |
| — | Derivation Concepts. The proof of concept had none. The build added the baseline, LOCF and change-from-baseline derivations that the CDISC Pilot analyses depend on |

### Findings for the working group

19. **`{control_arm}` had no value.** `T.CFB_ANCOVA` needs a control arm for its
    contrasts, and the proof-of-concept study had only one treatment concept
    covering all arms. The build supplies the literal `Placebo`. A study needs
    arm-level concepts.
20. **The library has no derivations for time-to-event data.** The PrE0102
    analyses read time to event and the event indicator straight from the
    analysis dataset; there is nothing to say how they are derived or censored.
21. **`M.KaplanMeier` cannot carry a confidence level.** PrE0102 states 90%
    confidence intervals, but the method has no such configuration (4 warnings,
    rule Y9).
22. **A "PFS" template is used for overall survival and time to progression.**
    It works, because the event is a placeholder, but `T.PFS_KaplanMeier` is
    misnamed. `T.TTE_KaplanMeier` would be accurate.
23. **LOCF as the hypothetical strategy is a doubt carried over, not settled.**
    It is the only imputation derivation the library has. Whether it is an
    acceptable implementation of a hypothetical strategy is a statistical
    question for the working group.
24. **The ANCOVA STATO code differs between sources.** The method carries
    `STATO_0000179`; the study grounding carries `STATO_0000176`. Both are kept
    as found. One of them is wrong.

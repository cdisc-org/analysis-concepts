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

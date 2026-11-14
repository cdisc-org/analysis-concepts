# Decisions log

Two kinds of decision are recorded here.

- **Design decisions (D1–D13)** were taken on 14 November 2026 as the basis for a
  proposed v1. They are a proposal to the working group, not its agreed position.
- **Build decisions (B1 onwards)** were taken during the build, without review,
  to keep it moving. Every one is **provisional**.

## Design decisions

| # | Topic | Decision | Why |
| --- | --- | --- | --- |
| D1 | Method schema | The LinkML method schema from `model-schema` (Method, SubMethod, CompositeMethod, ModelBasedMethod, AggregationMethod, DerivationMethod; typed inputs; statistical model, model terms and parameters) is the base. Content from `methods_02` is ported into it. Where a feature cannot be made to work with the rest of the model, the `methods_02` form is used for that feature and the reason recorded | It is the most recent model work and the only schema that types inputs as continuous or categorical and models factor levels |
| D2 | Contrasts | A contrast is a sub-method of the model that produced it. Fallback: a separate contrast method | Follows D1; keeps a fitted model and its contrasts in one unit |
| D3 | Concept layer | One LinkML concept library across observation, derivation and analysis concepts, replacing the three separate models. A concept is *collected* (no definition), *closed-form* (carries a formula) or *method-bound* (a contract that a method output satisfies) | The June 2026 spike recommended adoption with exactly this revision |
| D4 | Intercurrent-event strategy | Recorded on the study analysis instance, per estimand and event, with the Transformations that implement it. How an event is detected belongs to an eSAP | D13 puts reporting events outside AC |
| D5 | Estimand and analysis | The analysis points at the estimand. Exactly one main estimator per estimand | The estimand belongs to USDM, which AC never modifies |
| D6 | Library templates | A study references a library template with an exact version pin. A resolved snapshot may accompany a submission | A copy without a pin loses traceability; a reference without a snapshot depends on the library staying available |
| D7 | Filter and slice | Population is a dimension fixed by a slice. There is no separate filter role. Attributes are never computed on | One mechanism instead of two |
| D8 | Implementation layer | Data Binding is normative and modelled on Biomedical Concept Dataset Specialisations: a bound variable names its Concept, with conditions that say when the binding applies. v1 covers CDISC standards only. Code maps are informative | Reuses a pattern CDISC already publishes; conditions resolve one variable standing for several Concepts |
| D9 | SmartPhrase schema | SmartPhrases have their own LinkML schema and versioning policy | D12 makes SmartPhrase a layer |
| D10 | Naming | "Analysis Concepts (AC)" throughout. File names match identifiers (`M.ANCOVA.json`). "Estimand" is used only in the ICH E9(R1) sense | Follows the October 2026 rename |
| D11 | "Analysis Concept" | An Analysis Concept is a study analysis instance: an analysis-type Transformation as used in a study, with its slice values, phrases and estimand link. A Derivation Concept is the same for a derivation-type Transformation | The term had no agreed definition |
| D12 | Architecture | Five layers: SmartPhrase, Method, Transformation, Concept, Implementation. SmartPhrase is a layer in its own right | Confirms the March–April 2026 architecture |
| D13 | eSAP | A full eSAP model is outside AC's scope. AC provides two extension points for one: the study analysis instance and the SmartPhrase layer | Reporting events, hypotheses, multiplicity and document structure are not analysis concepts |

## Build decisions (provisional)

| # | Decision | Why |
| --- | --- | --- |
| B1 | The candidate lives in a self-contained `v1/` tree. Existing content on the branch is left in place as legacy reference | A reviewer can read `v1/` on its own; nothing by other contributors is deleted |
| B2 | Schema files from `model-schema` are copied into `v1/schema/` and evolved there, with their origin stated in each file header | The originals stay intact for comparison |
| B3 | Migration is scripted (`v1/tools/`), from the head of `origin/methods_02` and `origin/estimands_01` | Repeatable and reviewable |

Further build decisions are appended below as they are taken.

---
artifact: common-sap-template
title: Statistical Analysis Plan — Synthesised Template
version: 1.0
synthesised_from:
  - { source: "Veramed", rev: "v3.0", style: "ICH E9 implementation, prescriptive" }
  - { source: "CoreTEE / TransCelerate", rev: "v005", style: "estimand-first, ICH E9(R1)" }
backbone: "CoreTEE flow + Veramed depth (hybrid)"
purpose: "Source of truth for deriving a semantic data model for SAPs."
conventions:
  placeholder_token: "{{snake_case_token}}"        # machine-fillable slot
  optional_marker: "optional: true"                  # section may be omitted
  repeatable_marker: "repeatable: true"              # 1..n instances (e.g. per secondary objective)
  estimand_linked: "estimand_linked: true"           # content must align to an estimand attribute
  id_scheme: "stable kebab-case slugs; never renumber — IDs are the join key for the data model"
---

# How to read this template (for an ingesting agent)

Every section below is a **node** delimited by an HTML-comment metadata block of the form:

```
<!-- node
id: <stable-slug>            # primary key; stable across versions
parent: <slug|null>
title: <human title>
required: <true|false>
repeatable: <true|false>
estimand_linked: <true|false>
ich_refs: [E3 §..., E9 §..., E9(R1)]
source: [veramed|coretee|both]
purpose: <one-line semantic intent>
produces: [prose|table|tfl_shell|definition|none]
placeholders: [{{token}}, ...]
-->
```

The prose that follows a node block is **guidance + example content**, not the deliverable.
Tokens in `{{double_braces}}` are fillable slots. `optional` / `repeatable` drive cardinality in the data model.

---

<!-- node
id: title-page
parent: null
title: Title Page
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: both
purpose: Identify the study, protocol, sponsor, SAP version and approvers.
produces: definition
placeholders: [{{protocol_title}}, {{protocol_number}}, {{protocol_version}}, {{protocol_date}}, {{compound_number}}, {{short_title}}, {{acronym}}, {{sponsor_name}}, {{sponsor_address}}, {{registry_ids}}, {{client_name}}, {{author_name}}, {{sap_version}}, {{sap_status}}, {{sap_date}}, {{approvers}}]
-->
## 1. Title Page

- Protocol Title: {{protocol_title}}
- Protocol Number: {{protocol_number}} | Compound Number: {{compound_number}}
- Protocol Version / Date: {{protocol_version}} / {{protocol_date}}
- Short Title / Acronym: {{short_title}} / {{acronym}}
- Sponsor / Client: {{sponsor_name}} — {{sponsor_address}}
- Regulatory Registry IDs: {{registry_ids}}
- SAP Version / Status / Date: {{sap_version}} / {{sap_status}} / {{sap_date}}
- Prepared by: {{author_name}} (Veramed Limited) | Approvers: {{approvers}}

---

<!-- node
id: version-history
parent: null
title: Version History
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: coretee
purpose: Track SAP versions, changes and rationale against the dated protocol.
produces: table
placeholders: [{{protocol_date}}, {{version_rows}}]
-->
## 2. Version History

This SAP for Study {{protocol_number}} is based on the protocol dated {{protocol_date}}.

| SAP Version | Date | Change | Rationale |
|---|---|---|---|
| 1.0 | {{sap_date}} | Not applicable | Original version |
| {{version_rows}} | | | |

---

<!-- node
id: abbreviations
parent: null
title: Abbreviations and Definitions
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: both
purpose: Alphabetical list of abbreviations/acronyms with definitions; maintained throughout authoring.
produces: table
placeholders: [{{abbreviation_rows}}]
-->
## 3. Abbreviations and Definitions

Spell out each term at first appearance with the abbreviation in parentheses. List all terms alphabetically.

| Abbreviation / Term | Definition |
|---|---|
| AE | Adverse Event |
| CRF | Case Report Form |
| IMP | Investigational Medicinal Product |
| SAP | Statistical Analysis Plan |
| {{abbreviation_rows}} | |

---

<!-- node
id: introduction
parent: null
title: Introduction
required: true
repeatable: false
estimand_linked: false
ich_refs: [E9(R1)]
source: both
purpose: State SAP purpose, reference protocol version/date, and whether analyses deviate from the protocol.
produces: prose
placeholders: [{{study_id}}, {{protocol_version}}, {{protocol_date}}, {{changes_statement}}]
-->
## 4. Introduction

The purpose of this SAP is to provide the information necessary to perform the planned statistical analyses of Study {{study_id}} and to define the summary TFLs for the clinical study report. It assumes familiarity with the study protocol, version {{protocol_version}}, dated {{protocol_date}}, and is compatible with ICH E9 / E9(R1).

{{changes_statement}}  <!-- "Changes to protocol-planned analyses are described in Section [changes-to-protocol]." OR "There are no changes to the analyses described in the protocol." -->

---

<!-- node
id: objectives-endpoints-estimands
parent: null
title: Study Objectives, Endpoints and Estimands
required: true
repeatable: false
estimand_linked: true
ich_refs: [E9(R1)]
source: both
purpose: Map each objective to its endpoint(s); for estimand studies, define the full estimand per objective.
produces: table
placeholders: [{{objective_endpoint_rows}}]
-->
## 5. Study Objectives, Endpoints and Estimands

| Objective Level | Objective | Endpoint(s) |
|---|---|---|
| Primary | {{primary_objective}} | {{primary_endpoint}} |
| Secondary | {{secondary_objective}} | {{secondary_endpoint}} |
| Tertiary/Exploratory | {{exploratory_objective}} | {{exploratory_endpoint}} |
| {{objective_endpoint_rows}} | | |

<!-- node
id: estimand
parent: objectives-endpoints-estimands
title: Estimand Definition
required: false
repeatable: true
estimand_linked: true
ich_refs: [E9(R1)]
source: both
purpose: Define each estimand by its five attributes; one instance per objective/estimand.
produces: definition
placeholders: [{{estimand_label}}, {{treatment_condition}}, {{population}}, {{endpoint}}, {{intercurrent_events}}, {{population_summary}}, {{estimand_rationale}}]
-->
### 5.x Estimand — {{estimand_label}}

- **Clinical question of interest:** {{clinical_question}}
- **Treatment condition:** {{treatment_condition}}
- **Population:** {{population}}
- **Endpoint:** {{endpoint}}
- **Intercurrent events (with handling strategy):** {{intercurrent_events}}
- **Population-level summary:** {{population_summary}}
- **Rationale:** {{estimand_rationale}}

Repeat for primary, co-primary, secondary, supplementary and exploratory estimands as applicable.

---

<!-- node
id: study-methods
parent: null
title: Study Methods
required: true
repeatable: false
estimand_linked: false
ich_refs: [E3 §9, E9]
source: both
purpose: Container for design, randomisation/blinding and derived variables.
produces: none
placeholders: []
-->
## 6. Study Methods

<!-- node
id: study-design
parent: study-methods
title: General Study Design and Plan
required: true
repeatable: false
estimand_linked: false
ich_refs: [E3 §9, E9]
source: both
purpose: Describe configuration, control type, blinding, treatment assignment, randomisation timing, and study period sequence/duration.
produces: prose
placeholders: [{{study_design}}]
-->
### 6.1 General Study Design and Plan
{{study_design}}

<!-- node
id: randomisation-blinding
parent: study-methods
title: Randomisation and Blinding
required: true
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.4.3, E3 §9.4.6, E9 §2.3.1, E9 §2.3.2]
source: veramed
purpose: Describe randomisation method, stratification/minimisation/blocking, blinding level, and software used.
produces: prose
placeholders: [{{randomisation_blinding}}]
-->
### 6.2 Randomisation and Blinding
{{randomisation_blinding}}

<!-- node
id: derived-variables
parent: study-methods
title: Derived Variables
required: false
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: Define derived endpoints, visit time-windows, out-of-window handling, multiple-measurement rules, scale ranges, scoring and missing-component handling.
produces: definition
placeholders: [{{derived_variables}}, {{visit_windows}}, {{scale_definitions}}]
-->
### 6.3 Derived Variables
{{derived_variables}}

---

<!-- node
id: general-considerations
parent: null
title: General Considerations
required: true
repeatable: false
estimand_linked: false
ich_refs: [E9]
source: both
purpose: Container for cross-cutting analytic conventions copied/expanded from protocol §9.1.
produces: none
placeholders: []
-->
## 7. General Considerations

<!-- node
id: hypotheses-decision-criteria
parent: general-considerations
title: Statistical Hypotheses / Decision Criteria
required: false
repeatable: false
estimand_linked: true
ich_refs: [E9 §2.2]
source: coretee
purpose: State null/alternative hypotheses or decision criteria, with sidedness and significance level.
produces: definition
placeholders: [{{hypotheses}}, {{alpha}}, {{sidedness}}]
-->
### 7.1 Statistical Hypotheses / Decision Criteria
{{hypotheses}} (alpha = {{alpha}}, {{sidedness}})

<!-- node
id: analysis-sets
parent: general-considerations
title: Analysis Sets
required: true
repeatable: false
estimand_linked: true
ich_refs: [E3 §9.7.1, E3 §11.4.2.5, E9 §5.2]
source: both
purpose: Define participant analysis sets and (for estimand studies) data-points sets; align each to an estimand; state blind-maintained assignment process.
produces: table
placeholders: [{{participant_analysis_sets}}, {{data_points_sets}}, {{set_to_estimand_map}}]
-->
### 7.2 Analysis Sets

Participant analysis sets:

| Participant Analysis Set | Description |
|---|---|
| Full Analysis Set (FAS) | All randomised participants; analysed by planned intervention. |
| Safety Analysis Set (SAS) | All participants exposed to intervention; analysed by intervention received. |
| {{participant_analysis_sets}} | |

Data-points sets (estimand framework):

| Data Points Set | Description |
|---|---|
| DPS1 | Data at/after randomisation to earliest of discontinuation or rescue. |
| DPS2 | Data at/after randomisation up to end-of-study visit. |
| {{data_points_sets}} | |

Set-to-estimand mapping: {{set_to_estimand_map}}.
Inclusion/exclusion status for each set is assigned and documented before unblinding.

<!-- node
id: covariates-subgroups
parent: general-considerations
title: Covariates and Subgroups
required: false
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.7.1, E3 §11.4.2.1, E9 §5.7]
source: veramed
purpose: Identify covariates (incl. stratification/minimisation factors) and pre-specified subgroups; subgroup focus is the interaction effect; note exploratory status and power.
produces: definition
placeholders: [{{covariates}}, {{subgroups}}, {{model_selection}}]
-->
### 7.3 Covariates and Subgroups
Covariates: {{covariates}}. Subgroups: {{subgroups}}. Model selection: {{model_selection}}.
Subgroup analyses focus on the treatment-by-subgroup interaction; subgroup-specific estimates are presented only if the interaction is statistically and clinically significant. Forest plots recommended.

<!-- node
id: missing-data
parent: general-considerations
title: Handling of Missing Data
required: true
repeatable: false
estimand_linked: true
ich_refs: [E3 §9.7.1, E3 §11.4.2.2, E9 §5.3, "EMA Guideline on Missing Data in Confirmatory Clinical Trials"]
source: both
purpose: Define missing-data approach aligned to each estimand; state assumptions (e.g. MAR); give date-imputation rules for AEs/conmeds.
produces: definition
placeholders: [{{missing_data_method}}, {{missing_data_assumptions}}, {{partial_date_rules}}]
-->
### 7.4 Handling of Missing Data
Method (per estimand): {{missing_data_method}}. Assumptions: {{missing_data_assumptions}}.
Partial date imputation rules (AEs / concomitant medications): {{partial_date_rules}}.

<!-- node
id: multiplicity
parent: general-considerations
title: Multiplicity Adjustment
required: false
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.7.1, E3 §11.4.2.5, E9 §2.2.5]
source: both
purpose: Describe multiple-testing strategy (single primary endpoint preferred; else closed testing / gatekeeping / Bonferroni) and FWER control.
produces: definition
placeholders: [{{multiplicity_strategy}}]
-->
### 7.5 Multiplicity Adjustment
{{multiplicity_strategy}}

<!-- node
id: intercurrent-events-impact
parent: general-considerations
title: Impact of Intercurrent Event Strategies
required: false
repeatable: false
estimand_linked: true
ich_refs: [E9(R1)]
source: coretee
purpose: Summarise how each ICE strategy (treatment policy, hypothetical, composite, while-on-treatment, principal stratum) is operationalised in analysis.
produces: definition
placeholders: [{{ice_strategy_impact}}]
-->
### 7.6 Impact of Intercurrent Event Strategies
{{ice_strategy_impact}}

<!-- node
id: multicentre
parent: general-considerations
title: Multi-centre Studies
required: false
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.7.1, E3 §11.4.2.4, E9 §3.2]
source: veramed
purpose: Centre pooling rules, treatment-by-centre interaction tests, and centre-adjusted comparisons (exploratory unless powered).
produces: prose
placeholders: [{{multicentre_methods}}]
-->
### 7.7 Multi-centre Studies
{{multicentre_methods}}

---

<!-- node
id: interim-analyses
parent: null
title: Interim Analyses and Data Monitoring
required: false
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.7.1, E3 §11.4.2.3, E9 §4.1, "FDA 2010 Adaptive Design Guidance"]
source: veramed
purpose: Container for interim analysis specification and bias control.
produces: none
placeholders: []
-->
## 8. Interim Analyses and Data Monitoring

<!-- node id: ia-purpose | parent: interim-analyses | required: false | produces: prose | placeholders: [{{ia_purpose}}] -->
### 8.1 Purpose of Interim Analyses — {{ia_purpose}}
<!-- node id: ia-schedule | parent: interim-analyses | required: false | produces: prose | placeholders: [{{ia_schedule}}] -->
### 8.2 Planned Schedule — {{ia_schedule}}
<!-- node id: ia-adaptations | parent: interim-analyses | required: false | produces: prose | placeholders: [{{ia_adaptations}}] -->
### 8.3 Scope of Adaptations — {{ia_adaptations}}
<!-- node id: ia-stopping-rules | parent: interim-analyses | required: false | produces: definition | placeholders: [{{stopping_rules}}] -->
### 8.4 Stopping Rules — {{stopping_rules}}
<!-- node id: ia-bias-methods | parent: interim-analyses | required: false | produces: prose | placeholders: [{{ia_bias_methods}}] -->
### 8.5 Analysis Methods to Minimise Bias — {{ia_bias_methods}}
<!-- node id: ia-ci-pvalue-adjust | parent: interim-analyses | required: false | produces: definition | placeholders: [{{alpha_spending}}] -->
### 8.6 Adjustment of CIs and p-values — {{alpha_spending}}
<!-- node id: ia-ssr | parent: interim-analyses | required: false | produces: definition | placeholders: [{{sample_size_reestimation}}] -->
### 8.7 Interim Analysis for Sample Size Adjustment — {{sample_size_reestimation}}
<!-- node id: ia-practical-bias | parent: interim-analyses | required: false | produces: definition | placeholders: [{{access_control}}] -->
### 8.8 Practical Measures to Minimise Bias — {{access_control}}
<!-- node id: ia-documentation | parent: interim-analyses | required: false | produces: prose | placeholders: [{{ia_documentation}}] -->
### 8.9 Documentation of Interim Analyses — {{ia_documentation}}

---

<!-- node
id: sample-size
parent: null
title: Sample Size Determination
required: true
repeatable: false
estimand_linked: false
ich_refs: [E3 §9.7.2, E9 §3.5]
source: both
purpose: Reproduce protocol sample-size justification; document any in-study amendments.
produces: prose
placeholders: [{{sample_size}}]
-->
## 9. Sample Size Determination
{{sample_size}}

---

<!-- node
id: summary-of-study-data
parent: null
title: Summary of Study Data
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: Define global presentation conventions (ordering, table column order, descriptive statistics, analysis populations) then per-domain summaries.
produces: definition
placeholders: [{{descriptive_stats_continuous}}, {{descriptive_stats_categorical}}, {{column_order}}, {{listing_sort_order}}]
-->
## 10. Summary of Study Data

Continuous: {{descriptive_stats_continuous}} (default n, mean, SD, median, min, max).
Categorical: {{descriptive_stats_categorical}} (default frequency and % of non-missing).
Column order: {{column_order}}. Listing sort: {{listing_sort_order}}.

<!-- node id: subject-disposition | parent: summary-of-study-data | required: true | produces: tfl_shell | placeholders: [{{disposition}}] -->
### 10.1 Subject Disposition — {{disposition}} (incl. CONSORT skeleton)
<!-- node id: protocol-deviations | parent: summary-of-study-data | required: true | produces: definition | placeholders: [{{deviation_definitions}}] -->
### 10.2 Protocol Deviations — {{deviation_definitions}} (define major deviations; which exclude data from which set)
<!-- node id: demographics-baseline | parent: summary-of-study-data | required: true | produces: definition | placeholders: [{{demographics}}] -->
### 10.3 Demographic and Baseline Variables — {{demographics}}
<!-- node id: medical-history | parent: summary-of-study-data | required: false | produces: definition | placeholders: [{{coding_dictionary_meddra}}] -->
### 10.4 Concurrent Illnesses and Medical Conditions — coded with {{coding_dictionary_meddra}}
<!-- node id: prior-conmeds | parent: summary-of-study-data | required: false | produces: definition | placeholders: [{{coding_dictionary_whodd}}, {{prior_conmed_definitions}}] -->
### 10.5 Prior and Concomitant Medications — coded with {{coding_dictionary_whodd}}; {{prior_conmed_definitions}}
<!-- node id: treatment-compliance | parent: summary-of-study-data | required: false | produces: definition | placeholders: [{{compliance_calc}}] -->
### 10.6 Treatment Compliance — {{compliance_calc}}

---

<!-- node
id: efficacy-analyses
parent: null
title: Efficacy Analyses
required: true
repeatable: false
estimand_linked: true
ich_refs: []
source: both
purpose: Container; general efficacy methods plus per-objective analysis nodes. Mirrors objective ordering in section objectives-endpoints-estimands.
produces: none
placeholders: [{{efficacy_general_methods}}]
-->
## 11. Efficacy Analyses
General methods: {{efficacy_general_methods}}.

<!-- node
id: primary-efficacy
parent: efficacy-analyses
title: Primary Efficacy Analysis
required: true
repeatable: false
estimand_linked: true
ich_refs: []
source: both
purpose: Single primary analysis of the primary endpoint/estimand with its sensitivity and subgroup analyses.
produces: definition
placeholders: []
-->
### 11.1 Primary Efficacy Analysis
<!-- node id: primary-endpoint-definition | parent: primary-efficacy | required: true | produces: definition | placeholders: [{{primary_endpoint_definition}}] -->
#### 11.1.1 Definition of Endpoint(s) — {{primary_endpoint_definition}}
<!-- node id: primary-main-approach | parent: primary-efficacy | required: true | estimand_linked: true | produces: definition | placeholders: [{{primary_dataset}}, {{primary_model}}, {{primary_estimates}}, {{primary_ice_handling}}, {{primary_missing_handling}}, {{primary_model_checks}}] -->
#### 11.1.2 Main Analytical Approach — dataset {{primary_dataset}}; model {{primary_model}}; estimates {{primary_estimates}}; ICE handling {{primary_ice_handling}}; missing {{primary_missing_handling}}; checks {{primary_model_checks}}
<!-- node id: primary-sensitivity | parent: primary-efficacy | required: false | produces: definition | placeholders: [{{primary_sensitivity}}] -->
#### 11.1.3 Sensitivity Analyses — {{primary_sensitivity}}
<!-- node id: primary-supplementary | parent: primary-efficacy | required: false | produces: definition | placeholders: [{{primary_supplementary}}] -->
#### 11.1.4 Supplementary Analyses — {{primary_supplementary}}
<!-- node id: primary-subgroup | parent: primary-efficacy | required: false | produces: definition | placeholders: [{{primary_subgroup}}] -->
#### 11.1.5 Subgroup Analyses — {{primary_subgroup}}

<!-- node
id: secondary-efficacy
parent: efficacy-analyses
title: Secondary Efficacy Analyses
required: false
repeatable: true
estimand_linked: true
ich_refs: []
source: both
purpose: One instance per secondary objective; distinguish key/confirmatory vs supportive secondary endpoints/estimands.
produces: definition
placeholders: [{{secondary_label}}, {{secondary_endpoint_definition}}, {{secondary_main_approach}}, {{secondary_sensitivity}}, {{secondary_supplementary}}]
-->
### 11.2 Secondary Efficacy Analyses — {{secondary_label}}
Definition: {{secondary_endpoint_definition}}; Approach: {{secondary_main_approach}}; Sensitivity: {{secondary_sensitivity}}; Supplementary: {{secondary_supplementary}}.

<!-- node
id: exploratory-efficacy
parent: efficacy-analyses
title: Exploratory Efficacy Analyses
required: false
repeatable: true
estimand_linked: false
ich_refs: []
source: both
purpose: Hypothesis-generating analyses; present CIs over p-values.
produces: definition
placeholders: [{{exploratory_efficacy}}]
-->
### 11.3 Exploratory Efficacy Analyses — {{exploratory_efficacy}}

---

<!-- node
id: safety-analyses
parent: null
title: Safety Analyses
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: both
purpose: Container; general safety conventions (incl. repeat-event counting rule) plus per-domain nodes.
produces: definition
placeholders: [{{safety_general_methods}}, {{repeat_event_rule}}]
-->
## 12. Safety Analyses
General methods: {{safety_general_methods}}. Repeat-event counting: {{repeat_event_rule}}.

<!-- node id: extent-of-exposure | parent: safety-analyses | required: true | produces: definition | placeholders: [{{exposure_calc}}] -->
### 12.1 Extent of Exposure — {{exposure_calc}}
<!-- node id: adverse-events | parent: safety-analyses | required: true | produces: definition | placeholders: [{{teae_definition}}, {{ae_coding}}, {{ae_summaries}}] -->
### 12.2 Adverse Events — TEAE def {{teae_definition}}; coding {{ae_coding}}; summaries {{ae_summaries}}
<!-- node id: deaths-saes | parent: safety-analyses | required: true | produces: definition | placeholders: [{{deaths_saes}}] -->
### 12.3 Deaths, SAEs and Other Significant AEs — {{deaths_saes}}
<!-- node id: pregnancies | parent: safety-analyses | required: false | produces: prose | placeholders: [{{pregnancies}}] -->
### 12.4 Pregnancies — {{pregnancies}}
<!-- node id: laboratory | parent: safety-analyses | required: false | produces: definition | placeholders: [{{lab_evaluations}}, {{shift_tables}}] -->
### 12.5 Clinical Laboratory Evaluations — {{lab_evaluations}}; shift tables {{shift_tables}}
<!-- node id: other-safety | parent: safety-analyses | required: false | produces: definition | placeholders: [{{vital_signs}}, {{ecg}}] -->
### 12.6 Other Safety Measures (Vital Signs, ECG, etc.) — {{vital_signs}}; {{ecg}}

---

<!-- node
id: pharmacokinetics
parent: null
title: Pharmacokinetics
required: false
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: PK/PD parameters and summary/analysis approach; PD here only if not treated as efficacy.
produces: definition
placeholders: [{{pk_parameters}}, {{pk_methods}}]
-->
## 13. Pharmacokinetics
Parameters: {{pk_parameters}}. Methods: {{pk_methods}}.

---

<!-- node
id: other-analyses
parent: null
title: Other Analyses
required: false
repeatable: true
estimand_linked: false
ich_refs: []
source: both
purpose: Analyses not fitting prior sections (health economics, QoL, patient satisfaction). Rename heading appropriately.
produces: definition
placeholders: [{{other_analyses}}]
-->
## 14. Other Analyses
{{other_analyses}}

---

<!-- node
id: reporting-conventions
parent: null
title: Reporting Conventions
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: Numeric precision rules for percentages, descriptive statistics, p-values and estimated parameters.
produces: definition
placeholders: [{{percentage_rules}}, {{descriptive_precision}}, {{pvalue_precision}}, {{parameter_precision}}]
-->
## 15. Reporting Conventions
Percentages: {{percentage_rules}} (default 1 dp; 0 shown blank; all-meet shown as 100).
Descriptive: {{descriptive_precision}} (mean/median +1 dp; SD +2 dp vs raw).
p-values: {{pvalue_precision}} (≥0.001 to 3 dp; else "<0.001").
Estimated parameters: {{parameter_precision}} (3 sig figs).

---

<!-- node
id: technical-details
parent: null
title: Technical Details
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: Software/versions, data standards (ADaM), QC seed policy and tolerance for resampling methods.
produces: definition
placeholders: [{{software}}, {{data_standards}}, {{qc_tolerance}}]
-->
## 16. Technical Details
Software: {{software}} (default SAS 9.2+ / R 2.10.1+). Data standards: {{data_standards}} (default ADaM).
QC seed/tolerance policy: {{qc_tolerance}}.

---

<!-- node
id: changes-to-protocol
parent: null
title: Changes to Protocol-planned Analyses
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: both
purpose: Summarise and justify any deviations from protocol-specified analyses (statistical and material non-statistical).
produces: prose
placeholders: [{{changes_to_protocol}}]
-->
## 17. Changes to Protocol-planned Analyses
{{changes_to_protocol}}

---

<!-- node
id: references
parent: null
title: References
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: both
purpose: Citations referenced in the SAP body.
produces: prose
placeholders: [{{references}}]
-->
## 18. References
{{references}}

---

<!-- node
id: supporting-documentation
parent: null
title: Supporting Documentation
required: false
repeatable: false
estimand_linked: false
ich_refs: []
source: coretee
purpose: Pointers to related documents (DMC charter, randomisation spec, ADaM specs).
produces: prose
placeholders: [{{supporting_documentation}}]
-->
## 19. Supporting Documentation
{{supporting_documentation}}

---

<!-- node
id: sap-amendments
parent: null
title: Amendment(s) to the SAP
required: false
repeatable: true
estimand_linked: false
ich_refs: []
source: veramed
purpose: One instance per amendment; rationale, global changes, and specific before/after changes.
produces: definition
placeholders: [{{amendment_number}}, {{amendment_rationale}}, {{global_changes}}, {{specific_changes}}]
-->
## 20. Amendment(s) to the SAP — Amendment {{amendment_number}}
Rationale: {{amendment_rationale}}. Global changes: {{global_changes}}. Specific changes (old → new): {{specific_changes}}.

---

<!-- node
id: tfl-appendix
parent: null
title: Appendix 1 — List of Tables, Figures and Listings
required: true
repeatable: false
estimand_linked: false
ich_refs: []
source: veramed
purpose: Enumerate all TFL outputs with CSR numbering, analysis set, and deliverable flags; grouped by data domain then output type.
produces: tfl_shell
placeholders: [{{tfl_rows}}]
-->
## 21. Appendix 1 — List of Tables, Figures and Listings

Use CSR numbering unless the client requests otherwise. Group by domain (Study Population, Efficacy, Safety, PK, PK/PD) then by output type (Tables, Figures, Listings).

| Number | Title | Output Type | Analysis Set | Linked Endpoint/Estimand | Deliverable (CSR / Interim / DMC) | Programming Notes |
|---|---|---|---|---|---|---|
| 14.1.1.1 | Summary of Disposition | Table | FAS | — | CSR; DMC | — |
| {{tfl_rows}} | | | | | | |

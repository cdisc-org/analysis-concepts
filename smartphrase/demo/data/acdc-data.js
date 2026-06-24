/*
 * Shared AC/DC model fragment backing the smartphrase demos (hover / resolve / trace).
 * Single source of truth — loaded via <script src> so the demos run from file:// with no
 * server (a fetch() of local JSON is blocked by the file:// CORS policy; a <script> is not).
 *
 * data/cdisc-pilot-acdc.json is a pure-data export of this same object (generated from it),
 * kept in sync for tooling that wants JSON rather than JS.
 *
 * Scope: CDISC Pilot (CDISCPILOT01) primary efficacy analysis. Smartphrase + role
 * definitions reproduced from ACDC_Transformation_Library v0.6.0. Identifiers ground in
 * USDM / ARS / STATO / AC-DC LinkML IRIs; those marked iri_status:"illustrative" are
 * plausible placeholders pending the authoritative mapping.
 */
window.ACDC = {
  meta: {
    study: "CDISCPILOT01",
    title: "CDISC Pilot Study — Safety and Efficacy of Xanomeline in Alzheimer's Disease",
    source_library: "ACDC_Transformation_Library v0.6.0"
  },

  prefixes: {
    acdc:  "https://w3id.org/cdisc/ac-dc/",
    usdm:  "https://ddf.cdisc.org/usdm/v3/",
    ars:   "https://www.cdisc.org/standards/foundational/ars/1-0/",
    stato: "http://purl.obolibrary.org/obo/",
    ncit:  "http://purl.obolibrary.org/obo/NCIT_",
    qb:    "http://purl.org/linked-data/cube#"
  },

  roleOrder: ["endpoint", "parameter", "timepoint", "population", "grouping", "method", "method_qualifier", "covariate"],

  smartPhrases: {
    SP_CFB_ENDPOINT: { role: "endpoint", name: "Change from baseline endpoint",
      phrase_template: "change from baseline in {parameter}",
      placeholders: [{ name: "parameter", kind: "concept_ref", render_options: ["short", "long", "long_with_short"], default_render: "long_with_short" }] },
    SP_TIMEPOINT: { role: "timepoint", name: "Analysis timepoint",
      phrase_template: "at {visit}",
      placeholders: [{ name: "visit", kind: "concept_ref", render_options: ["short", "long"], default_render: "short" }] },
    SP_POPULATION: { role: "population", name: "Analysis population",
      phrase_template: "in the {population} population",
      placeholders: [{ name: "population", kind: "concept_ref", render_options: ["short", "long"], default_render: "long" }] },
    SP_GROUPING: { role: "grouping", name: "Treatment-group comparison",
      phrase_template: "comparing {treatment} groups",
      placeholders: [{ name: "treatment", kind: "concept_ref", render_options: ["short", "long"], default_render: "short" }] },
    SP_METHOD_ANCOVA: { role: "method", name: "ANCOVA method",
      phrase_template: "using {method}",
      placeholders: [{ name: "method", kind: "concept_ref", render_options: ["short", "long"], default_render: "short" }] },
    SP_CONFIDENCE_LEVEL: { role: "method_qualifier", name: "Confidence level",
      phrase_template: "with {conf_level}% confidence intervals",
      placeholders: [{ name: "conf_level", kind: "literal", render_options: ["short"], default_render: "short" }] },
    SP_COVARIATE_BASELINE: { role: "covariate", name: "Baseline covariate adjustment",
      phrase_template: "adjusting for baseline {parameter}",
      placeholders: [{ name: "parameter", kind: "concept_ref", render_options: ["short", "long"], default_render: "short" }] },
    SP_COVARIATE_SITE: { role: "covariate", name: "Site covariate adjustment",
      phrase_template: "adjusting for site", placeholders: [] }
  },

  concepts: {
    "PARAM.ADASCOG11": { kind: "Parameter", short: "ADAS-Cog(11)", long: "Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)", iri: "ncit:C168804", iri_status: "illustrative", conceptClass: "SharedDimension" },
    "PARAM.CIBIC":     { kind: "Parameter", short: "CIBIC+", long: "Clinician's Interview-Based Impression of Change (plus caregiver input)", iri: "ncit:C168805", iri_status: "illustrative", conceptClass: "SharedDimension" },
    "VISIT.WK24": { kind: "Timepoint", short: "Week 24", long: "Week 24 (end of double-blind treatment period)", iri: "usdm:ScheduledActivityInstance/SAI-WK24", iri_status: "illustrative" },
    "VISIT.WK8":  { kind: "Timepoint", short: "Week 8", long: "Week 8", iri: "usdm:ScheduledActivityInstance/SAI-WK8", iri_status: "illustrative" },
    "POP.EFFICACY": { kind: "Population", short: "ITT", long: "efficacy (intent-to-treat)", iri: "usdm:AnalysisPopulation/POP-EFF", iri_status: "illustrative", usdm_type: "usdm:AnalysisPopulation" },
    "POP.SAFETY":   { kind: "Population", short: "SAF", long: "safety", iri: "usdm:AnalysisPopulation/POP-SAF", iri_status: "illustrative", usdm_type: "usdm:AnalysisPopulation" },
    "POP.PP":       { kind: "Population", short: "PP", long: "per-protocol", iri: "usdm:AnalysisPopulation/POP-PP", iri_status: "illustrative", usdm_type: "usdm:AnalysisPopulation" },
    "TRT.ALL": { kind: "Grouping", short: "treatment", long: "Placebo, Xanomeline Low Dose and Xanomeline High Dose", iri: "usdm:StudyArm/ARM-SET-ALL", iri_status: "illustrative" },
    "M.ANCOVA": { kind: "Method", short: "ANCOVA", long: "analysis of covariance", formula: "CHG ~ TRTP + BASE + SITEGR1", iri: "stato:STATO_0000176", iri_status: "illustrative", ars_type: "ars:AnalysisMethod", ars_id: "ars:method/MTH-ANCOVA-CFB" },
    "M.MMRM":   { kind: "Method", short: "MMRM", long: "mixed model for repeated measures", formula: "CHG ~ TRTP + BASE + AVISIT + TRTP*AVISIT", iri: "stato:STATO_0000466", iri_status: "illustrative", ars_type: "ars:AnalysisMethod", ars_id: "ars:method/MTH-MMRM-CFB" }
  },

  analyses: {
    "AC.PRIMARY.ADASCOG": {
      type: "primary",
      label: "Primary efficacy analysis — change from baseline in ADAS-Cog(11) at Week 24",
      template: "T.CFB_ANCOVA",
      acCategory: "TreatmentComparison",
      usesMethod: "M.ANCOVA",
      usdm_objective: "usdm:Objective/OBJ-PRIM-1",
      ars_analysis: "ars:analysis/AN-PRIM-ADASCOG-WK24",
      iri: "acdc:instance/AC-PRIMARY-ADASCOG",
      trailing_prose: "will be assessed as the primary analysis.",
      sentence: [
        { sp: "SP_CFB_ENDPOINT",      bindings: { parameter:  { conceptId: "PARAM.ADASCOG11", render: "long_with_short" } }, enabled: true, trace: "endpoint" },
        { sp: "SP_TIMEPOINT",         bindings: { visit:      { conceptId: "VISIT.WK24",     render: "short" } }, enabled: true, trace: "timepoint" },
        { sp: "SP_POPULATION",        bindings: { population: { conceptId: "POP.EFFICACY",   render: "long" } }, enabled: true, trace: "population" },
        { sp: "SP_GROUPING",          bindings: { treatment:  { conceptId: "TRT.ALL",        render: "short" } }, enabled: true, trace: "grouping" },
        { sp: "SP_METHOD_ANCOVA",     bindings: { method:     { conceptId: "M.ANCOVA",       render: "short" } }, enabled: true },
        { sp: "SP_CONFIDENCE_LEVEL",  bindings: { conf_level: { value: "95" } }, enabled: true },
        { sp: "SP_COVARIATE_BASELINE",bindings: { parameter:  { conceptId: "PARAM.ADASCOG11", render: "short" } }, enabled: true, trace: "covariate_baseline" },
        { sp: "SP_COVARIATE_SITE",    bindings: {}, enabled: false }
      ]
    }
  },

  /*
   * Data-layer provenance for the trace demo.
   * Each chain follows: DataConcept -> ADaM Class Variable -> study variable -> physical dataset.
   * Keyed by the `trace` tag on a sentence phrase.
   */
  trace: {
    endpoint: {
      label: "Change from baseline in ADAS-Cog(11)",
      chain: [
        { tier: "DataConcept", id: "DC.CHG", label: "Change from Baseline", iri: "acdc:dc/ChangeFromBaseline", note: "Derived analysis value: post-baseline value minus baseline value." },
        { tier: "ADaM Class Variable", id: "CHG", label: "Change from Baseline (W)", dataStructure: "BDS", note: "Basic Data Structure analysis variable." },
        { tier: "Study variable", id: "ADQSADAS.CHG", label: "CHG in ADQSADAS", whereClause: "PARAMCD = 'ACTOT' AND AVISITN = 24", note: "ADAS-Cog(11) total score, Week 24 record." },
        { tier: "Physical dataset", id: "ADQSADAS", label: "ADaM ADAS-Cog analysis dataset", file: "adqsadas.xpt", keys: ["USUBJID", "PARAMCD", "AVISIT"], note: "One record per subject per parameter per analysis visit." }
      ]
    },
    covariate_baseline: {
      label: "Baseline ADAS-Cog(11) (model covariate)",
      chain: [
        { tier: "DataConcept", id: "DC.BASE", label: "Baseline Value", iri: "acdc:dc/BaselineValue", note: "Reference value captured at or before first dose." },
        { tier: "ADaM Class Variable", id: "BASE", label: "Baseline Value", dataStructure: "BDS" },
        { tier: "Study variable", id: "ADQSADAS.BASE", label: "BASE in ADQSADAS", whereClause: "PARAMCD = 'ACTOT'", note: "Baseline ADAS-Cog(11) total score." },
        { tier: "Physical dataset", id: "ADQSADAS", label: "ADaM ADAS-Cog analysis dataset", file: "adqsadas.xpt", keys: ["USUBJID", "PARAMCD", "AVISIT"] }
      ]
    },
    timepoint: {
      label: "Analysis visit (Week 24)",
      chain: [
        { tier: "DataConcept", id: "DC.AVISIT", label: "Analysis Visit", iri: "acdc:dc/AnalysisVisit" },
        { tier: "ADaM Class Variable", id: "AVISIT", label: "Analysis Visit", dataStructure: "BDS", note: "Paired with numeric AVISITN for sorting." },
        { tier: "Study variable", id: "ADQSADAS.AVISIT", label: "AVISIT in ADQSADAS", whereClause: "AVISITN = 24", note: "Decodes to 'Week 24'." },
        { tier: "Physical dataset", id: "ADQSADAS", label: "ADaM ADAS-Cog analysis dataset", file: "adqsadas.xpt", keys: ["USUBJID", "PARAMCD", "AVISIT"] }
      ]
    },
    grouping: {
      label: "Treatment groups (planned treatment)",
      chain: [
        { tier: "DataConcept", id: "DC.TRT", label: "Planned Treatment", iri: "acdc:dc/PlannedTreatment", usdm: "usdm:StudyArm" },
        { tier: "ADaM Class Variable", id: "TRTP", label: "Planned Treatment", dataStructure: "ADSL", note: "Subject-level treatment assignment." },
        { tier: "Study variable", id: "ADSL.TRTP", label: "TRTP in ADSL", note: "Placebo / Xanomeline Low Dose / Xanomeline High Dose." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset", file: "adsl.xpt", keys: ["USUBJID"], note: "One record per subject." }
      ]
    },
    population: {
      label: "Efficacy (ITT) population flag",
      chain: [
        { tier: "DataConcept", id: "DC.POP", label: "Analysis Population", iri: "acdc:dc/AnalysisPopulation", usdm: "usdm:AnalysisPopulation" },
        { tier: "ADaM Class Variable", id: "ITTFL", label: "Intent-To-Treat Population Flag", dataStructure: "ADSL", note: "Population indicator variable." },
        { tier: "Study variable", id: "ADSL.ITTFL", label: "ITTFL in ADSL", whereClause: "ITTFL = 'Y'", note: "Subjects in the efficacy analysis set." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset", file: "adsl.xpt", keys: ["USUBJID"] }
      ]
    }
  }
};

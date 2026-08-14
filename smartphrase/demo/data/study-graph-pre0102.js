/*
 * Study-level graph — PrECOG PrE0102 (metastatic breast cancer).
 *
 * Second worked study for the smartphrase demo. Source document:
 * smartphrase/SAP/ (PrE0102 Final SAP, 24 March 2014). Prose encoded here is
 * the PFS primary analysis: SAP sections 3.1 (primary objective), 5.3 (efficacy
 * measurement definitions) and 7.7.2 (PFS/TTP/OS methodology).
 *
 * This is the ILLUSTRATIVE layer, same policy as the CDISC Pilot graph: ground
 * into existing standards where a term covers the entity, flag everything else
 * iri_status: "illustrative". The library layer is NOT defined here.
 *
 * Note the analysis is DESCRIPTIVE — SAP 7.7.2 asks for Kaplan-Meier medians
 * with 90% confidence intervals by arm. There is no log-rank test, no p-value
 * and no alpha anywhere in the 36-page source document.
 *
 * Event `name` values are deliberately bare event phrases, because
 * SP_TTE_ENDPOINT renders as "time to {event}" — so the name must complete
 * that sentence, not restate the endpoint.
 */
(function (g) {
  g.STUDY_GRAPHS = g.STUDY_GRAPHS || {};
  g.STUDY_GRAPHS.PRE0102 = {

    prefixes: {
      acdc:  "https://w3id.org/cdisc/ac-dc/",
      usdm:  "https://ddf.cdisc.org/usdm/v4/",
      ars:   "https://www.cdisc.org/standards/foundational/ars/1-0/",
      stato: "http://purl.obolibrary.org/obo/",
      ncit:  "http://purl.obolibrary.org/obo/NCIT_",
      qb:    "http://purl.org/linked-data/cube#"
    },

    study: {
      studyId: "PRE0102",
      title: "Randomized, Double-Blind, Placebo-Controlled Phase II Trial of Fulvestrant (Faslodex) plus Everolimus in Post-Menopausal Patients with Hormone-Receptor Positive Metastatic Breast Cancer Resistant to Aromatase Inhibitor Therapy",
      iri: "usdm:Study/PRE0102", iri_status: "illustrative",
      sapSource: "smartphrase/SAP/ — PrE0102 Final SAP, 24 March 2014"
    },

    concepts: {
      /* Event-kind concepts — required by SP_TTE_ENDPOINT's
         concept_constraint: "Event". First use of this kind in the demo. */
      "EVENT.PFS": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "PFS",
        name: "disease progression or death",
        iri: "ncit:C18215", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "PFS",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'the duration of time from time of randomization to time of progression or death, whichever occurs first'"
      },
      "EVENT.OS": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "OS", name: "death from any cause",
        iri: "ncit:C16952", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "OS",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'the time from randomization until death or censored at the date of last follow-up'"
      },
      "EVENT.TTP": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "TTP", name: "disease progression",
        iri: "acdc:event/TimeToProgression", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "TTP",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRef: "SAP 5.3 — 'the time from randomization until progression of the disease'"
      },

      "POP.EVAL_EFFICACY": {
        kind: "Population",
        label: "EFF", name: "eligible, treated",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-EFF", iri_status: "illustrative",
        data: { flag: "EFFIFL" },
        sapRef: "SAP 7.2 — 'Evaluable for efficacy: The primary efficacy analysis will be done including eligible, treated subjects.'"
      },
      "POP.ITT": {
        kind: "Population",
        label: "ITT", name: "intent-to-treat",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-ITT", iri_status: "illustrative",
        data: { flag: "ITTFL" },
        sapRef: "SAP 7.2 — 'Intent-to-treat (ITT) analysis population includes all subjects as randomized.'"
      },

      /*
       * A REAL intercurrent event, from the source SAP — contrast the CDISC
       * Pilot's illustrative pair. The SAP's handling is an explicit
       * TreatmentPolicy: subjects who stop protocol therapy are still followed
       * for progression, so the event is not permitted to change what is
       * measured. That is stated in prose in the source document, which is
       * exactly the claim this layer makes machine-readable.
       *
       * implementedBy carries TreatmentPolicy only: an empty list, because data
       * are used as observed. Hypothetical is deliberately absent — no
       * imputation or censoring derivation exists here to implement it, so
       * asserting it would be prose the model cannot honour.
       */
      "ICE.TOX_DISCONT": {
        kind: "IntercurrentEvent",
        label: "everolimus discontinuation",
        name: "discontinuation of everolimus for suspected toxicity",
        iri: "usdm:IntercurrentEvent/PRE0102-ICE-TOXDISC", iri_status: "illustrative",
        icheStrategy: "TreatmentPolicy",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_DS_001/Disposition Event",
                       operator: "equals",
                       responseCode: "Adverse Event" }]
        },
        implementedBy: { TreatmentPolicy: [] },
        data: { dataset: "ADSL", file: "adsl.xpt", flag: "DCTREAS",
                datasetLabel: "Subject-Level Analysis Dataset",
                timing: "TRTEDT", bc: "BC_DS_001", property: "Disposition Event" },
        sapRef: "SAP 4.3 — 'Subjects who discontinue everolimus/placebo because of suspected everolimus-associated toxicity should continue treatment with fulvestrant alone until disease progression'; handled by treatment policy per SAP 4.3 — 'All subjects who have discontinued protocol therapy will be followed for survival and for progression, even if protocol therapy was discontinued because of toxicity or for other reasons.'"
      },

      "TRT.PRE0102": {
        kind: "Treatment",
        label: "treatment",
        name: "fulvestrant plus everolimus and fulvestrant plus placebo",
        iri: "usdm:StudyArm/PRE0102-ARM-SET", iri_status: "illustrative",
        data: { variable: "TRTP" },
        sapRef: "SAP 4.1 — randomized 1:1 to everolimus or placebo, both with fulvestrant"
      }
    },

    methodGrounding: {
      /*
       * No STATO term for Kaplan-Meier estimation was found in the AC/DC
       * artefacts, and M_KaplanMeier.json carries "ncitCode": null upstream.
       * Rather than guess a STATO id, this grounds in an AC/DC identifier and
       * is flagged illustrative — an open question for the working group.
       * Contrast M.ANCOVA, which grounds authoritatively in STATO_0000176.
       */
      "M.KaplanMeier": {
        label: "Kaplan-Meier", name: "Kaplan-Meier estimation",
        iri: "acdc:method/KaplanMeier", iri_status: "illustrative",
        ars: "ars:method/MTH-KM-TTE", ars_status: "illustrative"
      }
    },

    /*
     * Four instances, ONE template (T.PFS_KaplanMeier). Within-study reuse:
     * the endpoint event varies (PFS / OS / TTP) and the population varies
     * (the SAP's own ITT sensitivity analysis). Cross-study reuse: this study
     * and the CDISC Pilot share one library, different templates.
     */
    instances: [
      {
        id: "AC.PRIMARY.PFS",
        iri: "acdc:instance/PRE0102-AC-PRIMARY-PFS",
        label: "Primary efficacy analysis — PFS",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To assess progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-PFS", iri_status: "illustrative" },
        /* Primary estimand, per SAP 3.1 (objective) and 7.7.2 (methodology).
           See DESIGN.md D15 on why sentenceRole is kept beside analysisRole. */
        estimand: {
          id: "EST.PFS",
          iri: "usdm:Estimand/PRE0102-EST-PFS", iri_status: "illustrative",
          label: "Primary estimand — progression-free survival (SAP 3.1, 7.7.2)",
          rank: "primary"
        },
        analysisRole: "MainEstimator",
        sentenceRole: "the primary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } },
          { phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.TOX_DISCONT", render: "name" } } },
          { phrase: "SP_SUMMARY_MEASURE",      bindings: { summary: { output: "median_survival" } } }
        ]
      },
      {
        id: "AC.SENS.PFS.ITT",
        iri: "acdc:instance/PRE0102-AC-SENS-PFS-ITT",
        label: "Sensitivity analysis — PFS, ITT population",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To assess progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-PFS-ITT", iri_status: "illustrative" },
        /* The SAME estimand as the primary — the SAP's own sensitivity analysis
           (7.7.2: "As a sensitivity analysis, all of the above analyses ... will
           be repeated for the as-randomized population"). Source-grounded, and
           it is what makes the one-MainEstimator check meaningful. */
        estimand: {
          id: "EST.PFS",
          iri: "usdm:Estimand/PRE0102-EST-PFS", iri_status: "illustrative",
          label: "Primary estimand — progression-free survival (SAP 3.1, 7.7.2)",
          rank: "primary"
        },
        analysisRole: "SensitivityAnalysis",
        sentenceRole: "a sensitivity analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.ITT", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } },
          { phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.TOX_DISCONT", render: "name" } } },
          { phrase: "SP_SUMMARY_MEASURE",      bindings: { summary: { output: "median_survival" } } }
        ]
      },
      {
        id: "AC.SEC.OS",
        iri: "acdc:instance/PRE0102-AC-SEC-OS",
        label: "Secondary analysis — overall survival",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-SECONDARY-1", iri_status: "illustrative",
          text: "To describe the safety profile, objective response rate, time to progression and overall survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-OS", iri_status: "illustrative" },
        estimand: {
          id: "EST.OS",
          iri: "usdm:Estimand/PRE0102-EST-OS", iri_status: "illustrative",
          label: "Secondary estimand — overall survival (SAP 3.2, 7.7.2)",
          rank: "secondary"
        },
        analysisRole: "MainEstimator",
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.OS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } },
          { phrase: "SP_SUMMARY_MEASURE",      bindings: { summary: { output: "median_survival" } } }
        ]
      },
      {
        id: "AC.SEC.TTP",
        iri: "acdc:instance/PRE0102-AC-SEC-TTP",
        label: "Secondary analysis — time to progression",
        template: "T.PFS_KaplanMeier",
        usdmObjective: {
          iri: "usdm:Objective/PRE0102-OBJ-SECONDARY-1", iri_status: "illustrative",
          text: "To describe the safety profile, objective response rate, time to progression and overall survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone."
        },
        arsAnalysis: { iri: "ars:analysis/PRE0102-AN-7.07.02-TTP", iri_status: "illustrative" },
        estimand: {
          id: "EST.TTP",
          iri: "usdm:Estimand/PRE0102-EST-TTP", iri_status: "illustrative",
          label: "Secondary estimand — time to progression (SAP 3.2, 7.7.2)",
          rank: "secondary"
        },
        analysisRole: "MainEstimator",
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.TTP", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } } },
          { phrase: "SP_SUMMARY_MEASURE",      bindings: { summary: { output: "median_survival" } } }
        ]
      }
    ],

    /*
     * Trace tiers. Keyed by phrase role, same as the CDISC Pilot graph — but
     * the endpoint chain is time-to-event shaped: no analysis visit, and the
     * censoring flag travels with the analysis value.
     */
    traceTemplates: {
      /* The ICE axis — same shape as the Pilot's: it descends through the
         ascertainment criterion, not an ADaM class variable, because the fact
         being traced is per-subject occurrence and timing. */
      ice_handling: [
        { tier: "Occurrence criterion", id: "{bc}/{property}", label: "{iceName}",
          iri: "usdm:Condition", iri_status: "illustrative",
          whereClause: "{criterion}",
          note: "Executable USDM Condition entering the BC ▸ property ▸ code path; the source Biomedical Concept is the path head, named once." },
        { tier: "Ascertained fact", id: "(occurred, when)", label: "Per-subject occurrence",
          note: "A boolean indicator plus a Timing, per subject. Strategy-independent — the same ascertainment serves every estimand that declares this event." },
        { tier: "Study variable", id: "{dataset}.{flag}", label: "{flag} in {dataset}",
          whereClause: "{flag} indicates toxicity",
          note: "Reason off treatment; timing in {dataset}.{timing}." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID"], note: "One record per subject." }
      ],
      endpoint: [
        { tier: "DataConcept", id: "DC.TTE", label: "Time to Event",
          iri: "acdc:dc/TimeToEvent", iri_status: "illustrative",
          note: "Elapsed time from the time-origin (randomization) to the event or to censoring. Paired with an event/censoring indicator." },
        { tier: "ADaM Class Variable", id: "{aval}", label: "Analysis Value (time to event)",
          dataStructure: "BDS (time-to-event)",
          note: "Time-to-event analysis value; {cnsr} carries the censoring indicator (0 = event, 1 = censored), ADaMIG v1.3." },
        { tier: "Study variable", id: "{dataset}.{aval}", label: "{aval} in {dataset}",
          whereClause: "PARAMCD = '{paramcd}'",
          note: "{eventLabel} record; censoring in {dataset}.{cnsr}." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID", "PARAMCD"],
          note: "One record per subject per time-to-event parameter." }
      ],
      grouping: [
        { tier: "DataConcept", id: "DC.TRT", label: "Planned Treatment",
          iri: "acdc:dc/PlannedTreatment", iri_status: "illustrative", usdm: "usdm:StudyArm" },
        { tier: "ADaM Class Variable", id: "TRTP", label: "Planned Treatment",
          dataStructure: "ADSL", note: "Subject-level treatment assignment." },
        { tier: "Study variable", id: "ADSL.TRTP", label: "TRTP in ADSL",
          note: "Fulvestrant + everolimus / fulvestrant + placebo." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset",
          file: "adsl.xpt", keys: ["USUBJID"], note: "One record per subject." }
      ],
      population: [
        { tier: "DataConcept", id: "DC.POP", label: "Analysis Population",
          iri: "acdc:dc/AnalysisPopulation", iri_status: "illustrative", usdm: "usdm:AnalysisPopulation" },
        { tier: "ADaM Class Variable", id: "{flag}", label: "Population Flag",
          dataStructure: "ADSL", note: "Population indicator variable." },
        { tier: "Study variable", id: "ADSL.{flag}", label: "{flag} in ADSL",
          whereClause: "{flag} = 'Y'", note: "Subjects in the {popName} analysis set." },
        { tier: "Physical dataset", id: "ADSL", label: "Subject-Level Analysis Dataset",
          file: "adsl.xpt", keys: ["USUBJID"] }
      ]
    }
  };
})(typeof window !== "undefined" ? window : globalThis);

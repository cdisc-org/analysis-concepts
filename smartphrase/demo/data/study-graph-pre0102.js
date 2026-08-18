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

    /*
     * The source document this study's prose is anchored to (issue #12).
     *
     * `sectionFiles` maps a TOP-LEVEL section number to its converted file. The
     * conversion is split by the SAP's own section numbering, so a subsection
     * such as "7.7.2" resolves through its head, "7" — which keeps this map to a
     * handful of entries instead of one per subsection.
     *
     * Declaring this is what makes anchoring coverage gateable for this study:
     * tools/verify.mjs checks that every quote appears verbatim in the section
     * it cites, so an anchor is a verified fact rather than an unchecked claim.
     */
    sourceDocument: {
      id: "PRE0102-SAP-001",
      title: "PrE0102 Final Statistical Analysis Plan",
      date: "2014-03-24",
      root: "SAP",
      iri: "acdc:document/PRE0102-SAP-001", iri_status: "illustrative",
      sectionFiles: {
        "1": "01-list-of-abbreviations.md",
        "2": "02-introduction.md",
        "3": "03-study-objectives.md",
        "4": "04-study-design.md",
        "5": "05-measurement-of-effect.md",
        "6": "06-safety-measurements.md",
        "7": "07-general-statistical-considerations.md",
        "8": "08-reporting-conventions.md"
      }
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
        sapRefs: [
          { section: "5.3",
            quote: "the duration of time from time of randomization to time of progression or death, whichever occurs first",
            relation: "definition" },
          /*
           * 7.7.2 restates the endpoint where the analysis is specified. Both
           * are real definitions of the same endpoint in the same document;
           * neither is a duplicate of the other, and which one a reviewer
           * should see depends on which analysis they are inspecting.
           */
          { section: "7.7.2",
            quote: "PFS = time from randomization to documented disease progression or death",
            relation: "definition" }
        ],
      },
      "EVENT.OS": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "OS", name: "death from any cause",
        iri: "ncit:C16952", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "OS",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRefs: [
          { section: "5.3",
            quote: "the time from randomization until death or censored at the date of last follow-up",
            relation: "definition" },
          { section: "7.7.2",
            quote: "OS = time from randomization until death",
            relation: "definition" }
        ],
      },
      "EVENT.TTP": {
        kind: "Event", conceptCategory: "EventDimension",
        label: "TTP", name: "disease progression",
        iri: "acdc:event/TimeToProgression", iri_status: "illustrative",
        data: { dataset: "ADTTE", file: "adtte.xpt", paramcd: "TTP",
                datasetLabel: "ADaM time-to-event analysis dataset",
                aval: "AVAL", cnsr: "CNSR" },
        sapRefs: [
          { section: "5.3",
            quote: "the time from randomization until progression of the disease",
            relation: "definition" },
          { section: "7.7.2",
            quote: "TTP = time from randomization until progression of disease",
            relation: "definition" }
        ],
      },

      "POP.EVAL_EFFICACY": {
        kind: "Population",
        label: "EFF", name: "eligible, treated",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-EFF", iri_status: "illustrative",
        data: { flag: "EFFIFL" },
        sapRefs: [
          { section: "7.2",
            quote: "The primary efficacy analysis will be done including eligible, treated subjects.",
            relation: "definition" },
          { section: "7.7.2",
            quote: "for all eligible, treated subjects",
            relation: "specification" }
        ],
      },
      "POP.ITT": {
        kind: "Population",
        label: "ITT", name: "intent-to-treat",
        iri: "usdm:AnalysisPopulation/PRE0102-POP-ITT", iri_status: "illustrative",
        data: { flag: "ITTFL" },
        sapRefs: [{ section: "7.2",
                  quote: "Intent-to-treat (ITT) analysis population includes all subjects as randomized." }]
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
        /* The concept is anchored to the event's DEFINITION. The sentence that
           justifies its treatment-policy HANDLING is a different claim, made by
           the analysis, and is anchored on the phrase instance instead. */
        sapRefs: [{ section: "4.3",
                  quote: "Subjects who discontinue everolimus/placebo because of suspected everolimus-associated toxicity should continue treatment with fulvestrant alone until disease progression" }]
      },

      "TRT.PRE0102": {
        kind: "Treatment",
        label: "treatment",
        name: "fulvestrant plus everolimus and fulvestrant plus placebo",
        iri: "usdm:StudyArm/PRE0102-ARM-SET", iri_status: "illustrative",
        data: { variable: "TRTP" },
        /* Was a PARAPHRASE until issue #12's quote-verification gate caught it. */
        sapRefs: [{ section: "4.1",
                  quote: "Subjects will be randomized (1:1) to receive everolimus or placebo after consideration of stratification factors" }]
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
    /*
     * Estimand registry — see study-graph.js for the design note. Each estimand
     * declares its intercurrent-event SCOPE; the strategy comes from the
     * analysis's phrase, falling back to the event's own icheStrategy.
     *
     * The PFS estimand's ICE and its handling are both QUOTED from the source
     * SAP (§4.3), unlike the CDISC Pilot's illustrative pair. The OS and TTP
     * estimands declare no intercurrent events: the SAP says nothing about
     * intercurrent events for them, and an explicit empty scope is the honest
     * encoding of that.
     */
    estimands: {
      "EST.PFS": {
        iri: "usdm:Estimand/PRE0102-EST-PFS", iri_status: "illustrative",
        label: "Primary estimand — progression-free survival",
        rank: "primary",
        /* Typed, not smuggled into the label as "(SAP 3.1)" for tooling to regex
           back out — the convention issue #12 objects to, which this study
           carried until now. */
        sapRefs: [{ section: "3.1",
                  quote: "To assess progression-free survival in post-menopausal patients with hormone-receptor positive metastatic breast cancer that is resistant to aromatase inhibitor (AI) therapy treated with fulvestrant and everolimus compared to fulvestrant alone." }],
        intercurrentEvents: ["ICE.TOX_DISCONT"]
      },
      "EST.OS": {
        iri: "usdm:Estimand/PRE0102-EST-OS", iri_status: "illustrative",
        label: "Secondary estimand — overall survival",
        rank: "secondary",
        sapRefs: [{ section: "3.2",
                  quote: "To describe the safety profile, objective response rate, time to progression and overall survival" }],
        intercurrentEvents: []
      },
      "EST.TTP": {
        iri: "usdm:Estimand/PRE0102-EST-TTP", iri_status: "illustrative",
        label: "Secondary estimand — time to progression",
        rank: "secondary",
        sapRefs: [{ section: "3.2",
                  quote: "To describe the safety profile, objective response rate, time to progression and overall survival" }],
        intercurrentEvents: []
      }
    },

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
        /* The section that defines this analysis's methodology. */
        sapRefs: [{ section: "7.7.2",
                  quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }],
        /* Primary estimand, per SAP 3.1 (objective) and 7.7.2 (methodology).
           See DESIGN.md D15 on why sentenceRole is kept beside analysisRole. */
        estimand: "EST.PFS",
        analysisRole: "MainEstimator",
        sentenceRole: "the primary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          /* method / value / output bindings all resolve into the LIBRARY,
             which correctly forbids study text — so before issue #12 these
             three had no route to the SAP at all. One sentence grounds all
             three, and each cites it at its own use. */
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          /* The concept anchors the event DEFINITION (4.3); this use anchors
             the sentence justifying its treatment-policy HANDLING. Same
             section, different claim. */
          { phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.TOX_DISCONT", render: "name" } },
                          sapRefs: [{ section: "4.3",
                                    quote: "All subjects who have discontinued protocol therapy will be followed for survival and for progression, even if protocol therapy was discontinued because of toxicity or for other reasons." }] },
          /* FIXED TEXT — no bindings at all, so no concept anchor could ever
             reach it. Note the quote differs per instance: one sentence, three
             clauses, and each analysis cites the clause that governs IT. */
          { phrase: "SP_CENSOR_LTFU",      bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Subjects who are lost to follow-up are censored at the time of last tumor assessment for TTP and PFS" }] },
          { phrase: "SP_KM_CURVES",        bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "In addition to the summary table, PFS and OS will be displayed by treatment arm using Kaplan-Meier survival curves." }] },
          { phrase: "SP_SUMMARY_MEASURE",  bindings: { summary: { output: "median_survival" } },
                          sapRefs: [
                            { section: "7.7.2",
                              quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates.",
                              relation: "specification" },
                            /*
                             * The conditional the issue names as common: a
                             * summary measure qualified elsewhere in its own
                             * section. These two share a level AND a section,
                             * so nothing but `relation` can order them.
                             */
                            { section: "7.7.2",
                              quote: "If medians have not been reached, 2-year PFS, TTP and OS should be reported instead, with 90% confidence intervals",
                              relation: "qualification" }
                          ] }
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
        /* The SAP's own sensitivity sentence, not the general methodology one —
           an instance anchor cites what licenses THIS analysis. */
        sapRefs: [{ section: "7.7.2",
                  quote: "As a sensitivity analysis, all of the above analyses described in Section 7.6.2 will be repeated for the as-randomized population (intent-to-treat analysis)." }],
        /* The SAME estimand as the primary — the SAP's own sensitivity analysis
           (7.7.2: "As a sensitivity analysis, all of the above analyses ... will
           be repeated for the as-randomized population"). Source-grounded, and
           it is what makes the one-MainEstimator check meaningful. */
        estimand: "EST.PFS",
        analysisRole: "SensitivityAnalysis",
        sentenceRole: "a sensitivity analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.PFS", render: "name_with_label" } } },
          /* The sentence that specifies THIS analysis — nothing else cites it. */
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.ITT", render: "name" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "will be repeated for the as-randomized population (intent-to-treat analysis)",
                                    relation: "specification" }] },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          /* method / value / output bindings all resolve into the LIBRARY,
             which correctly forbids study text — so before issue #12 these
             three had no route to the SAP at all. One sentence grounds all
             three, and each cites it at its own use. */
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          /* The concept anchors the event DEFINITION (4.3); this use anchors
             the sentence justifying its treatment-policy HANDLING. Same
             section, different claim. */
          { phrase: "SP_ICE_TREATMENT_POLICY", bindings: { ice: { concept: "ICE.TOX_DISCONT", render: "name" } },
                          sapRefs: [{ section: "4.3",
                                    quote: "All subjects who have discontinued protocol therapy will be followed for survival and for progression, even if protocol therapy was discontinued because of toxicity or for other reasons." }] },
          /* FIXED TEXT — no bindings at all, so no concept anchor could ever
             reach it. Note the quote differs per instance: one sentence, three
             clauses, and each analysis cites the clause that governs IT. */
          { phrase: "SP_CENSOR_LTFU",      bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Subjects who are lost to follow-up are censored at the time of last tumor assessment for TTP and PFS" }] },
          { phrase: "SP_KM_CURVES",        bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "In addition to the summary table, PFS and OS will be displayed by treatment arm using Kaplan-Meier survival curves." }] },
          { phrase: "SP_SUMMARY_MEASURE",  bindings: { summary: { output: "median_survival" } },
                          sapRefs: [
                            { section: "7.7.2",
                              quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates.",
                              relation: "specification" },
                            /*
                             * The conditional the issue names as common: a
                             * summary measure qualified elsewhere in its own
                             * section. These two share a level AND a section,
                             * so nothing but `relation` can order them.
                             */
                            { section: "7.7.2",
                              quote: "If medians have not been reached, 2-year PFS, TTP and OS should be reported instead, with 90% confidence intervals",
                              relation: "qualification" }
                          ] }
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
        sapRefs: [{ section: "7.7.2",
                  quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }],
        estimand: "EST.OS",
        analysisRole: "MainEstimator",
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.OS", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          /* method / value / output bindings all resolve into the LIBRARY,
             which correctly forbids study text — so before issue #12 these
             three had no route to the SAP at all. One sentence grounds all
             three, and each cites it at its own use. */
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          /* FIXED TEXT — no bindings at all, so no concept anchor could ever
             reach it. Note the quote differs per instance: one sentence, three
             clauses, and each analysis cites the clause that governs IT. */
          { phrase: "SP_CENSOR_LTFU",      bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "at the time of the last known contact for OS" }] },
          { phrase: "SP_KM_CURVES",        bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "In addition to the summary table, PFS and OS will be displayed by treatment arm using Kaplan-Meier survival curves." }] },
          { phrase: "SP_SUMMARY_MEASURE",  bindings: { summary: { output: "median_survival" } },
                          sapRefs: [
                            { section: "7.7.2",
                              quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates.",
                              relation: "specification" },
                            /*
                             * The conditional the issue names as common: a
                             * summary measure qualified elsewhere in its own
                             * section. These two share a level AND a section,
                             * so nothing but `relation` can order them.
                             */
                            { section: "7.7.2",
                              quote: "If medians have not been reached, 2-year PFS, TTP and OS should be reported instead, with 90% confidence intervals",
                              relation: "qualification" }
                          ] }
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
        sapRefs: [{ section: "7.7.2",
                  quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }],
        estimand: "EST.TTP",
        analysisRole: "MainEstimator",
        sentenceRole: "a secondary analysis",
        phrases: [
          { phrase: "SP_TTE_ENDPOINT",     bindings: { event:      { concept: "EVENT.TTP", render: "name_with_label" } } },
          { phrase: "SP_POPULATION",       bindings: { population: { concept: "POP.EVAL_EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",         bindings: { treatment:  { concept: "TRT.PRE0102", render: "label" } } },
          /* method / value / output bindings all resolve into the LIBRARY,
             which correctly forbids study text — so before issue #12 these
             three had no route to the SAP at all. One sentence grounds all
             three, and each cites it at its own use. */
          { phrase: "SP_METHOD_KM",        bindings: { method:     { method: "M.KaplanMeier", render: "label" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          { phrase: "SP_CONFIDENCE_LEVEL", bindings: { conf_level: { value: "90" } },
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." }] },
          /* FIXED TEXT — no bindings at all, so no concept anchor could ever
             reach it. Note the quote differs per instance: one sentence, three
             clauses, and each analysis cites the clause that governs IT. */
          { phrase: "SP_CENSOR_LTFU",      bindings: {},
                          sapRefs: [{ section: "7.7.2",
                                    quote: "Subjects who are lost to follow-up are censored at the time of last tumor assessment for TTP and PFS" }] },
          { phrase: "SP_SUMMARY_MEASURE",  bindings: { summary: { output: "median_survival" } },
                          sapRefs: [
                            { section: "7.7.2",
                              quote: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates.",
                              relation: "specification" },
                            /*
                             * The conditional the issue names as common: a
                             * summary measure qualified elsewhere in its own
                             * section. These two share a level AND a section,
                             * so nothing but `relation` can order them.
                             */
                            { section: "7.7.2",
                              quote: "If medians have not been reached, 2-year PFS, TTP and OS should be reported instead, with 90% confidence intervals",
                              relation: "qualification" }
                          ] }
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

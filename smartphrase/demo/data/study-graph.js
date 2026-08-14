/*
 * Study-level graph for the smartphrase demo — CDISC Pilot (CDISCPILOT01).
 *
 * This is the ILLUSTRATIVE layer: study concepts, analysis instances and the
 * data-trace tiers. Identifiers ground into existing standards wherever one
 * covers the entity (USDM, ARS, STATO, NCIt, W3C qb); anything not yet
 * authoritative is flagged iri_status: "illustrative".
 *
 * The library layer (phrase templates, transformation templates, methods) is
 * NOT defined here — it comes verbatim from methods_02 via acdc-library.js.
 */
(function (g) {
  g.STUDY_GRAPHS = g.STUDY_GRAPHS || {};
  g.STUDY_GRAPHS.CDISCPILOT01 = {

    prefixes: {
      acdc:  "https://w3id.org/cdisc/ac-dc/",
      usdm:  "https://ddf.cdisc.org/usdm/v4/",
      ars:   "https://www.cdisc.org/standards/foundational/ars/1-0/",
      stato: "http://purl.obolibrary.org/obo/",
      ncit:  "http://purl.obolibrary.org/obo/NCIT_",
      qb:    "http://purl.org/linked-data/cube#"
    },

    study: {
      studyId: "CDISCPILOT01",
      title: "Safety and Efficacy of the Xanomeline Transdermal Therapeutic System in Patients with Mild to Moderate Alzheimer's Disease",
      iri: "usdm:Study/CDISCPILOT01",
      iri_status: "illustrative"
    },

    /*
     * Shared concept registry. `label` is the short display label, `name` the
     * full name — the render options on library placeholders (label / name /
     * name_with_label) select between them.
     */
    concepts: {
      "PARAM.ADASCOG11": {
        kind: "Parameter", conceptCategory: "ParameterDimension",
        label: "ADAS-Cog(11)",
        name: "Alzheimer's Disease Assessment Scale - Cognitive Subscale (11 items)",
        iri: "ncit:C168804", iri_status: "illustrative",
        data: { dataset: "ADQSADAS", file: "adqsadas.xpt", paramcd: "ACTOT",
                datasetLabel: "ADaM ADAS-Cog analysis dataset" }
      },
      "PARAM.NPIX": {
        kind: "Parameter", conceptCategory: "ParameterDimension",
        label: "NPI-X",
        name: "Neuropsychiatric Inventory - Revised, mean domain total score",
        iri: "acdc:param/NPIX", iri_status: "illustrative",
        data: { dataset: "ADNPIX", file: "adnpix.xpt", paramcd: "NPTOT",
                datasetLabel: "ADaM NPI-X analysis dataset" }
      },
      "VISIT.WK24": {
        kind: "Timepoint", conceptCategory: "VisitDimension",
        label: "Week 24", name: "Week 24 (end of double-blind treatment period)",
        iri: "usdm:ScheduledActivityInstance/SAI-WK24", iri_status: "illustrative",
        data: { avisitn: 24 }
      },
      "VISIT.WK16": {
        kind: "Timepoint", conceptCategory: "VisitDimension",
        label: "Week 16", name: "Week 16",
        iri: "usdm:ScheduledActivityInstance/SAI-WK16", iri_status: "illustrative",
        data: { avisitn: 16 }
      },
      "VISIT.WK8": {
        kind: "Timepoint", conceptCategory: "VisitDimension",
        label: "Week 8", name: "Week 8",
        iri: "usdm:ScheduledActivityInstance/SAI-WK8", iri_status: "illustrative",
        data: { avisitn: 8 }
      },
      "VISIT.BASELINE": {
        kind: "Timepoint", conceptCategory: "VisitDimension",
        label: "Baseline", name: "Baseline (Week 0)",
        iri: "usdm:ScheduledActivityInstance/SAI-BL", iri_status: "illustrative",
        data: { avisitn: 0 }
      },
      "POP.EFFICACY": {
        kind: "Population",
        label: "EFF", name: "efficacy (intent-to-treat)",
        iri: "usdm:AnalysisPopulation/POP-EFF", iri_status: "illustrative",
        data: { flag: "ITTFL" }
      },
      "POP.PP": {
        kind: "Population",
        label: "PP", name: "per-protocol",
        iri: "usdm:AnalysisPopulation/POP-PP", iri_status: "illustrative",
        data: { flag: "PPROTFL" }
      },
      "POP.SAFETY": {
        kind: "Population",
        label: "SAF", name: "safety",
        iri: "usdm:AnalysisPopulation/POP-SAF", iri_status: "illustrative",
        data: { flag: "SAFFL" }
      },
      /*
       * Intercurrent events. New registry kind, grounding in
       * usdm:IntercurrentEvent. `ascertainedBy` mirrors the eSAP model's
       * OccurrenceCriterion shape (the BC ▸ property ▸ code path, named once,
       * with the BC as the path head) and is STRATEGY-INDEPENDENT — the same
       * ascertainment is reused whichever strategy an estimand applies. That is
       * why the ICE trace is a separate axis from the analysis-value trace.
       *
       * `implementedBy` is keyed by strategy and lives on the ICE, so two
       * estimands handling this event differently each resolve to the right
       * transformation without a second copy of the event.
       *
       * ILLUSTRATIVE: the CDISC Pilot has no protocol-defined ICE list, so
       * these are constructed to exercise the layer. Contrast PrE0102, whose
       * ICE and its handling are both quoted from the source SAP.
       */
      "ICE.TRT_DISCONT": {
        kind: "IntercurrentEvent",
        label: "treatment discontinuation",
        name: "discontinuation of study treatment",
        iri: "usdm:IntercurrentEvent/CDISCPILOT01-ICE-DISC", iri_status: "illustrative",
        icheStrategy: "Hypothetical",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_DS_001/Disposition Event",
                       operator: "equals",
                       responseCode: "Treatment Discontinued" }]
        },
        /* Both handlings this event supports; each estimand picks one. */
        implementedBy: { Hypothetical: ["T.LOCF_Imputation"], TreatmentPolicy: [] },
        data: { dataset: "ADSL", file: "adsl.xpt", flag: "DCSREAS",
                datasetLabel: "Subject-Level Analysis Dataset",
                timing: "EOSDT", bc: "BC_DS_001", property: "Disposition Event" },
        sapRef: "ILLUSTRATIVE — not from a source SAP; constructed for issue #11"
      },
      "ICE.CONMED": {
        kind: "IntercurrentEvent",
        label: "concomitant AD medication",
        name: "use of concomitant AD medication",
        iri: "usdm:IntercurrentEvent/CDISCPILOT01-ICE-CONMED", iri_status: "illustrative",
        icheStrategy: "TreatmentPolicy",
        ascertainedBy: {
          arm: "collected",
          criteria: [{ property: "BC_CM_001/Category",
                       operator: "in",
                       responseCode: "AD THERAPY" }]
        },
        /* TreatmentPolicy is implemented by nothing: data are used as observed.
           Upstream IceHandling.implementedBy documents this as "omitted", so an
           empty list is the correct encoding, not a missing one. */
        implementedBy: { TreatmentPolicy: [] },
        data: { dataset: "ADCM", file: "adcm.xpt", flag: "CMCAT",
                datasetLabel: "Concomitant Medications Analysis Dataset",
                timing: "ASTDT", bc: "BC_CM_001", property: "Category" },
        sapRef: "ILLUSTRATIVE — not from a source SAP; constructed for issue #11"
      },

      "TRT.ALL": {
        kind: "Treatment",
        label: "treatment",
        name: "Placebo, Xanomeline Low Dose and Xanomeline High Dose",
        iri: "usdm:StudyArm/ARM-SET-ALL", iri_status: "illustrative",
        data: { variable: "TRTP" }
      }
    },

    /*
     * Method grounding — the method definition itself lives in the library
     * (methods["M.ANCOVA"]); this adds the study-independent standard IRIs.
     */
    methodGrounding: {
      "M.ANCOVA": {
        label: "ANCOVA", name: "analysis of covariance",
        iri: "stato:STATO_0000176", iri_status: "authoritative",
        ars: "ars:method/MTH-ANCOVA-CFB", ars_status: "illustrative"
      }
    },

    /*
     * Analysis instances — the study eSAP fragments. All three instantiate the
     * SAME library transformation template (T.CFB_ANCOVA): that is the
     * template-level reuse claim. Each carries only what varies: the phrase
     * instances (whose bindings fill the template's sliceKeys) and its place
     * in the study (objective, ARS analysis, sentence role).
     */
    instances: [
      {
        id: "AC.PRIMARY.ADASCOG",
        iri: "acdc:instance/AC-PRIMARY-ADASCOG",
        label: "Primary efficacy analysis",
        template: "T.CFB_ANCOVA",
        usdmObjective: {
          iri: "usdm:Objective/OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To evaluate the efficacy of xanomeline TTS on cognition in mild to moderate Alzheimer's disease"
        },
        arsAnalysis: { iri: "ars:analysis/AN-3.02.01", iri_status: "illustrative" },
        /*
         * The estimand is instance-level metadata, not a phrase: four of the
         * five ICH E9(R1) attributes are already carried by the phrases
         * (treatment→grouping, variable→endpoint/parameter/timepoint,
         * population→population). Attributes 4 and 5 are the ice_handling and
         * summary_measure phrases.
         *
         * `rank` is what makes "a secondary analysis" renderable. AnalysisRole
         * is per-estimand, so a secondary analysis is the MainEstimator OF a
         * secondary estimand — the display string needs both, which is why
         * sentenceRole is kept beside analysisRole rather than derived from it.
         * See DESIGN.md D15.
         */
        estimand: {
          id: "EST.PRIMARY",
          iri: "usdm:Estimand/CDISCPILOT01-EST-PRIMARY", iri_status: "illustrative",
          label: "Primary estimand — ADAS-Cog(11) change at Week 24",
          rank: "primary"
        },
        analysisRole: "MainEstimator",
        sentenceRole: "the primary analysis",
        baselineVisit: "VISIT.BASELINE",
        phrases: [
          { phrase: "SP_CFB_ENDPOINT",      bindings: { parameter:  { concept: "PARAM.ADASCOG11", render: "name_with_label" } } },
          { phrase: "SP_TIMEPOINT",         bindings: { visit:      { concept: "VISIT.WK24", render: "label" } } },
          { phrase: "SP_POPULATION",        bindings: { population: { concept: "POP.EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",          bindings: { treatment:  { concept: "TRT.ALL", render: "label" } } },
          { phrase: "SP_METHOD_ANCOVA",     bindings: { method:     { method: "M.ANCOVA", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL",  bindings: { conf_level: { value: "95" } } },
          { phrase: "SP_COVARIATE_BASELINE",bindings: { parameter:  { concept: "PARAM.ADASCOG11", render: "label" } } }
        ]
      },
      {
        id: "AC.SEC.NPIX",
        iri: "acdc:instance/AC-SEC-NPIX",
        label: "Secondary efficacy analysis — behaviour",
        template: "T.CFB_ANCOVA",
        usdmObjective: {
          iri: "usdm:Objective/OBJ-SECONDARY-1", iri_status: "illustrative",
          text: "To evaluate the effect of xanomeline TTS on behavioural disturbance"
        },
        arsAnalysis: { iri: "ars:analysis/AN-3.03.01", iri_status: "illustrative" },
        /* Its own estimand, of which it is the main estimator — see the note on
           AC.PRIMARY.ADASCOG for why rank and analysisRole are both needed. */
        estimand: {
          id: "EST.SECONDARY.NPIX",
          iri: "usdm:Estimand/CDISCPILOT01-EST-SECONDARY-NPIX", iri_status: "illustrative",
          label: "Secondary estimand — NPI-X change at Week 24",
          rank: "secondary"
        },
        analysisRole: "MainEstimator",
        sentenceRole: "a secondary analysis",
        baselineVisit: "VISIT.BASELINE",
        phrases: [
          { phrase: "SP_CFB_ENDPOINT",      bindings: { parameter:  { concept: "PARAM.NPIX", render: "name_with_label" } } },
          { phrase: "SP_TIMEPOINT",         bindings: { visit:      { concept: "VISIT.WK24", render: "label" } } },
          { phrase: "SP_POPULATION",        bindings: { population: { concept: "POP.EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",          bindings: { treatment:  { concept: "TRT.ALL", render: "label" } } },
          { phrase: "SP_METHOD_ANCOVA",     bindings: { method:     { method: "M.ANCOVA", render: "label" } } },
          { phrase: "SP_COVARIATE_BASELINE",bindings: { parameter:  { concept: "PARAM.NPIX", render: "label" } } }
        ]
      },
      {
        id: "AC.SUPP.ADASCOG.WK16",
        iri: "acdc:instance/AC-SUPP-ADASCOG-WK16",
        label: "Supporting analysis — earlier timepoint",
        template: "T.CFB_ANCOVA",
        usdmObjective: {
          iri: "usdm:Objective/OBJ-PRIMARY-1", iri_status: "illustrative",
          text: "To evaluate the efficacy of xanomeline TTS on cognition in mild to moderate Alzheimer's disease"
        },
        arsAnalysis: { iri: "ars:analysis/AN-3.02.02", iri_status: "illustrative" },
        /* Same estimand as the primary, at an earlier timepoint — so it is a
           SUPPLEMENTARY analysis of EST.PRIMARY, not an estimand of its own.
           This is what gives the one-MainEstimator-per-estimand check something
           real to verify. */
        estimand: {
          id: "EST.PRIMARY",
          iri: "usdm:Estimand/CDISCPILOT01-EST-PRIMARY", iri_status: "illustrative",
          label: "Primary estimand — ADAS-Cog(11) change at Week 24",
          rank: "primary"
        },
        analysisRole: "SupplementaryAnalysis",
        sentenceRole: "a supporting analysis",
        baselineVisit: "VISIT.BASELINE",
        phrases: [
          { phrase: "SP_CFB_ENDPOINT",      bindings: { parameter:  { concept: "PARAM.ADASCOG11", render: "name_with_label" } } },
          { phrase: "SP_TIMEPOINT",         bindings: { visit:      { concept: "VISIT.WK16", render: "label" } } },
          { phrase: "SP_POPULATION",        bindings: { population: { concept: "POP.EFFICACY", render: "name" } } },
          { phrase: "SP_GROUPING",          bindings: { treatment:  { concept: "TRT.ALL", render: "label" } } },
          { phrase: "SP_METHOD_ANCOVA",     bindings: { method:     { method: "M.ANCOVA", render: "label" } } },
          { phrase: "SP_CONFIDENCE_LEVEL",  bindings: { conf_level: { value: "95" } } },
          { phrase: "SP_COVARIATE_BASELINE",bindings: { parameter:  { concept: "PARAM.ADASCOG11", render: "label" } } }
        ]
      }
    ],

    /*
     * Data-trace tier templates: how each phrase role reaches the physical
     * data. Concrete values (dataset, where-clause) are substituted from the
     * live instance bindings by the engine — so the trace follows edits too.
     * ADaM class-variable tier reflects ADaMIG v1.3 BDS / ADSL structures.
     */
    traceTemplates: {
      endpoint: [
        { tier: "DataConcept", id: "DC.CHG", label: "Change from Baseline",
          iri: "acdc:dc/ChangeFromBaseline", iri_status: "illustrative",
          note: "Derived analysis value: post-baseline value minus baseline value. Produced by library derivation T.ChangeFromBaseline." },
        { tier: "ADaM Class Variable", id: "CHG", label: "Change from Baseline",
          dataStructure: "BDS", note: "BDS analysis-value variable, ADaMIG v1.3." },
        { tier: "Study variable", id: "{dataset}.CHG", label: "CHG in {dataset}",
          whereClause: "PARAMCD = '{paramcd}' AND AVISITN = {avisitn}",
          note: "{paramLabel}, {visitLabel} record." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID", "PARAMCD", "AVISIT"],
          note: "One record per subject per parameter per analysis visit." }
      ],
      covariate: [
        { tier: "DataConcept", id: "DC.BASE", label: "Baseline Value",
          iri: "acdc:dc/BaselineValue", iri_status: "illustrative",
          note: "Reference value at the baseline visit. Produced by library derivation T.BaselineSelection." },
        { tier: "ADaM Class Variable", id: "BASE", label: "Baseline Value",
          dataStructure: "BDS" },
        { tier: "Study variable", id: "{dataset}.BASE", label: "BASE in {dataset}",
          whereClause: "PARAMCD = '{paramcd}'",
          note: "Baseline {paramLabel}." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID", "PARAMCD", "AVISIT"] }
      ],
      timepoint: [
        { tier: "DataConcept", id: "DC.AVISIT", label: "Analysis Visit",
          iri: "acdc:dc/AnalysisVisit", iri_status: "illustrative" },
        { tier: "ADaM Class Variable", id: "AVISIT", label: "Analysis Visit",
          dataStructure: "BDS", note: "Paired with numeric AVISITN for sorting." },
        { tier: "Study variable", id: "{dataset}.AVISIT", label: "AVISIT in {dataset}",
          whereClause: "AVISITN = {avisitn}", note: "Decodes to '{visitLabel}'." },
        { tier: "Physical dataset", id: "{dataset}", label: "{datasetLabel}",
          file: "{file}", keys: ["USUBJID", "PARAMCD", "AVISIT"] }
      ],
      grouping: [
        { tier: "DataConcept", id: "DC.TRT", label: "Planned Treatment",
          iri: "acdc:dc/PlannedTreatment", iri_status: "illustrative", usdm: "usdm:StudyArm" },
        { tier: "ADaM Class Variable", id: "TRTP", label: "Planned Treatment",
          dataStructure: "ADSL", note: "Subject-level treatment assignment." },
        { tier: "Study variable", id: "ADSL.TRTP", label: "TRTP in ADSL",
          note: "Placebo / Xanomeline Low Dose / Xanomeline High Dose." },
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
  /* Back-compat alias: the original single-study global. */
  g.STUDY_GRAPH = g.STUDY_GRAPHS.CDISCPILOT01;
})(typeof window !== "undefined" ? window : globalThis);

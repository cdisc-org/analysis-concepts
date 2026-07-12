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
  g.STUDY_GRAPH = {

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
})(typeof window !== "undefined" ? window : globalThis);

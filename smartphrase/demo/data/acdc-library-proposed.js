/*
 * PROPOSED library additions — NOT yet upstream on methods_02.
 *
 * acdc-library.js is a generated verbatim subset of methods_02@ffee5df and
 * must not be hand-edited. Entities authored for this PoC live here instead,
 * carry proposed: true, and are badged in the demo UI so no viewer mistakes
 * them for released library content.
 *
 * Upstreaming path: submit to methods_02 as a v0.7.x minor addition, then
 * widen SELECT_TRANSFORMATIONS in tools/build-library-subset.mjs and delete
 * the entry from here.
 */
(function (g) {

  /*
   * All five strategy phrases bind the same slot — one ICE per phrase. Shared
   * by reference across the five definitions: safe because nothing mutates
   * placeholder objects. If that ever changes, clone it per phrase.
   */
  var ICE_SLOT = {
    name: "ice",
    kind: "concept_ref",
    concept_class: "IntercurrentEvent",
    concept_constraint: "IntercurrentEvent",
    value_source: "study_registry",
    render_options: ["label", "name", "name_with_label"],
    default_render: "name",
    required: true
  };

  g.ACDC_LIBRARY_PROPOSED = {

    provenance: {
      status: "proposed",
      authored_for: [
        "issue #9 — breast cancer worked example (PrE0102)",
        "issue #11 — estimands and intercurrent events"
      ],
      not_in: "methods_02@ffee5df",
      rationale: "The SAP's PFS analysis is descriptive (median + 90% CI by arm). " +
                 "Upstream T.OS_LogRank is a hypothesis test (outputs " +
                 "chi_squared_test_result) and does not fit; no descriptive " +
                 "Kaplan-Meier template exists in v0.7. " +
                 "The ICH E9(R1) strategy phrases and the summary-measure phrase " +
                 "need two new phrase ROLES, which is a library minor-version " +
                 "event rather than a study addition — so they are proposed here " +
                 "until the working group decides who accepts role-level changes."
    },

    /*
     * Two new phrase roles — a library MINOR-VERSION event, not a study
     * addition. `order_after` is overlay-only plumbing (upstream carries a
     * flat `order` array): it declares where each role splices into the
     * generated subset's order, so the overlay never restates upstream order
     * and cannot silently reorder existing roles. "last" appends.
     */
    roleDefinitions: {
      roles: {
        ice_handling: {
          label: "ICE Handling",
          contextSource: "manual",
          repeating: true,
          order_after: "grouping",
          description: "ICH E9(R1) attribute 4 — the strategy applied to an intercurrent event. Repeating: one phrase per declared ICE."
        },
        summary_measure: {
          label: "Summary Measure",
          contextSource: "manual",
          order_after: "last",
          description: "ICH E9(R1) attribute 5 — the population-level summary, bound to a method output class."
        }
      }
    },

    /*
     * One smartphrase per ICH E9(R1) strategy. The strategy is carried in
     * `anchors.icheStrategy` (an IchE9R1Strategy enum value) rather than being
     * inferred from the OID, so model→SAP is a lookup, not string surgery.
     *
     * `anchors.implementation` names the transformation pattern that
     * operationalises the strategy — the values are taken from
     * IceHandling.implementedBy's own documentation on methods_02, so the two
     * layers agree on semantics. "none" is correct for TreatmentPolicy: data
     * are used as observed, and there is nothing to implement.
     */
    smartPhrases: [
      {
        oid: "SP_ICE_TREATMENT_POLICY",
        name: "Intercurrent event — treatment policy strategy",
        role: "ice_handling",
        phrase_template: "regardless of {ice}",
        anchors: { icheStrategy: "TreatmentPolicy", implementation: "none" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_HYPOTHETICAL",
        name: "Intercurrent event — hypothetical strategy",
        role: "ice_handling",
        phrase_template: "as if {ice} had not occurred",
        anchors: { icheStrategy: "Hypothetical", implementation: "imputation" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_COMPOSITE",
        name: "Intercurrent event — composite strategy",
        role: "ice_handling",
        phrase_template: "with {ice} treated as {outcome}",
        anchors: { icheStrategy: "Composite", implementation: "derivation" },
        placeholders: [ICE_SLOT, {
          name: "outcome",
          kind: "concept_ref",
          concept_class: "Outcome",
          concept_constraint: "Outcome",
          value_source: "study_registry",
          render_options: ["label", "name"],
          default_render: "name",
          required: true
        }]
      },
      {
        oid: "SP_ICE_WHILE_ON_TREATMENT",
        name: "Intercurrent event — while on treatment strategy",
        role: "ice_handling",
        phrase_template: "using measurements taken prior to {ice}",
        anchors: { icheStrategy: "WhileOnTreatment", implementation: "censoring" },
        placeholders: [ICE_SLOT]
      },
      {
        oid: "SP_ICE_PRINCIPAL_STRATUM",
        name: "Intercurrent event — principal stratum strategy",
        role: "ice_handling",
        phrase_template: "in the stratum of participants in whom {ice} would not occur",
        anchors: { icheStrategy: "PrincipalStratum", implementation: "population_subsetting" },
        placeholders: [ICE_SLOT]
      }
    ],

    transformations: [
      {
        "conceptId": "T.PFS_KaplanMeier",
        "label": "Time-to-Event Kaplan-Meier Summary",
        "shortLabel": "TTE KM",
        "transformationType": "analysis",
        "description": "Descriptive Kaplan-Meier summary of a time-to-event endpoint by treatment group: median time to event with confidence limits, the survival function, event counts, and landmark estimates for when the median is not reached. No hypothesis test.",
        "usesMethod": "M.KaplanMeier",
        "methodConfigurations": [
          { "configurationName": "conf_type", "value": "log-log" }
        ],
        "inputDataStructure": {
          "dimensions": [
            { "input": "fixed_effect", "concept": "Treatment" },
            { "concept": "Subject" },
            { "conceptCategory": "EventDimension" },
            { "concept": "Population" }
          ],
          "measures": [
            {
              "input": "time",
              "concept": "TimeToEvent",
              "requiredValueType": "Quantity",
              "slice": "endpoint",
              "description": "Time from the time-origin (randomization) to the event or to censoring."
            },
            {
              "input": "event",
              "concept": "Flag",
              "requiredValueType": "boolean",
              "slice": "endpoint",
              "description": "Event indicator; censoring is its complement."
            }
          ],
          "slices": [
            {
              "name": "endpoint",
              "description": "Time-to-event records for this event definition in the chosen population.",
              "constraints": [
                { "dimension": "EventDimension", "value": "{event}" },
                { "dimension": "Population", "value": "{population}" }
              ]
            }
          ]
        },
        "outputDataStructure": {
          "dimensions": [
            { "concept": "Treatment" },
            { "conceptCategory": "EventDimension" },
            { "concept": "Population" }
          ],
          "measures": [
            { "output": "median_survival", "concept": "MedianSurvival" },
            { "output": "survival_table", "concept": "SurvivalFunction" },
            { "output": "event_summary", "concept": "EventSummary" },
            { "output": "landmark_estimates", "concept": "LandmarkEstimate" }
          ]
        },
        "sliceKeys": [
          { "dimension": "EventDimension", "source": "event" },
          { "dimension": "Population", "source": "population" }
        ],
        "validSmartPhrases": [
          "SP_TTE_ENDPOINT",
          "SP_POPULATION",
          "SP_GROUPING",
          "SP_METHOD_KM",
          "SP_CONFIDENCE_LEVEL",
          "SP_STRATIFICATION"
        ]
      }
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);

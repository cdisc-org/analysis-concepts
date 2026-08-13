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
  g.ACDC_LIBRARY_PROPOSED = {

    provenance: {
      status: "proposed",
      authored_for: "issue #9 — breast cancer worked example (PrE0102)",
      not_in: "methods_02@ffee5df",
      rationale: "The SAP's PFS analysis is descriptive (median + 90% CI by arm). " +
                 "Upstream T.OS_LogRank is a hypothesis test (outputs " +
                 "chi_squared_test_result) and does not fit; no descriptive " +
                 "Kaplan-Meier template exists in v0.7."
    },

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

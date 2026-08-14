/*
 * AC/DC library subset for the smartphrase demo.
 * GENERATED from methods_02 (commit ffee5df) — do not hand-edit; see provenance field.
 *
 * Regenerate with:  node smartphrase/tools/build-library-subset.mjs
 *
 * Proposed additions that are NOT yet upstream live in acdc-library-proposed.js
 * and are flagged in the demo UI.
 */
(function(g){ g.ACDC_LIBRARY = {
  "provenance": {
    "source_branch": "methods_02",
    "source_commit": "ffee5df",
    "files": [
      "lib/transformations/ACDC_Transformation_Library_v07.json",
      "lib/vocabulary/output_class_templates.json",
      "lib/methods/analyses/M_ANCOVA.json",
      "lib/methods/analyses/M_KaplanMeier.json"
    ],
    "note": "Verbatim subset of the authoritative AC/DC model artefacts; generated, not hand-edited."
  },
  "library_version": "0.7",
  "configurationOptions": {
    "imputation": {
      "values": [
        "LOCF",
        "BOCF",
        "WOCF",
        "Mean",
        "Median",
        "MMRM (implicit)"
      ],
      "default": "LOCF"
    },
    "event": {
      "values": [
        "death",
        "discontinuation",
        "first AE",
        "disease progression"
      ]
    },
    "strata": {
      "values": [
        "site",
        "region",
        "baseline severity"
      ]
    },
    "conf_level": {
      "values": [
        "90",
        "95",
        "97.5",
        "99"
      ],
      "default": "95"
    }
  },
  "roleDefinitions": {
    "description": "Registry of SmartPhrase roles. Each role has a human-readable label, a display order, and a contextSource that classifies whether the role is typically supplied by an endpoint spec ('endpoint') or chosen directly by the user ('manual').",
    "order": [
      "endpoint",
      "parameter",
      "timepoint",
      "population",
      "grouping",
      "method",
      "method_qualifier",
      "covariate"
    ],
    "roles": {
      "endpoint": {
        "label": "Endpoint Type",
        "contextSource": "endpoint"
      },
      "parameter": {
        "label": "Parameter",
        "contextSource": "endpoint"
      },
      "timepoint": {
        "label": "Timepoint",
        "contextSource": "endpoint"
      },
      "population": {
        "label": "Population",
        "contextSource": "endpoint"
      },
      "grouping": {
        "label": "Grouping",
        "contextSource": "endpoint"
      },
      "method": {
        "label": "Statistical Method",
        "contextSource": "manual"
      },
      "method_qualifier": {
        "label": "Method Qualifier",
        "contextSource": "manual"
      },
      "covariate": {
        "label": "Covariates",
        "contextSource": "manual"
      }
    }
  },
  "smartPhrases": [
    {
      "oid": "SP_CFB_ENDPOINT",
      "name": "Change from baseline endpoint",
      "role": "endpoint",
      "phrase_template": "change from baseline in {parameter}",
      "anchors": {
        "produced_concept": "Change"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_PCTCFB_ENDPOINT",
      "name": "Percent change from baseline endpoint",
      "role": "endpoint",
      "phrase_template": "percent change from baseline in {parameter}",
      "anchors": {
        "produced_concept": "PercentChange"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_TTE_ENDPOINT",
      "name": "Time-to-event endpoint",
      "role": "endpoint",
      "phrase_template": "time to {event}",
      "anchors": {
        "produced_concept": "TimeToEvent"
      },
      "placeholders": [
        {
          "name": "event",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Event",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_RESPONDER_ENDPOINT",
      "name": "Responder endpoint",
      "role": "endpoint",
      "phrase_template": "proportion of responders in {parameter}",
      "anchors": {
        "produced_concept": "Flag"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_VALUE_ENDPOINT",
      "name": "Analysis value endpoint",
      "role": "endpoint",
      "phrase_template": "{parameter} value",
      "anchors": {
        "produced_concept": "Measure"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_SHIFT_ENDPOINT",
      "name": "Shift endpoint",
      "role": "endpoint",
      "phrase_template": "shift from baseline in {parameter}",
      "anchors": {
        "produced_concept": "Shift"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_PEAK_ENDPOINT",
      "name": "Peak value endpoint",
      "role": "endpoint",
      "phrase_template": "peak {parameter}",
      "anchors": {
        "produced_concept": "PeakValue"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_AUC_ENDPOINT",
      "name": "Area under curve endpoint",
      "role": "endpoint",
      "phrase_template": "{parameter} AUC",
      "anchors": {
        "produced_concept": "AreaUnderCurve"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_PARAMETER",
      "name": "Parameter",
      "role": "parameter",
      "phrase_template": "for {parameter}",
      "anchors": {
        "produced_concept": "Parameter"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true,
          "concept_category": "ParameterDimension"
        }
      ]
    },
    {
      "oid": "SP_TIMEPOINT",
      "name": "Timepoint",
      "role": "timepoint",
      "phrase_template": "at {visit}",
      "anchors": {
        "produced_concept": "AnalysisVisit"
      },
      "placeholders": [
        {
          "name": "visit",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true,
          "concept_category": "VisitDimension"
        }
      ]
    },
    {
      "oid": "SP_POPULATION",
      "name": "Population",
      "role": "population",
      "phrase_template": "in the {population} population",
      "anchors": {
        "produced_concept": "Population"
      },
      "placeholders": [
        {
          "name": "population",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Population",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_GROUPING",
      "name": "Treatment grouping",
      "role": "grouping",
      "phrase_template": "comparing {treatment} groups",
      "anchors": {
        "produced_concept": "Treatment"
      },
      "placeholders": [
        {
          "name": "treatment",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Treatment",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_STRATIFICATION",
      "name": "Stratification",
      "role": "grouping",
      "phrase_template": "stratified by {strata}",
      "anchors": {},
      "placeholders": [
        {
          "name": "strata",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": null,
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_MMRM",
      "name": "MMRM method",
      "role": "method",
      "phrase_template": "using {method}",
      "anchors": {
        "uses_method": "M.MMRM"
      },
      "placeholders": [
        {
          "name": "method",
          "kind": "method_ref",
          "intent_constraint": "LongitudinalEstimate",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_ANCOVA",
      "name": "ANCOVA method",
      "role": "method",
      "phrase_template": "using {method}",
      "anchors": {
        "uses_method": "M.ANCOVA"
      },
      "placeholders": [
        {
          "name": "method",
          "kind": "method_ref",
          "intent_constraint": "GroupComparison",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_LOGRANK",
      "name": "Log-rank method",
      "role": "method",
      "phrase_template": "using the {method} test",
      "anchors": {
        "uses_method": "M.LogRankTest"
      },
      "placeholders": [
        {
          "name": "method",
          "kind": "method_ref",
          "intent_constraint": "TimeToEventEstimate",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_KM",
      "name": "Kaplan-Meier method",
      "role": "method",
      "phrase_template": "using {method} estimation",
      "anchors": {
        "uses_method": "M.KaplanMeier"
      },
      "placeholders": [
        {
          "name": "method",
          "kind": "method_ref",
          "intent_constraint": "TimeToEventEstimate",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_CHISQ",
      "name": "Chi-square method",
      "role": "method",
      "phrase_template": "using the {method} test",
      "anchors": {
        "uses_method": "M.ChiSquaredTest"
      },
      "placeholders": [
        {
          "name": "method",
          "kind": "method_ref",
          "intent_constraint": "GroupComparison",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_METHOD_DESCSTATS",
      "name": "Descriptive statistics",
      "role": "method",
      "phrase_template": "summarised by {statistic}",
      "anchors": {},
      "placeholders": [
        {
          "name": "statistic",
          "kind": "method_ref",
          "intent_constraint": "DescriptiveSummary",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_IMPUTATION",
      "name": "Imputation qualifier",
      "role": "method_qualifier",
      "phrase_template": "with {imputation} imputation for missing data",
      "anchors": {},
      "placeholders": [
        {
          "name": "imputation",
          "kind": "method_ref",
          "intent_constraint": "MissingDataHandling",
          "value_source": "internal_catalogue",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_CONFIDENCE_LEVEL",
      "name": "Confidence level qualifier",
      "role": "method_qualifier",
      "phrase_template": "with {conf_level}% confidence intervals",
      "anchors": {},
      "placeholders": [
        {
          "name": "conf_level",
          "kind": "value",
          "datatype": "integer",
          "constraint": {
            "min": 0,
            "max": 100
          },
          "required": true
        }
      ]
    },
    {
      "oid": "SP_COVARIATE_BASELINE",
      "name": "Baseline covariate",
      "role": "covariate",
      "phrase_template": "adjusting for baseline {parameter}",
      "anchors": {
        "produced_concept": "Measure"
      },
      "placeholders": [
        {
          "name": "parameter",
          "kind": "concept_ref",
          "concept_class": "SharedDimension",
          "concept_constraint": "Parameter",
          "value_source": "user_codelist",
          "render_options": [
            "label",
            "name",
            "name_with_label"
          ],
          "default_render": "name_with_label",
          "required": true
        }
      ]
    },
    {
      "oid": "SP_COVARIATE_SITE",
      "name": "Site covariate",
      "role": "covariate",
      "phrase_template": "adjusting for site",
      "anchors": {
        "produced_concept": "Site"
      },
      "placeholders": []
    }
  ],
  "transformations": [
    {
      "conceptId": "T.BaselineSelection",
      "label": "Baseline Selection",
      "shortLabel": "Baseline",
      "transformationType": "derivation",
      "description": "Identify the baseline record per subject per parameter using M.RecordSelection configured for baseline.",
      "usesMethod": "M.RecordSelection",
      "methodConfigurations": [
        {
          "configurationName": "selection_rule",
          "value": "last_non_missing"
        },
        {
          "configurationName": "scope",
          "value": "pre_treatment"
        },
        {
          "configurationName": "cardinality",
          "value": "single"
        },
        {
          "configurationName": "reference_event",
          "value": "first_dose"
        }
      ],
      "inputDataStructure": {
        "dimensions": [
          {
            "input": "partition",
            "concept": "Subject"
          },
          {
            "input": "partition",
            "conceptCategory": "ParameterDimension"
          },
          {
            "input": "partition",
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "input": "value",
            "concept": "Measure",
            "requiredValueType": null,
            "description": "RecordSelection operates on records, not values — no value type constraint."
          }
        ]
      },
      "outputDataStructure": {
        "dimensions": [
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "output": "flag",
            "concept": "Flag"
          }
        ]
      },
      "validSmartPhrases": []
    },
    {
      "conceptId": "T.ChangeFromBaseline",
      "label": "Change From Baseline",
      "shortLabel": "CFB",
      "transformationType": "derivation",
      "description": "Calculate the arithmetic change from baseline value. Pairs every (Subject, Parameter, Visit) row with its corresponding baseline row (same Subject + Parameter, baseline visit) and subtracts.",
      "usesMethod": "M.Subtraction",
      "methodConfigurations": [],
      "inputDataStructure": {
        "dimensions": [
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "input": "minuend",
            "concept": "Measure",
            "requiredValueType": "Quantity",
            "slice": "endpoint",
            "description": "Current visit value of the endpoint parameter."
          },
          {
            "input": "subtrahend",
            "concept": "Measure",
            "requiredValueType": "Quantity",
            "slice": "parameter_baseline",
            "description": "Baseline-flagged value of the same parameter."
          }
        ],
        "slices": [
          {
            "name": "endpoint",
            "description": "Same parameter as the endpoint, at the endpoint's analysis visit.",
            "constraints": [
              {
                "dimension": "ParameterDimension",
                "value": "{parameter}"
              },
              {
                "dimension": "VisitDimension",
                "value": "{visit}"
              }
            ]
          },
          {
            "name": "parameter_baseline",
            "description": "Same parameter as the endpoint, at the baseline visit.",
            "constraints": [
              {
                "dimension": "ParameterDimension",
                "value": "{parameter}"
              },
              {
                "dimension": "VisitDimension",
                "value": "{baseline_visit}"
              }
            ]
          }
        ]
      },
      "outputDataStructure": {
        "dimensions": [
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "output": "result",
            "concept": "Change"
          }
        ]
      },
      "sliceKeys": [
        {
          "dimension": "ParameterDimension",
          "source": "biomedicalConcept"
        },
        {
          "dimension": "VisitDimension",
          "source": "visit"
        }
      ],
      "validSmartPhrases": [
        "SP_CFB_ENDPOINT",
        "SP_PARAMETER",
        "SP_TIMEPOINT",
        "SP_IMPUTATION"
      ]
    },
    {
      "conceptId": "T.LOCF_Imputation",
      "label": "LOCF Imputation",
      "shortLabel": "LOCF",
      "transformationType": "derivation",
      "description": "Impute missing values by carrying forward the last non-missing observation within each subject-parameter partition, ordered by analysis visit.",
      "usesMethod": "M.ImputedValue_LOCF",
      "methodConfigurations": [],
      "inputDataStructure": {
        "dimensions": [
          {
            "input": "partition",
            "concept": "Subject"
          },
          {
            "input": "partition",
            "conceptCategory": "ParameterDimension"
          },
          {
            "input": "time_order",
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "input": "value",
            "concept": "Measure",
            "requiredValueType": null,
            "description": "LOCF operates on records — value type is pass-through."
          }
        ]
      },
      "outputDataStructure": {
        "dimensions": [
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          }
        ],
        "measures": [
          {
            "output": "imputed_value",
            "concept": "Measure"
          }
        ]
      },
      "validSmartPhrases": [
        "SP_IMPUTATION"
      ]
    },
    {
      "conceptId": "T.CFB_ANCOVA",
      "label": "Change From Baseline ANCOVA",
      "shortLabel": "CFB ANCOVA",
      "transformationType": "analysis",
      "description": "ANCOVA on change from baseline at a specific visit, comparing treatment groups with baseline as covariate.",
      "usesMethod": "M.ANCOVA",
      "methodConfigurations": [
        {
          "configurationName": "ss_type",
          "value": "III"
        }
      ],
      "inputDataStructure": {
        "dimensions": [
          {
            "input": "fixed_effect",
            "concept": "Treatment"
          },
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          },
          {
            "concept": "Population"
          }
        ],
        "measures": [
          {
            "input": "response",
            "concept": "Change",
            "requiredValueType": "Quantity",
            "slice": "endpoint"
          },
          {
            "input": "covariate",
            "concept": "Measure",
            "requiredValueType": "Quantity",
            "slice": "parameter_baseline",
            "description": "Baseline value of the endpoint parameter."
          }
        ],
        "slices": [
          {
            "name": "endpoint",
            "description": "The endpoint's analysis cube: this parameter, this analysis visit, this population.",
            "constraints": [
              {
                "dimension": "ParameterDimension",
                "value": "{parameter}"
              },
              {
                "dimension": "VisitDimension",
                "value": "{visit}"
              },
              {
                "dimension": "Population",
                "value": "{population}"
              }
            ]
          },
          {
            "name": "parameter_baseline",
            "description": "Same parameter and population as the endpoint, but at the baseline visit instead of the analysis visit.",
            "constraints": [
              {
                "dimension": "ParameterDimension",
                "value": "{parameter}"
              },
              {
                "dimension": "VisitDimension",
                "value": "{baseline_visit}"
              },
              {
                "dimension": "Population",
                "value": "{population}"
              }
            ]
          }
        ]
      },
      "outputDataStructure": {
        "dimensions": [
          {
            "concept": "Treatment"
          },
          {
            "concept": "Subject"
          },
          {
            "conceptCategory": "ParameterDimension"
          },
          {
            "conceptCategory": "VisitDimension"
          },
          {
            "concept": "Population"
          }
        ],
        "measures": [
          {
            "output": "ls_means",
            "concept": "LSMeans"
          },
          {
            "output": "contrasts_t",
            "concept": "Contrasts"
          },
          {
            "output": "type3_tests_f",
            "concept": "Type3Tests"
          },
          {
            "output": "parameter_estimates_linear",
            "concept": "ParameterEstimates"
          },
          {
            "output": "fit_statistics_linear",
            "concept": "FitStatistics"
          }
        ]
      },
      "sliceKeys": [
        {
          "dimension": "ParameterDimension",
          "source": "biomedicalConcept"
        },
        {
          "dimension": "VisitDimension",
          "source": "visit"
        },
        {
          "dimension": "Population",
          "source": "population"
        }
      ],
      "validSmartPhrases": [
        "SP_CFB_ENDPOINT",
        "SP_PARAMETER",
        "SP_TIMEPOINT",
        "SP_POPULATION",
        "SP_GROUPING",
        "SP_METHOD_ANCOVA",
        "SP_CONFIDENCE_LEVEL",
        "SP_COVARIATE_BASELINE",
        "SP_COVARIATE_SITE"
      ]
    }
  ],
  "methods": {
    "M.ANCOVA": {
      "$schema": "../../../model/json_schema/acdc_method.schema.json",
      "schema_version": "0.9.1",
      "$vocabulary": {
        "statistics": "../../model/method/statistics_vocabulary.json",
        "output_classes": "../../model/method/output_class_templates.json",
        "formula_grammar": "../../model/method/formula_grammar.json"
      },
      "conceptId": "M.ANCOVA",
      "name": "Analysis of Covariance",
      "label": "ANCOVA",
      "ncitCode": null,
      "description": "Analysis of Covariance - ANOVA with continuous covariate adjustment",
      "formula": {
        "notation": "wilkinson_rogers",
        "default_expression": "response ~ covariate + fixed_effect",
        "generic_expression": "<response> ~ <covariate>* + <fixed_effect>+ + (<fixed_effect>:<fixed_effect>)* + (<covariate>:<fixed_effect>)*",
        "notes": "Covariates adjust the group comparison. Adding covariate:fixed_effect interaction tests homogeneity of regression slopes. Multiple covariates and factors are supported."
      },
      "configurations": [
        {
          "name": "ss_type",
          "dataType": "enum",
          "defaultValue": "III",
          "enumValues": [
            "I",
            "II",
            "III",
            "IV"
          ],
          "description": "Sum of squares type"
        },
        {
          "name": "alpha",
          "conforms_to": "alpha",
          "dataType": "decimal",
          "defaultValue": 0.05,
          "description": "Type I error rate for confidence intervals; 1-alpha is the confidence level."
        }
      ],
      "inputs": [
        {
          "name": "response",
          "dataType": "decimal",
          "required": true,
          "cardinality": "single",
          "description": "The response/dependent variable"
        },
        {
          "name": "covariate",
          "dataType": "decimal",
          "required": false,
          "cardinality": "multiple",
          "description": "Continuous covariate(s) for adjustment (e.g., baseline value, age)"
        },
        {
          "name": "fixed_effect",
          "dataType": "code",
          "required": true,
          "cardinality": "multiple",
          "description": "Grouping/factor variable(s) (e.g., treatment arm, region)"
        }
      ],
      "outputs": [
        {
          "name": "fit_statistics_linear",
          "output_type": "fit_statistics_linear"
        },
        {
          "name": "type3_tests_f",
          "output_type": "type3_tests_f",
          "indexed_by": [
            "covariate",
            "fixed_effect",
            "fixed_effect:fixed_effect",
            "covariate:fixed_effect"
          ]
        },
        {
          "name": "parameter_estimates_linear",
          "output_type": "parameter_estimates_linear",
          "indexed_by": [
            "covariate",
            "fixed_effect",
            "fixed_effect:fixed_effect",
            "covariate:fixed_effect"
          ]
        },
        {
          "name": "ls_means",
          "output_type": "ls_means",
          "indexed_by": [
            "fixed_effect"
          ]
        },
        {
          "name": "contrasts_t",
          "output_type": "contrasts_t",
          "indexed_by": [
            "fixed_effect"
          ]
        }
      ],
      "codings": [
        {
          "system": "http://purl.obolibrary.org/obo/stato",
          "code": "STATO_0000179",
          "display": "ANCOVA"
        }
      ]
    },
    "M.KaplanMeier": {
      "$schema": "../../../model/json_schema/acdc_method.schema.json",
      "schema_version": "0.9.1",
      "$vocabulary": {
        "statistics": "../../model/method/statistics_vocabulary.json",
        "output_classes": "../../model/method/output_class_templates.json",
        "formula_grammar": "../../model/method/formula_grammar.json"
      },
      "conceptId": "M.KaplanMeier",
      "name": "Kaplan-Meier Estimation",
      "label": "KM",
      "ncitCode": null,
      "description": "Non-parametric survival function estimation with optional grouping",
      "formula": {
        "notation": "survival",
        "default_expression": "Surv(time, event) ~ fixed_effect",
        "generic_expression": "Surv(<time>, <event>) ~ <fixed_effect>?",
        "notes": "If no group is specified, estimates a single survival curve. With a group variable, produces stratified curves."
      },
      "configurations": [
        {
          "name": "conf_type",
          "dataType": "enum",
          "defaultValue": "log-log",
          "enumValues": [
            "log-log",
            "log",
            "plain",
            "arcsin"
          ],
          "description": "Confidence interval transformation type"
        }
      ],
      "inputs": [
        {
          "name": "time",
          "dataType": "decimal",
          "required": true,
          "cardinality": "single",
          "description": "Time to event or censoring"
        },
        {
          "name": "event",
          "dataType": "boolean",
          "required": true,
          "cardinality": "single",
          "description": "Event indicator (1=event, 0=censored)"
        },
        {
          "name": "fixed_effect",
          "dataType": "code",
          "required": false,
          "cardinality": "single",
          "description": "Optional grouping variable for stratified curves"
        }
      ],
      "outputs": [
        {
          "name": "event_summary",
          "output_type": "event_summary",
          "indexed_by": [
            "fixed_effect"
          ]
        },
        {
          "name": "survival_table",
          "output_type": "survival_table",
          "indexed_by": [
            "fixed_effect",
            "time"
          ]
        },
        {
          "name": "median_survival",
          "output_type": "median_survival",
          "indexed_by": [
            "fixed_effect"
          ]
        },
        {
          "name": "landmark_estimates",
          "output_type": "landmark_estimates",
          "indexed_by": [
            "fixed_effect",
            "time"
          ]
        }
      ]
    }
  },
  "outputClasses": {
    "ls_means": {
      "conceptId": "ls_means",
      "name": "Least-squares means",
      "label": "Least-squares means",
      "ncitCode": null,
      "codings": [],
      "description": "Least-squares means (adjusted marginal means) per factor level or level combination.",
      "broader": "marginal_estimates",
      "statistics": [
        "estimate",
        "SE",
        "CI_lower",
        "CI_upper",
        "df"
      ]
    },
    "contrasts_t": {
      "conceptId": "contrasts_t",
      "name": "Contrasts from linear models with t-based inference",
      "label": "T-based contrasts",
      "ncitCode": null,
      "codings": [],
      "description": "Contrasts from linear models with t-based inference.",
      "broader": "contrasts",
      "statistics": [
        "estimate",
        "SE",
        "CI_lower",
        "CI_upper",
        "t_statistic",
        "p_value",
        "p_value_adjusted",
        "df"
      ],
      "optional_statistics": [
        "p_value_adjusted"
      ]
    },
    "type3_tests_f": {
      "conceptId": "type3_tests_f",
      "name": "Type III F-tests with sums-of-squares decomposition",
      "label": "Type III F-tests",
      "ncitCode": null,
      "codings": [],
      "description": "Type III F-tests with sums-of-squares decomposition (linear models).",
      "broader": "type3_tests",
      "statistics": [
        "F_statistic",
        "p_value",
        "df_num",
        "df_den",
        "SS",
        "MS"
      ]
    },
    "parameter_estimates_linear": {
      "conceptId": "parameter_estimates_linear",
      "name": "Linear-model coefficients with t-based inference",
      "label": "Linear-model parameter estimates",
      "ncitCode": null,
      "codings": [],
      "description": "Linear-model coefficients with t-based inference.",
      "broader": "parameter_estimates",
      "statistics": [
        "coefficient",
        "SE",
        "t_statistic",
        "p_value",
        "CI_lower",
        "CI_upper",
        "df"
      ]
    },
    "fit_statistics_linear": {
      "conceptId": "fit_statistics_linear",
      "name": "Linear-model fit indices including R-squared",
      "label": "Linear-model fit statistics",
      "ncitCode": null,
      "codings": [],
      "description": "Linear-model fit indices including R-squared.",
      "broader": "fit_statistics",
      "statistics": [
        "AIC",
        "BIC",
        "minus2LogL",
        "R_squared"
      ]
    },
    "median_survival": {
      "conceptId": "median_survival",
      "name": "Median survival time per group",
      "label": "Median survival",
      "ncitCode": null,
      "codings": [],
      "description": "Median survival time per group.",
      "broader": "survival_outputs",
      "statistics": [
        "median",
        "CI_lower",
        "CI_upper"
      ]
    },
    "survival_table": {
      "conceptId": "survival_table",
      "name": "Life table with survival estimates at each event time",
      "label": "Survival table",
      "ncitCode": null,
      "codings": [],
      "description": "Life table with survival estimates at each event time.",
      "broader": "survival_outputs",
      "statistics": [
        "n_risk",
        "n_event",
        "n_censored",
        "survival_prob",
        "SE",
        "CI_lower",
        "CI_upper"
      ]
    },
    "event_summary": {
      "conceptId": "event_summary",
      "name": "Summary counts of events and censoring per group",
      "label": "Event summary",
      "ncitCode": null,
      "codings": [],
      "description": "Summary counts of events and censoring per group.",
      "broader": "survival_outputs",
      "statistics": [
        "n_risk",
        "n_event",
        "n_censored"
      ]
    },
    "landmark_estimates": {
      "conceptId": "landmark_estimates",
      "name": "Survival probability at specific landmark times",
      "label": "Landmark estimates",
      "ncitCode": null,
      "codings": [],
      "description": "Survival probability at specific landmark times.",
      "broader": "survival_outputs",
      "statistics": [
        "survival_prob",
        "SE",
        "CI_lower",
        "CI_upper"
      ]
    }
  }
};
})(typeof window!=='undefined' ? window : globalThis);

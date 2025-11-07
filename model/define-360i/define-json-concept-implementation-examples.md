# Define-JSON: Concept Implementation Examples

## Overview

This document demonstrates how **abstract, linguistic concepts** (ReifiedConcept + ConceptProperty) map to **concrete implementations** (ItemGroup, Item, Method, FormalExpression, Parameter).

**Key Architecture**:
- **Layer 1 (Abstract)**: ReifiedConcept + ConceptProperty = Reusable, domain-agnostic building blocks
- **Layer 2 (Concrete)**: ItemGroup + Item + Method = Study-specific, executable implementations
- **Connection**: `implementsConcept` attribute links concrete to abstract

---

## Building Block Sentence Example

### Natural Language Specification

> **"Test for dose-response relationship using linear model for change in ADAS-Cog (11) Total Score from baseline to Week 24 with dose as continuous predictor adjusting for site group in efficacy population"**

### Sentence Decomposition into Building Blocks

| Phrase Fragment | Building Block | Abstract Concept (ReifiedConcept) | Concrete Implementation |
|-----------------|----------------|-----------------------------------|------------------------|
| "change in ADAS-Cog (11) Total Score from baseline to Week 24" | **BB_OUTCOME_001**: change_from_baseline | BC.CHANGE_FROM_BASELINE | IT.ADQSADAS.CHG (derived from AVAL - BASE) |
| "ADAS-Cog (11) Total Score" | **SLOT**: parameter | PROP.CFB.PARAMETER | PARAMCD = 'ACTOT' |
| "from baseline" | **SLOT**: baseline reference | PROP.CFB.BASELINE_VALUE | IT.ADQSADAS.BASE |
| "to Week 24" | **SLOT**: timepoint | PROP.CFB.TIMEPOINT | AVISIT = 'Week 24' |
| "dose as continuous predictor" | **BB_PREDICTOR_001**: dose_continuous | BC.DOSE_CONTINUOUS | IT.ADSL.TRT01PN (numeric: 0, 5, 10) |
| "adjusting for site group" | **BB_PREDICTOR_003**: covariate_categorical | PROP.LDR.COVARIATES | IT.ADSL.SITEGR1 |
| "using linear model" | **BB_METHOD_001**: linear_model | BC.LINEAR_DOSE_RESPONSE | MTH.LINEAR_MODEL_M021 with GLM/lm/OLS |
| "in efficacy population" | **BB_POPULATION_001**: analysis_population | PROP.LDR.POPULATION | EFFFL = 'Y' (WhereClause) |

### Complete Mapping

```yaml
SENTENCE: "Test for dose-response relationship using linear model for change in 
          ADAS-Cog (11) Total Score from baseline to Week 24 with dose as 
          continuous predictor adjusting for site group in efficacy population"

BUILDING_BLOCKS:
  OUTCOME:
    BLOCK: BB_OUTCOME_001
    PHRASE: "change in {parameter} from baseline to {timepoint}"
    ABSTRACT_CONCEPT: BC.CHANGE_FROM_BASELINE
    SLOTS:
      parameter: "ADAS-Cog (11) Total Score"
      timepoint: "Week 24"
    CONCRETE_IMPLEMENTATION:
      ItemGroup: IG.ADQSADAS
      Item: IT.ADQSADAS.CHG
      Method: MTH.CHANGE_FROM_BASELINE
      Formula: "CHG = AVAL - BASE"
      WhereClause: "AVISIT = 'Week 24' AND PARAMCD = 'ACTOT'"

  PREDICTOR_PRIMARY:
    BLOCK: BB_PREDICTOR_001
    PHRASE: "dose as continuous predictor"
    ABSTRACT_CONCEPT: BC.DOSE_CONTINUOUS
    CONCRETE_IMPLEMENTATION:
      ItemGroup: IG.ADSL
      Item: IT.ADSL.TRT01PN
      DataType: integer
      Values: {0: Placebo, 5: Low Dose, 10: High Dose}

  COVARIATE:
    BLOCK: BB_PREDICTOR_003
    PHRASE: "adjusting for {covariate}"
    ABSTRACT_CONCEPT: PROP.LDR.COVARIATES
    SLOTS:
      covariate: "site group"
    CONCRETE_IMPLEMENTATION:
      ItemGroup: IG.ADSL
      Item: IT.ADSL.SITEGR1
      DataType: text
      CodeList: CL.SITEGR1

  METHOD:
    BLOCK: BB_METHOD_001
    PHRASE: "using linear model"
    ABSTRACT_CONCEPT: BC.LINEAR_DOSE_RESPONSE
    CONCRETE_IMPLEMENTATION:
      Method: MTH.LINEAR_MODEL_M021
      Formula: "CHG ~ TRTPN + SITEGR1"
      Operations:
        - FitLinearModel (OLS)
        - Type III Sum of Squares
      FormalExpressions:
        - R: "lm(CHG ~ TRTPN + SITEGR1, data = analysis_data)"
        - SAS: "PROC GLM ... MODEL CHG = TRTPN SITEGR1 / SS3;"

  POPULATION:
    BLOCK: BB_POPULATION_001
    PHRASE: "in {population_name} population"
    ABSTRACT_CONCEPT: PROP.LDR.POPULATION
    SLOTS:
      population_name: "efficacy"
    CONCRETE_IMPLEMENTATION:
      Item: IT.ADSL.EFFFL
      WhereClause: WC.EFFFL.Y
      Condition: "EFFFL = 'Y'"
```

---

## Example 1: Building Block "Change from Baseline"

### Layer 1: Abstract Concept (ReifiedConcept + ConceptProperty)

This is the **linguistic, reusable, domain-agnostic** representation:

```json
{
  "OID": "BC.CHANGE_FROM_BASELINE",
  "name": "ChangeFromBaseline",
  "label": "Change from Baseline",
  "conceptType": "BiomedicalConcept",
  "description": "The difference between a measurement value at an analysis timepoint and the corresponding baseline value",
  "coding": [{
    "code": "C25492",
    "decode": "Change from Baseline",
    "codeSystem": "NCI",
    "codeSystemVersion": "24.03d"
  }, {
    "code": "STATO_0000175",
    "decode": "difference",
    "codeSystem": "STATO"
  }],
  "properties": [
    {
      "OID": "PROP.CFB.PARAMETER",
      "name": "parameter",
      "label": "Parameter",
      "description": "The measurement being assessed",
      "dataType": "text",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1,
      "purpose": "Identifies what clinical parameter is being measured (e.g., 'ADAS-Cog Total Score', 'Systolic Blood Pressure')"
    },
    {
      "OID": "PROP.CFB.TIMEPOINT",
      "name": "timepoint",
      "label": "Analysis Timepoint",
      "description": "The timepoint at which change is calculated",
      "dataType": "text",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1,
      "codeList": "CL.AVISIT",
      "purpose": "Specifies when the change is measured (e.g., 'Week 24', 'Month 6')"
    },
    {
      "OID": "PROP.CFB.BASELINE_VALUE",
      "name": "baselineValue",
      "label": "Baseline Value",
      "description": "The reference value from which change is calculated",
      "dataType": "float",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1,
      "coding": [{
        "code": "C25616",
        "decode": "Baseline Value",
        "codeSystem": "NCI"
      }]
    },
    {
      "OID": "PROP.CFB.ANALYSIS_VALUE",
      "name": "analysisValue",
      "label": "Analysis Value",
      "description": "The measurement value at the analysis timepoint",
      "dataType": "float",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1
    }
  ],
  "status": "Final"
}
```

### Layer 2: Implementation (ItemGroup + Items + Method)

This is the **concrete, study-specific, executable** implementation:

```json
{
  "itemGroups": [{
    "OID": "IG.ADQSADAS",
    "name": "ADQSADAS",
    "label": "ADAS-Cog Analysis Dataset",
    "domain": "ADAS",
    "type": "Analysis",
    "implementsConcept": "BC.CHANGE_FROM_BASELINE",
    "wasDerivedFrom": "IG.TEMPLATE.BDS",
    "items": [
      {
        "OID": "IT.ADQSADAS.PARAMCD",
        "name": "PARAMCD",
        "label": "Parameter Code",
        "dataType": "text",
        "length": 8,
        "role": "Identifier",
        "mandatory": true,
        "implementsConcept": "PROP.CFB.PARAMETER",
        "codeList": "CL.PARAMCD.ADAS",
        "coding": [{
          "code": "C117221",
          "decode": "Parameter Code",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.ADQSADAS.AVISIT",
        "name": "AVISIT",
        "label": "Analysis Visit",
        "dataType": "text",
        "length": 40,
        "role": "Timing",
        "mandatory": true,
        "implementsConcept": "PROP.CFB.TIMEPOINT",
        "codeList": "CL.AVISIT",
        "coding": [{
          "code": "C117466",
          "decode": "Analysis Visit",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.ADQSADAS.BASE",
        "name": "BASE",
        "label": "Baseline Value",
        "dataType": "float",
        "role": "Qualifier",
        "mandatory": false,
        "implementsConcept": "PROP.CFB.BASELINE_VALUE",
        "origin": {
          "type": "Derived",
          "sourceItems": [{"OID": "IT.ADQSADAS.AVAL"}],
          "method": "MTH.BASELINE"
        },
        "coding": [{
          "code": "C25616",
          "decode": "Baseline Value",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.ADQSADAS.AVAL",
        "name": "AVAL",
        "label": "Analysis Value",
        "dataType": "float",
        "role": "Qualifier",
        "mandatory": false,
        "implementsConcept": "PROP.CFB.ANALYSIS_VALUE",
        "origin": {
          "type": "Derived",
          "source": "Sponsor",
          "sourceItems": [{"OID": "IT.QS.QSSTRESN"}],
          "method": "MTH.SDTM_TO_AVAL"
        },
        "coding": [{
          "code": "C117221",
          "decode": "Analysis Value",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.ADQSADAS.CHG",
        "name": "CHG",
        "label": "Change from Baseline",
        "dataType": "float",
        "role": "Qualifier",
        "mandatory": false,
        "implementsConcept": "BC.CHANGE_FROM_BASELINE",
        "origin": {
          "type": "Derived",
          "sourceItems": [
            {"OID": "IT.ADQSADAS.AVAL"},
            {"OID": "IT.ADQSADAS.BASE"}
          ],
          "method": "MTH.CHANGE_FROM_BASELINE"
        },
        "coding": [{
          "code": "C25492",
          "decode": "Change from Baseline",
          "codeSystem": "NCI"
        }, {
          "code": "STATO_0000175",
          "decode": "difference",
          "codeSystem": "STATO"
        }]
      }
    ]
  }],
  
  "methods": [{
    "OID": "MTH.CHANGE_FROM_BASELINE",
    "name": "ChangeFromBaseline",
    "label": "Calculate Change from Baseline",
    "type": "Computation",
    "implementsConcept": "BC.CHANGE_FROM_BASELINE",
    "description": "Subtract baseline value from analysis value to calculate change",
    "expressions": [
      {
        "context": "Python",
        "expression": "df['CHG'] = df['AVAL'] - df['BASE']",
        "parameters": [
          {
            "OID": "PARAM.CHG.MINUEND",
            "name": "minuend",
            "description": "Analysis value (AVAL)",
            "source": "IT.ADQSADAS.AVAL"
          },
          {
            "OID": "PARAM.CHG.SUBTRAHEND",
            "name": "subtrahend",
            "description": "Baseline value (BASE)",
            "source": "IT.ADQSADAS.BASE"
          }
        ]
      },
      {
        "context": "SAS",
        "expression": "CHG = AVAL - BASE;",
        "parameters": [
          {
            "OID": "PARAM.CHG.AVAL",
            "name": "AVAL",
            "source": "IT.ADQSADAS.AVAL"
          },
          {
            "OID": "PARAM.CHG.BASE",
            "name": "BASE",
            "source": "IT.ADQSADAS.BASE"
          }
        ]
      },
      {
        "context": "R",
        "expression": "CHG <- AVAL - BASE",
        "parameters": [
          {
            "OID": "PARAM.CHG.AVAL",
            "name": "AVAL",
            "source": "IT.ADQSADAS.AVAL"
          },
          {
            "OID": "PARAM.CHG.BASE",
            "name": "BASE",
            "source": "IT.ADQSADAS.BASE"
          }
        ]
      }
    ]
  }],
  
  "relationships": [{
    "OID": "REL.CHG.AVAL",
    "subject": "IT.ADQSADAS.CHG",
    "object": "IT.ADQSADAS.AVAL",
    "predicateTerm": "IS_DERIVED_FROM",
    "linkingPhrase": "is calculated by subtracting baseline from"
  }, {
    "OID": "REL.CHG.BASE",
    "subject": "IT.ADQSADAS.CHG",
    "object": "IT.ADQSADAS.BASE",
    "predicateTerm": "IS_DERIVED_FROM",
    "linkingPhrase": "is calculated by subtracting"
  }]
}
```

---

## Example 2: "Dose as Continuous Predictor" Building Block

### Layer 1: Abstract Concept

```json
{
  "OID": "BC.DOSE_CONTINUOUS",
  "name": "DoseContinuousPredictor",
  "label": "Dose as Continuous Predictor",
  "conceptType": "AnalysisConcept",
  "description": "Treatment dose modeled as a continuous numeric variable in regression models to assess dose-response relationships",
  "coding": [{
    "code": "STATO_0000468",
    "decode": "covariate",
    "codeSystem": "STATO"
  }],
  "properties": [
    {
      "OID": "PROP.DOSE.TREATMENT",
      "name": "treatment",
      "label": "Treatment",
      "description": "The therapeutic intervention whose dose is being assessed",
      "dataType": "text",
      "mandatory": true,
      "purpose": "Identifies the specific drug or intervention"
    },
    {
      "OID": "PROP.DOSE.DOSE_LEVEL",
      "name": "doseLevel",
      "label": "Dose Level",
      "description": "Numeric representation of dose amount",
      "dataType": "float",
      "mandatory": true,
      "purpose": "Quantifies the dose amount as a continuous variable"
    },
    {
      "OID": "PROP.DOSE.DOSE_UNIT",
      "name": "doseUnit",
      "label": "Dose Unit",
      "description": "Unit of measure for dose",
      "dataType": "text",
      "mandatory": true,
      "codeList": "CL.UNIT",
      "purpose": "Specifies measurement unit (e.g., 'mg', 'mg/kg')"
    }
  ],
  "status": "Final"
}
```

### Layer 2: Implementation

```json
{
  "itemGroups": [{
    "OID": "IG.ADSL",
    "name": "ADSL",
    "label": "Subject-Level Analysis Dataset",
    "type": "Analysis",
    "items": [
      {
        "OID": "IT.ADSL.TRT01A",
        "name": "TRT01A",
        "label": "Actual Treatment for Period 01",
        "dataType": "text",
        "length": 40,
        "role": "RecordQualifier",
        "implementsConcept": "PROP.DOSE.TREATMENT",
        "codeList": "CL.TRT01A",
        "coding": [{
          "code": "C117464",
          "decode": "Treatment",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.ADSL.TRT01PN",
        "name": "TRT01PN",
        "label": "Planned Treatment for Period 01 (N)",
        "dataType": "integer",
        "role": "RecordQualifier",
        "implementsConcept": "PROP.DOSE.DOSE_LEVEL",
        "description": "Numeric code for planned treatment: 0=Placebo, 5=Low Dose (5mg), 10=High Dose (10mg)",
        "origin": {
          "type": "Assigned",
          "source": "Sponsor"
        },
        "codeList": "CL.TRT01PN",
        "coding": [{
          "code": "C117464",
          "decode": "Planned Treatment",
          "codeSystem": "NCI"
        }]
      }
    ]
  }],
  
  "codeLists": [{
    "OID": "CL.TRT01PN",
    "name": "TRT01PN",
    "label": "Planned Treatment (Numeric)",
    "dataType": "integer",
    "codeListType": "Decoded",
    "isExtensible": false,
    "implementsConcept": "PROP.DOSE.DOSE_LEVEL",
    "codeListItems": [
      {
        "codedValue": "0",
        "decode": "Placebo",
        "coding": [{
          "code": "C49487",
          "decode": "Placebo",
          "codeSystem": "NCI"
        }]
      },
      {
        "codedValue": "5",
        "decode": "Xanomeline Low Dose (5 mg)",
        "coding": [{
          "code": "C25473",
          "decode": "Dose",
          "codeSystem": "NCI"
        }]
      },
      {
        "codedValue": "10",
        "decode": "Xanomeline High Dose (10 mg)",
        "coding": [{
          "code": "C25473",
          "decode": "Dose",
          "codeSystem": "NCI"
        }]
      }
    ]
  }]
}
```

---

## Example 3: Complete Analysis - "Linear Model for Dose Response"

### Layer 1: Abstract Concept (Analysis Building Block)

```json
{
  "OID": "BC.LINEAR_DOSE_RESPONSE",
  "name": "LinearDoseResponseAnalysis",
  "label": "Linear Model for Dose-Response Analysis",
  "conceptType": "AnalysisConcept",
  "description": "Statistical analysis testing for linear relationship between continuous dose and clinical outcome, adjusting for covariates",
  "coding": [{
    "code": "STATO_0000251",
    "decode": "continuous data",
    "codeSystem": "STATO"
  }, {
    "code": "STATO_0000464",
    "decode": "linear model",
    "codeSystem": "STATO"
  }],
  "properties": [
    {
      "OID": "PROP.LDR.OUTCOME",
      "name": "outcome",
      "label": "Outcome Variable",
      "description": "The dependent variable being modeled",
      "dataType": "float",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1,
      "coding": [{
        "code": "STATO_0000251",
        "decode": "continuous data",
        "codeSystem": "STATO"
      }]
    },
    {
      "OID": "PROP.LDR.DOSE",
      "name": "dose",
      "label": "Dose Predictor",
      "description": "Continuous dose variable (primary predictor of interest)",
      "dataType": "float",
      "mandatory": true,
      "minOccurs": 1,
      "maxOccurs": 1,
      "wasDerivedFrom": "BC.DOSE_CONTINUOUS"
    },
    {
      "OID": "PROP.LDR.COVARIATES",
      "name": "covariates",
      "label": "Adjustment Covariates",
      "description": "Additional variables included for statistical adjustment",
      "dataType": "text",
      "mandatory": false,
      "minOccurs": 0,
      "purpose": "Variables to control for potential confounding (e.g., site, baseline)"
    },
    {
      "OID": "PROP.LDR.POPULATION",
      "name": "population",
      "label": "Analysis Population",
      "description": "Subject population for analysis",
      "dataType": "text",
      "mandatory": true,
      "codeList": "CL.POPULATION",
      "purpose": "Defines which subjects are included (e.g., Efficacy, Safety, ITT)"
    }
  ],
  "status": "Final"
}
```

### Layer 2: Implementation (Complete Study Analysis)

```json
{
  "OID": "MDV.DOSE_RESPONSE.v1",
  "name": "DoseResponseAnalysis",
  "label": "ADAS-Cog Dose-Response Analysis Metadata",
  
  "itemGroups": [{
    "OID": "IG.ANALYSIS.M021",
    "name": "M_AC_021",
    "label": "Dose-Response Linear Model",
    "type": "Analysis",
    "implementsConcept": "BC.LINEAR_DOSE_RESPONSE",
    "description": "Test for dose-response relationship using linear model for change in ADAS-Cog (11) Total Score from baseline to Week 24",
    
    "items": [
      {
        "OID": "IT.M021.CHG",
        "name": "CHG",
        "label": "Change from Baseline",
        "dataType": "float",
        "role": "Outcome",
        "implementsConcept": "PROP.LDR.OUTCOME",
        "mandatory": true,
        "origin": {
          "type": "Derived",
          "source": "Sponsor",
          "sourceItems": [{"OID": "IT.ADQSADAS.CHG"}],
          "method": "MTH.CHANGE_FROM_BASELINE"
        },
        "whereClauses": ["WC.WEEK24.ACTOT"],
        "coding": [{
          "code": "C25492",
          "decode": "Change from Baseline",
          "codeSystem": "NCI"
        }]
      },
      {
        "OID": "IT.M021.TRTPN",
        "name": "TRTPN",
        "label": "Planned Treatment (N)",
        "dataType": "float",
        "role": "FixedEffect",
        "implementsConcept": "PROP.LDR.DOSE",
        "mandatory": true,
        "origin": {
          "type": "Assigned",
          "source": "Sponsor",
          "sourceItems": [{"OID": "IT.ADSL.TRT01PN"}]
        },
        "description": "Dose coded as 0 (Placebo), 5 (Low Dose), 10 (High Dose)",
        "coding": [{
          "code": "STATO_0000468",
          "decode": "covariate",
          "codeSystem": "STATO"
        }]
      },
      {
        "OID": "IT.M021.SITEGR1",
        "name": "SITEGR1",
        "label": "Pooled Site Group 1",
        "dataType": "text",
        "length": 12,
        "role": "FixedEffect",
        "implementsConcept": "PROP.LDR.COVARIATES",
        "mandatory": false,
        "origin": {
          "type": "Derived",
          "source": "Sponsor",
          "sourceItems": [{"OID": "IT.ADSL.SITEID"}],
          "method": "MTH.SITE_POOLING"
        },
        "codeList": "CL.SITEGR1"
      },
      {
        "OID": "IT.M021.EFFFL",
        "name": "EFFFL",
        "label": "Efficacy Population Flag",
        "dataType": "text",
        "length": 1,
        "role": "PopulationFlag",
        "implementsConcept": "PROP.LDR.POPULATION",
        "mandatory": true,
        "origin": {
          "type": "Derived",
          "source": "Sponsor"
        },
        "codeList": "CL.NY",
        "whereClauses": ["WC.EFFFL.Y"]
      }
    ],
    
    "whereClauses": [
      {
        "OID": "WC.WEEK24.ACTOT",
        "label": "Week 24 ADAS-Cog Total",
        "conditions": [{
          "OID": "COND.WEEK24",
          "rangeChecks": [{
            "comparator": "EQ",
            "itemOID": "IT.ADQSADAS.AVISIT",
            "checkValue": "Week 24"
          }]
        }, {
          "OID": "COND.ACTOT",
          "rangeChecks": [{
            "comparator": "EQ",
            "itemOID": "IT.ADQSADAS.PARAMCD",
            "checkValue": "ACTOT"
          }]
        }]
      },
      {
        "OID": "WC.EFFFL.Y",
        "label": "Efficacy Population",
        "conditions": [{
          "OID": "COND.EFFFL",
          "rangeChecks": [{
            "comparator": "EQ",
            "itemOID": "IT.ADSL.EFFFL",
            "checkValue": "Y"
          }]
        }]
      }
    ]
  }],
  
  "methods": [{
    "OID": "MTH.LINEAR_MODEL_M021",
    "name": "LinearModelDoseResponse",
    "label": "Linear Model for Dose-Response",
    "type": "Analysis",
    "implementsConcept": "BC.LINEAR_DOSE_RESPONSE",
    "description": "Fit linear regression model with dose as continuous predictor, adjusting for site group",
    
    "expressions": [
      {
        "context": "R",
        "expression": "lm(CHG ~ TRTPN + SITEGR1, data = analysis_data)",
        "parameters": [
          {
            "OID": "PARAM.LM.OUTCOME",
            "name": "outcome",
            "description": "Dependent Variable",
            "source": "IT.M021.CHG",
            "implementsConcept": "PROP.LDR.OUTCOME"
          },
          {
            "OID": "PARAM.LM.PREDICTOR",
            "name": "predictor",
            "description": "Primary Predictor",
            "source": "IT.M021.TRTPN",
            "implementsConcept": "PROP.LDR.DOSE"
          },
          {
            "OID": "PARAM.LM.COVARIATE",
            "name": "covariate",
            "description": "Adjustment Covariate",
            "source": "IT.M021.SITEGR1",
            "implementsConcept": "PROP.LDR.COVARIATES"
          }
        ]
      },
      {
        "context": "SAS",
        "expression": "PROC GLM DATA=analysis_data;\n  CLASS SITEGR1;\n  MODEL CHG = TRTPN SITEGR1 / SOLUTION SS3;\n  ODS OUTPUT ParameterEstimates=param_est ModelANOVA=anova;\nRUN;",
        "parameters": [
          {
            "OID": "PARAM.LM.TEST_TYPE",
            "name": "testType",
            "description": "Hypothesis Test Type",
            "value": "Type III SS"
          }
        ]
      },
      {
        "context": "Python",
        "expression": "import statsmodels.formula.api as smf\nmodel = smf.ols('CHG ~ TRTPN + C(SITEGR1)', data=analysis_data).fit()",
        "parameters": [
          {
            "OID": "PARAM.LM.METHOD",
            "name": "method",
            "description": "Estimation Method",
            "value": "OLS"
          }
        ]
      }
    ],
    "documents": [{
      "OID": "DOC.SAP.M021",
      "title": "Statistical Analysis Plan Section 9.4.3",
      "pages": {"pageRefs": ["Section 9.4.3"]}
    }]
  }],
  
  "relationships": [
    {
      "OID": "REL.M021.OUTCOME.CHG",
      "subject": "IT.M021.CHG",
      "object": "BC.CHANGE_FROM_BASELINE",
      "predicateTerm": "IMPLEMENTS",
      "linkingPhrase": "implements the biomedical concept"
    },
    {
      "OID": "REL.M021.DOSE.CONTINUOUS",
      "subject": "IT.M021.TRTPN",
      "object": "BC.DOSE_CONTINUOUS",
      "predicateTerm": "IMPLEMENTS",
      "linkingPhrase": "implements the analysis concept"
    },
    {
      "OID": "REL.M021.METHOD",
      "subject": "MTH.LINEAR_MODEL_M021",
      "object": "BC.LINEAR_DOSE_RESPONSE",
      "predicateTerm": "IMPLEMENTS",
      "linkingPhrase": "implements the statistical method"
    }
  ],
  
  "codeLists": [{
    "OID": "CL.POPULATION",
    "name": "AnalysisPopulation",
    "label": "Analysis Population",
    "dataType": "text",
    "codeListType": "Decoded",
    "codeListItems": [
      {
        "codedValue": "EFFICACY",
        "decode": "Efficacy Population",
        "coding": [{
          "code": "C98703",
          "decode": "Efficacy Population",
          "codeSystem": "NCI"
        }]
      },
      {
        "codedValue": "SAFETY",
        "decode": "Safety Population",
        "coding": [{
          "code": "C53523",
          "decode": "Safety Population",
          "codeSystem": "NCI"
        }]
      }
    ]
  }]
}
```

---

## Summary: The Two-Layer Architecture

### Abstract Layer (ReifiedConcept + ConceptProperty)

**Purpose**: Domain-agnostic, linguistic, reusable concepts

**What it contains**:
- Conceptual names and descriptions
- Semantic coding (STATO, NCI)
- Properties with constraints (minOccurs, maxOccurs)
- Data type specifications
- Relationships to other concepts

**Who uses it**:
- Standards bodies
- Template designers
- Cross-study comparisons
- Semantic interoperability

**Advantage**: Same concept can be implemented differently across studies while maintaining semantic equivalence

### Implementation Layer (ItemGroup + Item + Method)

**Purpose**: Concrete, executable, study-specific structures

**What it contains**:
- Actual datasets and variables
- Derivation code (multiple languages)
- Selection criteria (WhereClauses)
- Population definitions
- Computational methods with parameters

**Who uses it**:
- Programmers
- Statisticians
- Regulatory reviewers
- Data analysts

**Advantage**: Full traceability from abstract concept to specific implementation

### The Connection

- **`implementsConcept`**: Links concrete Items/Methods back to abstract ReifiedConcepts
- **`wasDerivedFrom`**: Tracks template inheritance and provenance
- **`relationships`**: Documents semantic links explicitly with predicates
- **Multiple implementations**: Different studies can implement the same BC/DEC differently while maintaining semantic interoperability

---

## Key Design Patterns

### Pattern 1: Concept Property → Item Implementation

```
ConceptProperty                     Item
----------------                    ----------------
PROP.CFB.PARAMETER         →        IT.ADQSADAS.PARAMCD
  dataType: text                      dataType: text
  mandatory: true                     mandatory: true
  purpose: "Identifies parameter"     implementsConcept: "PROP.CFB.PARAMETER"
```

### Pattern 2: Building Block → Method Implementation

```
ReifiedConcept                      Method
----------------                    ----------------
BC.CHANGE_FROM_BASELINE    →        MTH.CHANGE_FROM_BASELINE
  conceptType: BiomedicalConcept      type: Computation
  properties: [baseline, aval]        implementsConcept: "BC.CHANGE_FROM_BASELINE"
                                      formalExpressions: [Python, SAS, R]
```

### Pattern 3: Analysis Concept → Analysis ItemGroup

```
ReifiedConcept                      ItemGroup
----------------                    ----------------
BC.LINEAR_DOSE_RESPONSE    →        IG.ANALYSIS.M021
  conceptType: AnalysisConcept        type: Analysis
  properties: [outcome, dose,         implementsConcept: "BC.LINEAR_DOSE_RESPONSE"
               covariates, pop]       items: [CHG, TRTPN, SITEGR1, EFFFL]
```

---

## Benefits of This Architecture

1. **Semantic Clarity**: Abstract layer provides unambiguous meaning
2. **Reusability**: Same concept used across multiple studies
3. **Traceability**: Clear linkage from abstract to concrete
4. **Multi-implementation**: Different studies implement differently
5. **Standards Alignment**: Mapping to STATO, NCI, CDISC ontologies
6. **Code Generation**: Concrete layer contains executable specifications
7. **Regulatory Submission**: Both layers support submission requirements
8. **Cross-study Analysis**: Abstract layer enables meta-analysis

---

## Version History

- **v1.0** (2025-11-07): Initial comprehensive examples with sentence decomposition

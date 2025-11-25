# Define-JSON Schema Extensions for Semantic Analysis Concepts

## Overview

This document describes the extensions to the Define-JSON specification (https://temeta.github.io/define-json/) needed to support a semantically rich analysis concept model. These extensions enable:

1. Composition of analysis sentences from reusable building blocks
2. Semantic traceability from specifications to implementations
3. Explicit data requirements with semantic roles
4. Method specifications with implementations
5. Bidirectional parameter mappings between building blocks and concept inputs/outputs

## Base Define-JSON Concepts

The Define-JSON specification provides:
- **AnalysisSet**: Filtered dataset for analysis
- **Analysis**: Analysis definition with methods
- **ReferencedAnalysisOperation**: Method references
- **FormalExpression**: Computational expressions
- **ItemGroupDef**: Dataset definitions
- **ItemDef**: Variable definitions

Our extensions build upon these base concepts to add semantic richness and library reusability.

---

## Extension 1: Building Blocks (Phrase Templates)

### Purpose
Enable sentence composition from reusable phrase templates with named parameters.

### Schema Extension

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "description": "string (optional)",
  "template": "string (required)",
  "semanticRole": "string (required)",
  "parameters": [
    {
      "name": "string (required)",
      "dataType": "string (required)",
      "description": "string (optional)",
      "allowedValues": ["string"] (optional)
    }
  ],
  "exampleUsage": "string (optional)",
  "mappedDataConcepts": ["string (OID references)"] (optional)
}
```

### Key Properties

- **template**: Phrase pattern with `{parameter}` placeholders
  - Example: `"change in {parameter} from baseline to {timepoint}"`

- **semanticRole**: Grammatical/semantic function in analysis sentence
  - Examples: `"outcome_specification"`, `"method_specification"`, `"covariate_specification"`

- **parameters**: Named placeholders that get instantiated in study-specific usage
  - Can map to either inputs OR outputs depending on context

- **mappedDataConcepts**: OID references to DataConcept nodes that this building block semantically relates to

### Rationale

Building blocks enable:
1. **Composability**: Analysts compose sentences from pre-defined, validated phrases
2. **Consistency**: Same phrase used consistently across analyses
3. **Validation**: System can validate sentence structure against requirements
4. **Flexibility**: Parameters allow customization while maintaining structure

### Example

```json
{
  "OID": "BB.OUTCOME.CHANGE_PARAM_TIME",
  "name": "Outcome: Change in Parameter from Baseline to Timepoint",
  "description": "Building block for specifying change from baseline outcome",
  "template": "change in {parameter} from baseline to {timepoint}",
  "semanticRole": "outcome_specification",
  "parameters": [
    {
      "name": "parameter",
      "dataType": "string",
      "description": "Name of the parameter being analyzed (e.g., ADAS-Cog, blood pressure)"
    },
    {
      "name": "timepoint",
      "dataType": "string",
      "description": "Analysis timepoint (e.g., Week 24, end of study)"
    }
  ],
  "exampleUsage": "change in ADAS-Cog from baseline to Week 24",
  "mappedDataConcepts": ["DC.CHANGE.FROM.BASELINE"]
}
```

---

## Extension 2: Enriched ReifiedConcepts (Analysis Concepts)

### Purpose
Define reusable analysis patterns with rich semantic structure including required building blocks, inputs, outputs, and methods.

### Schema Extension to ReferencedAnalysisOperation

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "description": "string (required)",
  "purpose": "string (optional)",
  "label": "string (optional)",
  "statoIRI": "string (optional)",

  // EXTENSION: Required Building Blocks
  "requiredBuildingBlocks": [
    {
      "buildingBlockOID": "string (required)",
      "semanticRole": "string (required)",
      "description": "string (optional)",
      "required": "boolean (default: true)",

      // EXTENSION: Parameter Mappings (bidirectional)
      "parameterMappings": [
        {
          "buildingBlockParameter": "string (required)",
          "mapsToInput": "string (OID reference, optional)",
          "mapsToOutput": "string (OID reference, optional)",
          "mappingType": "string (required)",
          "description": "string (optional)"
        }
      ]
    }
  ],

  // EXTENSION: Semantic Input Specifications
  "inputs": [
    {
      "OID": "string (required)",
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "dataConceptOID": "string (optional)",
      "required": "boolean (default: true)",
      "statoIRI": "string (optional)"
    }
  ],

  // EXTENSION: Semantic Output Specifications
  "outputs": [
    {
      "OID": "string (required)",
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "interpretation": "string (optional)",
      "dataConceptOID": "string (optional)",
      "statoIRI": "string (optional)"
    }
  ],

  // EXTENSION: Method References with Context
  "methodReferences": [
    {
      "methodOID": "string (required)",
      "semanticRole": "string (required)",
      "description": "string (optional)"
    }
  ],

  // EXTENSION: Required Data Concepts
  "requiredDataConcepts": [
    {
      "dataConceptOID": "string (required)",
      "semanticRole": "string (required)",
      "description": "string (optional)"
    }
  ]
}
```

### Key Extensions

#### 1. requiredBuildingBlocks
Declares which phrase templates must be present in analysis sentence.

**Properties:**
- `buildingBlockOID`: Reference to BuildingBlock
- `semanticRole`: Role this building block plays in the analysis
- `parameterMappings`: **Critical bidirectional mapping** between building block parameters and concept inputs/outputs

#### 2. parameterMappings (Most Important Extension)

Explicitly links building block parameters to concept inputs OR outputs.

**Why Bidirectional?**
- Some building block parameters **provide inputs** to the analysis
  - Example: `{parameter}` in "change in {parameter}" → provides the outcome input
- Other building block parameters **describe outputs** from the analysis
  - Example: `{statistic}` in "report {statistic}" → describes what output to produce

**Properties:**
- `buildingBlockParameter`: Name of parameter in building block template
- `mapsToInput`: OID of ConceptInput that this parameter provides (optional)
- `mapsToOutput`: OID of ConceptOutput that this parameter describes (optional)
- `mappingType`: `"provides_input"` or `"describes_output"`
- `description`: Explanation of the mapping

**Graph Relationships Created:**
- `(:BuildingBlock)-[:PROVIDES_INPUT {buildingBlockParameter, mappingType, description}]->(:ConceptInput)`
- `(:BuildingBlock)-[:DESCRIBES_OUTPUT {buildingBlockParameter, mappingType, description}]->(:ConceptOutput)`

#### 3. inputs with Semantic Roles

Each input specifies:
- **semanticRole**: Statistical role in analysis
  - Examples: `"dependent_variable"`, `"primary_predictor"`, `"confounding_adjuster"`
- **dataConceptOID**: Link to abstract data concept definition
- **statoIRI**: STATO ontology term for semantic interoperability

#### 4. outputs with Semantic Roles and Interpretations

Each output specifies:
- **semanticRole**: Type of statistical evidence
  - Examples: `"statistical_evidence"`, `"effect_estimate"`, `"model_fit"`
- **interpretation**: How to interpret the result
  - Example: `"P-value < 0.05 indicates significant linear dose-response relationship"`
- **statoIRI**: STATO ontology term

### Rationale

These extensions enable:
1. **Validation**: System validates sentence contains all required building blocks
2. **Data Requirements**: Automatically derive data requirements from inputs
3. **Traceability**: Complete path from specification to implementation
4. **Code Generation**: Method references + inputs/outputs → executable code
5. **Bidirectional Mapping**: Building blocks can provide inputs OR describe outputs contextually

### Example

```json
{
  "OID": "AC.DOSE.RESPONSE.LINEAR",
  "name": "Linear Dose-Response Test",
  "description": "Test for linear relationship between continuous dose and outcome",
  "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251",

  "requiredBuildingBlocks": [
    {
      "buildingBlockOID": "BB.OUTCOME.CHANGE_PARAM_TIME",
      "semanticRole": "outcome_specification",
      "description": "Requires specification of outcome endpoint with timepoint",
      "parameterMappings": [
        {
          "buildingBlockParameter": "parameter",
          "mapsToInput": "AC.DOSE.RESPONSE.LINEAR.INPUT.OUTCOME",
          "mappingType": "provides_input",
          "description": "The parameter name maps to the outcome endpoint input"
        }
      ]
    },
    {
      "buildingBlockOID": "BB.METHOD.TEST_RELATIONSHIP",
      "semanticRole": "method_specification",
      "description": "Requires specification of statistical test method",
      "parameterMappings": [
        {
          "buildingBlockParameter": "method",
          "mapsToInput": "AC.DOSE.RESPONSE.LINEAR.INPUT.METHOD_NAME",
          "mappingType": "provides_input",
          "description": "The method name specifies which test to use"
        }
      ]
    }
  ],

  "inputs": [
    {
      "OID": "AC.DOSE.RESPONSE.LINEAR.INPUT.OUTCOME",
      "name": "Outcome Endpoint",
      "description": "Change from baseline in continuous outcome measure",
      "semanticRole": "dependent_variable",
      "dataConceptOID": "DC.CHANGE.FROM.BASELINE",
      "required": true,
      "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251"
    },
    {
      "OID": "AC.DOSE.RESPONSE.LINEAR.INPUT.DOSE",
      "name": "Dose as Continuous Predictor",
      "description": "Administered dose treated as continuous variable",
      "semanticRole": "primary_predictor",
      "dataConceptOID": "DC.DOSE.EXPOSURE",
      "required": true,
      "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251"
    }
  ],

  "outputs": [
    {
      "OID": "AC.DOSE.RESPONSE.LINEAR.OUTPUT.PVALUE",
      "name": "P-value for Dose Coefficient",
      "description": "P-value testing null hypothesis that dose coefficient = 0",
      "semanticRole": "statistical_evidence",
      "interpretation": "P-value < 0.05 indicates significant linear dose-response relationship",
      "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251"
    }
  ],

  "methodReferences": [
    {
      "methodOID": "METHOD.LINEAR.REGRESSION",
      "semanticRole": "primary_statistical_method",
      "description": "Linear regression model for dose-response analysis"
    }
  ],

  "requiredDataConcepts": [
    {
      "dataConceptOID": "DC.CHANGE.FROM.BASELINE",
      "semanticRole": "dependent_variable",
      "description": "Outcome must be change from baseline"
    },
    {
      "dataConceptOID": "DC.DOSE.EXPOSURE",
      "semanticRole": "primary_predictor",
      "description": "Dose as continuous variable"
    }
  ]
}
```

---

## Extension 3: Data Concepts (Semantic Data Definitions)

### Purpose
Define semantic meaning of data elements with derivation logic and method references.

### Schema Extension

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "description": "string (required)",
  "semanticRole": "string (required)",
  "adClass": "string (optional)",
  "statoIRI": "string (optional)",

  // EXTENSION: Input Specifications
  "inputs": [
    {
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "dataType": "string (required)",
      "adClass": "string (optional)"
    }
  ],

  // EXTENSION: Output Specifications
  "outputs": [
    {
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "dataType": "string (required)",
      "adClass": "string (optional)"
    }
  ],

  // EXTENSION: Derivation Method
  "derivationMethod": {
    "methodOID": "string (required)",
    "formula": "string (optional)",
    "description": "string (optional)"
  }
}
```

### Key Properties

- **semanticRole**: Abstract role independent of implementation
  - Examples: `"dependent_variable"`, `"baseline_covariate"`, `"population_filter"`

- **adClass**: ADaM IG class alignment
  - Examples: `"TIMING"`, `"DERIVATION"`, `"IDENTIFIER"`

- **inputs/outputs**: Explicit data lineage with semantic roles

- **derivationMethod**: Link to method that computes this concept

### Rationale

Data concepts enable:
1. **Semantic Abstraction**: Separate "what" (change from baseline) from "how" (CHG variable)
2. **Derivation Logic**: Explicit formulas and method references
3. **ADaM Alignment**: Map semantic concepts to ADaM IG classes
4. **Reusability**: Same concept used across multiple analyses

### Example

```json
{
  "OID": "DC.CHANGE.FROM.BASELINE",
  "name": "Change from Baseline",
  "description": "Change in parameter value from baseline to analysis timepoint",
  "semanticRole": "dependent_variable",
  "adClass": "DERIVATION",
  "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251",

  "inputs": [
    {
      "name": "Analysis Value",
      "description": "Parameter value at analysis timepoint",
      "semanticRole": "analysis_timepoint_value",
      "dataType": "float",
      "adClass": "OCCURRENCE"
    },
    {
      "name": "Baseline Value",
      "description": "Parameter value at baseline",
      "semanticRole": "baseline_value",
      "dataType": "float",
      "adClass": "TIMING"
    }
  ],

  "outputs": [
    {
      "name": "Change from Baseline",
      "description": "Computed change value (analysis - baseline)",
      "semanticRole": "derived_change",
      "dataType": "float",
      "adClass": "DERIVATION"
    }
  ],

  "derivationMethod": {
    "methodOID": "METHOD.SUBTRACTION",
    "formula": "AVAL - BASE",
    "description": "Simple subtraction of baseline from analysis value"
  }
}
```

---

## Extension 4: Method Specifications with Implementations

### Purpose
Define statistical and derivation methods with rich specifications and multi-language implementations.

### Schema Extension

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "description": "string (required)",
  "methodCategory": "string (required)",
  "statoIRI": "string (optional)",

  // EXTENSION: Method Parameters with Semantic Roles
  "parameters": [
    {
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "dataType": "string (required)",
      "required": "boolean (default: true)"
    }
  ],

  // EXTENSION: Model Specification
  "modelSpecification": {
    "type": "string (required)",
    "formula": "string (optional)",
    "description": "string (optional)"
  },

  // EXTENSION: Assumptions
  "assumptions": ["string"],

  // EXTENSION: Output Definitions
  "outputDefinitions": [
    {
      "name": "string (required)",
      "description": "string (required)",
      "semanticRole": "string (required)",
      "dataType": "string (required)"
    }
  ],

  // EXTENSION: Multi-language Implementations
  "implementations": [
    {
      "language": "string (required)",
      "code": "string (required)",
      "description": "string (optional)"
    }
  ]
}
```

### Key Extensions

- **parameters**: Method inputs with semantic roles
  - Enables validation that required parameters are provided

- **modelSpecification**: Formal model structure
  - Example: `"type": "linear_model"`, `"formula": "Y ~ X + covariates"`

- **assumptions**: Statistical assumptions
  - Example: `"Residuals are normally distributed"`

- **outputDefinitions**: Expected outputs with semantic roles
  - Enables validation that analysis produces expected results

- **implementations**: Code in multiple languages (R, SAS, Python)
  - Enables cross-platform execution

### Rationale

Method specifications enable:
1. **Code Generation**: Template code for multiple languages
2. **Validation**: Check parameters and outputs match expectations
3. **Documentation**: Assumptions and model structure explicit
4. **Reusability**: Same method used across analyses

### Example

```json
{
  "OID": "METHOD.LINEAR.REGRESSION",
  "name": "Linear Regression",
  "description": "General linear model using ordinary least squares estimation",
  "methodCategory": "statistical_test",
  "statoIRI": "http://purl.obolibrary.org/obo/STATO_0000251",

  "parameters": [
    {
      "name": "dependent_variable",
      "description": "Outcome variable to be predicted",
      "semanticRole": "dependent_variable",
      "dataType": "float",
      "required": true
    },
    {
      "name": "independent_variables",
      "description": "Predictor variables",
      "semanticRole": "predictor_variable",
      "dataType": "list",
      "required": true
    }
  ],

  "modelSpecification": {
    "type": "linear_model",
    "formula": "Y ~ X1 + X2 + ... + Xn",
    "description": "Fits linear relationship between dependent and independent variables"
  },

  "assumptions": [
    "Linear relationship between predictors and outcome",
    "Independence of observations",
    "Homoscedasticity of residuals",
    "Residuals are normally distributed"
  ],

  "outputDefinitions": [
    {
      "name": "coefficients",
      "description": "Estimated regression coefficients",
      "semanticRole": "effect_estimate",
      "dataType": "float"
    },
    {
      "name": "p_values",
      "description": "P-values for coefficient tests",
      "semanticRole": "statistical_evidence",
      "dataType": "float"
    }
  ],

  "implementations": [
    {
      "language": "R",
      "code": "lm(dependent_variable ~ independent_variables, data = dataset)",
      "description": "R implementation using lm() function"
    },
    {
      "language": "SAS",
      "code": "PROC GLM DATA=dataset; MODEL dependent_variable = independent_variables; RUN;",
      "description": "SAS implementation using PROC GLM"
    },
    {
      "language": "Python",
      "code": "from sklearn.linear_model import LinearRegression\nmodel = LinearRegression()\nmodel.fit(X, y)",
      "description": "Python implementation using scikit-learn"
    }
  ]
}
```

---

## Extension 5: Study Instance Enhancements

### Purpose
Add semantic bindings between study-specific items and abstract library concepts.

### Schema Extension to ItemDef

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "dataType": "string (required)",

  // EXTENSION: Concept Implementation
  "implementsConcept": {
    "dataConceptOID": "string (required)",
    "semanticRole": "string (required)",
    "description": "string (optional)"
  },

  // EXTENSION: Semantic Properties
  "semanticRole": "string (optional)",
  "adClass": "string (optional)",
  "statoIRI": "string (optional)"
}
```

### Schema Extension to Analysis

```json
{
  "OID": "string (required)",
  "name": "string (required)",
  "description": "string (required)",

  // EXTENSION: Template Instantiation
  "instantiates": {
    "analysisConceptOID": "string (required)",
    "description": "string (optional)"
  },

  // EXTENSION: Sentence Composition
  "sentenceComposition": [
    {
      "buildingBlockOID": "string (required)",
      "composedPhrase": "string (required)",
      "parameterBindings": {
        "parameterName": "value"
      }
    }
  ]
}
```

### Key Extensions

- **implementsConcept**: Links ItemDef to abstract DataConcept
  - Enables validation that all required concepts are implemented

- **instantiates**: Links Analysis to abstract AnalysisConcept template
  - Enables traceability and validation

- **sentenceComposition**: Shows how building blocks were composed
  - Enables regeneration of analysis sentence
  - Shows parameter bindings

### Example

```json
{
  "OID": "ANALYSIS.STUDY001.ANA-001",
  "name": "Dose-Response Test for ADAS-Cog",
  "description": "Test for linear dose-response relationship",

  "instantiates": {
    "analysisConceptOID": "AC.DOSE.RESPONSE.LINEAR",
    "description": "Instantiates linear dose-response analysis concept"
  },

  "sentenceComposition": [
    {
      "buildingBlockOID": "BB.OUTCOME.CHANGE_PARAM_TIME",
      "composedPhrase": "change in ADAS-Cog from baseline to Week 24",
      "parameterBindings": {
        "parameter": "ADAS-Cog",
        "timepoint": "Week 24"
      }
    },
    {
      "buildingBlockOID": "BB.METHOD.TEST_RELATIONSHIP",
      "composedPhrase": "test for linear relationship using regression",
      "parameterBindings": {
        "relationship": "linear relationship",
        "method": "regression"
      }
    }
  ],

  "itemGroups": [
    {
      "OID": "IG.ADQSADAS",
      "name": "ADQSADAS",
      "items": [
        {
          "OID": "IT.ADQSADAS.CHG",
          "name": "CHG",
          "dataType": "float",
          "implementsConcept": {
            "dataConceptOID": "DC.CHANGE.FROM.BASELINE",
            "semanticRole": "dependent_variable",
            "description": "Change from baseline in ADAS-Cog score"
          },
          "semanticRole": "dependent_variable",
          "adClass": "DERIVATION"
        },
        {
          "OID": "IT.ADQSADAS.DOSE",
          "name": "DOSE",
          "dataType": "float",
          "implementsConcept": {
            "dataConceptOID": "DC.DOSE.EXPOSURE",
            "semanticRole": "primary_predictor",
            "description": "Administered dose as continuous predictor"
          },
          "semanticRole": "primary_predictor",
          "adClass": "INTERVENTION"
        }
      ]
    }
  ]
}
```

---

## ReifiedConcept Inheritance Hierarchy

All reified concepts (AnalysisConcept, DataConcept, BuildingBlock) inherit from an abstract **ReifiedConcept** base, enabling property inheritance similar to object-oriented class hierarchies.

### Inheritance Pattern

```
ReifiedConcept (abstract base)
├── AnalysisConcept (statistical analysis specification)
├── DataConcept (abstract data semantic)
└── BuildingBlock (phrase template)
```

### Base Properties (Shared by All Concepts)

All reified concepts share these common properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `OID` | string | Yes | Unique identifier with type-specific prefix (`AC.`, `DC.`, `BB.`) |
| `name` | string | Yes | Human-readable name |
| `description` | string | No | Detailed description of the concept |
| `conceptType` | enum | Yes | Type discriminator: `"analysis_concept"`, `"data_concept"`, or `"building_block"` |
| `semanticRole` | string | Yes | Domain-specific role (enum varies by concept type) |
| `label` | string | No | Short display label |
| `statoIRI` | string (URI) | No | STATO ontology IRI reference for statistical concepts |

### Type-Specific Properties

Each concept type extends the base with specialized properties:

#### AnalysisConcept-Specific Properties

| Property | Type | Description |
|----------|------|-------------|
| `purpose` | string | Analysis purpose (e.g., "Hypothesis test for dose-response") |
| `requiredBuildingBlocks` | array | References to BuildingBlock templates needed for composition |
| `inputs` | array | Typed input specifications with statistical semantics |
| `outputs` | array | Typed output specifications with statistical semantics |
| `methodRef` | string | Reference to statistical method definition |
| `requiresPopulation` | boolean | Whether population specification is required |
| `allowedDataConcepts` | array | Data concepts compatible with this analysis |

#### DataConcept-Specific Properties

| Property | Type | Description |
|----------|------|-------------|
| `adClass` | string | ADaM variable class (e.g., "CHG", "BASE", "AVAL") |
| `dataType` | string | Expected data type ("float", "integer", "text", "date") |
| `derivationMethod` | object | Optional derivation specification for computed concepts |
| `mapsToVariable` | array | SDTM/ADaM variable names implementing this concept |
| `inputs` | array | Input specifications for derived concepts (data semantics) |
| `outputs` | array | Output specifications for derived concepts (data semantics) |

#### BuildingBlock-Specific Properties

| Property | Type | Description |
|----------|------|-------------|
| `template` | string | Phrase template with parameter placeholders |
| `parameters` | array | Template parameter definitions with semantic types |
| `mapsToDataConcept` | string/array | Data concepts required by this phrase |
| `requiresAnalysisConcept` | array | Analysis concepts that can use this building block |
| `examples` | array | Example instantiations of the template |

### Implementation in Different Systems

#### JSON Files (Type Discriminator Pattern)

In JSON files, use the `conceptType` property to distinguish between types:

```json
{
  "OID": "AC.ANCOVA.TREATMENT.COMPARISON",
  "conceptType": "analysis_concept",
  "name": "ANCOVA Treatment Comparison",
  "semanticRole": "hypothesis_test",
  "purpose": "Compare treatment groups adjusting for baseline",
  "inputs": [...],
  "outputs": [...]
}
```

#### Neo4j (Multi-Label Pattern)

In Neo4j, use multiple labels to represent inheritance:

```cypher
CREATE (ac:AnalysisConcept:ReifiedConcept {
  OID: "AC.ANCOVA.TREATMENT.COMPARISON",
  conceptType: "analysis_concept",
  name: "ANCOVA Treatment Comparison"
})
```

This enables inheritance queries:
```cypher
// Find all reified concepts
MATCH (rc:ReifiedConcept) RETURN rc

// Find only analysis concepts
MATCH (ac:AnalysisConcept) RETURN ac
```

#### Python (Class Inheritance with Pydantic)

Python validation models use actual class inheritance:

```python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class ReifiedConcept(BaseModel):
    """Abstract base for all reified concepts"""
    OID: str
    name: str
    description: Optional[str] = None
    conceptType: Literal["analysis_concept", "data_concept", "building_block"]
    semanticRole: str
    label: Optional[str] = None
    statoIRI: Optional[str] = None

class AnalysisConcept(ReifiedConcept):
    conceptType: Literal["analysis_concept"] = "analysis_concept"
    purpose: str
    inputs: List[ConceptInput]
    outputs: List[ConceptOutput]
    # ... other analysis-specific properties

class DataConcept(ReifiedConcept):
    conceptType: Literal["data_concept"] = "data_concept"
    adClass: Optional[str] = None
    dataType: Optional[str] = None
    # ... other data-specific properties

class BuildingBlock(ReifiedConcept):
    conceptType: Literal["building_block"] = "building_block"
    template: str
    parameters: List[TemplateParameter]
    # ... other template-specific properties
```

### Benefits of Inheritance Hierarchy

1. **Property Reuse**: Base properties (OID, name, description) defined once and inherited by all types
2. **Type Safety**: Type discriminator enables validation and type-specific processing
3. **Semantic Clarity**: Explicit hierarchy shows relationships between concept types
4. **Query Flexibility**: Neo4j multi-labels enable queries at any level of abstraction
5. **Tool Support**: Pydantic models provide IDE autocomplete and type checking
6. **Extensibility**: New concept types can be added by extending ReifiedConcept base

---

## JSON Schema Definitions

This section provides formal JSON Schema (draft-07) definitions for all extensions to enable validation and tool implementation.

### Complete Schema for Building Block

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BuildingBlock",
  "description": "Reusable phrase template for analysis sentence composition",
  "type": "object",
  "required": ["OID", "name", "template", "semanticRole"],
  "properties": {
    "OID": {
      "type": "string",
      "description": "Unique identifier for the building block",
      "pattern": "^BB\\."
    },
    "name": {
      "type": "string",
      "description": "Human-readable name"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the building block purpose"
    },
    "template": {
      "type": "string",
      "description": "Phrase template with {parameter} placeholders",
      "pattern": "\\{[^}]+\\}"
    },
    "semanticRole": {
      "type": "string",
      "description": "Grammatical/semantic function in analysis sentence",
      "enum": [
        "outcome_specification",
        "method_specification",
        "predictor_specification",
        "covariate_specification",
        "population_specification",
        "timepoint_specification",
        "grouping_specification"
      ]
    },
    "parameters": {
      "type": "array",
      "description": "Named parameters in the template",
      "items": {
        "type": "object",
        "required": ["name", "dataType"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Parameter name (must match placeholder in template)"
          },
          "dataType": {
            "type": "string",
            "description": "Data type of parameter value",
            "enum": ["string", "integer", "float", "boolean", "date", "datetime", "list"]
          },
          "description": {
            "type": "string",
            "description": "Description of what this parameter represents"
          },
          "allowedValues": {
            "type": "array",
            "description": "Optional enumeration of allowed values",
            "items": {"type": "string"}
          }
        }
      }
    },
    "exampleUsage": {
      "type": "string",
      "description": "Example of building block with parameters filled in"
    },
    "mappedDataConcepts": {
      "type": "array",
      "description": "OID references to related DataConcept nodes",
      "items": {
        "type": "string",
        "pattern": "^DC\\."
      }
    }
  }
}
```

### Complete Schema for Analysis Concept (ReferencedAnalysisOperation Extension)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AnalysisConcept",
  "description": "Reusable analysis pattern with semantic structure",
  "type": "object",
  "required": ["OID", "name", "description", "semanticRole"],
  "properties": {
    "OID": {
      "type": "string",
      "description": "Unique identifier for the analysis concept",
      "pattern": "^AC\\."
    },
    "name": {
      "type": "string",
      "description": "Human-readable name"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the analysis pattern"
    },
    "purpose": {
      "type": "string",
      "description": "High-level purpose of this analysis"
    },
    "label": {
      "type": "string",
      "description": "Short label for display"
    },
    "conceptType": {
      "type": "string",
      "description": "Type of concept",
      "enum": ["analysis_concept", "reified_concept"]
    },
    "semanticRole": {
      "type": "string",
      "description": "Statistical/analytical role",
      "enum": [
        "statistical_analysis_pattern",
        "descriptive_analysis_pattern",
        "exploratory_analysis_pattern",
        "confirmatory_analysis_pattern"
      ]
    },
    "statoIRI": {
      "type": "string",
      "description": "STATO ontology IRI",
      "format": "uri"
    },
    "requiredBuildingBlocks": {
      "type": "array",
      "description": "Building blocks required for this analysis",
      "items": {
        "type": "object",
        "required": ["buildingBlockOID", "semanticRole"],
        "properties": {
          "buildingBlockOID": {
            "type": "string",
            "description": "Reference to BuildingBlock",
            "pattern": "^BB\\."
          },
          "semanticRole": {
            "type": "string",
            "description": "Role this building block plays"
          },
          "description": {
            "type": "string",
            "description": "Why this building block is required"
          },
          "required": {
            "type": "boolean",
            "description": "Whether this building block is mandatory",
            "default": true
          },
          "parameterMappings": {
            "type": "array",
            "description": "Mappings between building block parameters and concept inputs/outputs",
            "items": {
              "type": "object",
              "required": ["buildingBlockParameter", "mappingType"],
              "properties": {
                "buildingBlockParameter": {
                  "type": "string",
                  "description": "Name of parameter in building block template"
                },
                "mapsToInput": {
                  "type": "string",
                  "description": "OID of ConceptInput this parameter provides",
                  "pattern": "^AC\\..+\\.INPUT\\."
                },
                "mapsToOutput": {
                  "type": "string",
                  "description": "OID of ConceptOutput this parameter describes",
                  "pattern": "^AC\\..+\\.OUTPUT\\."
                },
                "mappingType": {
                  "type": "string",
                  "description": "Type of mapping",
                  "enum": ["provides_input", "describes_output"]
                },
                "description": {
                  "type": "string",
                  "description": "Explanation of the mapping"
                }
              },
              "oneOf": [
                {"required": ["mapsToInput"]},
                {"required": ["mapsToOutput"]}
              ]
            }
          }
        }
      }
    },
    "inputs": {
      "type": "array",
      "description": "Semantic input specifications",
      "items": {
        "type": "object",
        "required": ["OID", "name", "description", "semanticRole"],
        "properties": {
          "OID": {
            "type": "string",
            "description": "Unique identifier for this input",
            "pattern": "^AC\\..+\\.INPUT\\."
          },
          "name": {
            "type": "string",
            "description": "Input name"
          },
          "description": {
            "type": "string",
            "description": "Detailed description"
          },
          "semanticRole": {
            "type": "string",
            "description": "Statistical role in analysis",
            "enum": [
              "dependent_variable",
              "primary_predictor",
              "secondary_predictor",
              "confounding_adjuster",
              "adjustment_variable",
              "baseline_covariate",
              "population_filter",
              "stratification_variable",
              "temporal_selector",
              "measurement_identifier",
              "analysis_set_selector"
            ]
          },
          "dataType": {
            "type": "string",
            "description": "Expected data type",
            "enum": ["string", "integer", "float", "boolean", "date", "datetime", "categorical", "continuous"]
          },
          "semanticType": {
            "type": "string",
            "description": "Ontology type URI (e.g., STATO, OBI)",
            "format": "uri"
          },
          "dataConceptOID": {
            "type": "string",
            "description": "Reference to abstract DataConcept",
            "pattern": "^DC\\."
          },
          "implementsConcept": {
            "type": "string",
            "description": "Alternative reference to concept implementation",
            "pattern": "^DC\\."
          },
          "required": {
            "type": "boolean",
            "description": "Whether this input is mandatory",
            "default": true
          },
          "cardinality": {
            "type": "string",
            "description": "Input cardinality (e.g., 1, 0..1, 1..*, 0..*)",
            "pattern": "^(\\d+\\.\\.[\\d*]|[01])$"
          },
          "statoIRI": {
            "type": "string",
            "description": "STATO ontology IRI",
            "format": "uri"
          }
        }
      }
    },
    "outputs": {
      "type": "array",
      "description": "Semantic output specifications",
      "items": {
        "type": "object",
        "required": ["OID", "name", "description", "semanticRole"],
        "properties": {
          "OID": {
            "type": "string",
            "description": "Unique identifier for this output",
            "pattern": "^AC\\..+\\.OUTPUT\\."
          },
          "name": {
            "type": "string",
            "description": "Output name"
          },
          "description": {
            "type": "string",
            "description": "Detailed description"
          },
          "semanticRole": {
            "type": "string",
            "description": "Type of statistical evidence",
            "enum": [
              "statistical_evidence",
              "effect_estimate",
              "uncertainty_estimate",
              "confidence_interval",
              "interval_estimate",
              "model_fit",
              "quality_metric",
              "diagnostic"
            ]
          },
          "dataType": {
            "type": "string",
            "description": "Output data type",
            "enum": ["string", "integer", "float", "boolean", "date", "datetime", "categorical", "continuous"]
          },
          "semanticType": {
            "type": "string",
            "description": "Ontology type URI (e.g., STATO, OBI)",
            "format": "uri"
          },
          "interpretation": {
            "type": "string",
            "description": "How to interpret this output"
          },
          "dataConceptOID": {
            "type": "string",
            "description": "Reference to abstract DataConcept",
            "pattern": "^DC\\."
          },
          "statoIRI": {
            "type": "string",
            "description": "STATO ontology IRI",
            "format": "uri"
          }
        }
      }
    },
    "methodReferences": {
      "type": "array",
      "description": "Methods used in this analysis",
      "items": {
        "type": "object",
        "required": ["methodOID", "semanticRole"],
        "properties": {
          "methodOID": {
            "type": "string",
            "description": "Reference to Method",
            "pattern": "^METHOD\\."
          },
          "semanticRole": {
            "type": "string",
            "description": "Role this method plays",
            "enum": [
              "primary_statistical_method",
              "secondary_statistical_method",
              "sensitivity_analysis",
              "derivation_method",
              "imputation_method",
              "estimation_method"
            ]
          },
          "description": {
            "type": "string",
            "description": "Why this method is referenced"
          }
        }
      }
    },
    "requiredDataConcepts": {
      "type": "array",
      "description": "Data concepts required for this analysis",
      "items": {
        "type": "object",
        "required": ["dataConceptOID", "semanticRole"],
        "properties": {
          "dataConceptOID": {
            "type": "string",
            "description": "Reference to DataConcept",
            "pattern": "^DC\\."
          },
          "semanticRole": {
            "type": "string",
            "description": "Role this data concept plays"
          },
          "description": {
            "type": "string",
            "description": "Why this data concept is required"
          }
        }
      }
    }
  }
}
```

### Complete Schema for Data Concept

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DataConcept",
  "description": "Semantic definition of data element with derivation logic",
  "type": "object",
  "required": ["OID", "name", "description", "semanticRole"],
  "properties": {
    "OID": {
      "type": "string",
      "description": "Unique identifier for the data concept",
      "pattern": "^DC\\."
    },
    "name": {
      "type": "string",
      "description": "Human-readable name"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the data concept"
    },
    "semanticRole": {
      "type": "string",
      "description": "Abstract role independent of implementation",
      "enum": [
        "dependent_variable",
        "primary_predictor",
        "baseline_covariate",
        "population_filter",
        "stratification_variable",
        "derived_variable",
        "measurement_value"
      ]
    },
    "adClass": {
      "type": "string",
      "description": "ADaM Implementation Guide class",
      "enum": [
        "TIMING",
        "DERIVATION",
        "IDENTIFIER",
        "OCCURRENCE",
        "INTERVENTION",
        "CATEGORIZATION",
        "RELATIONSHIP"
      ]
    },
    "statoIRI": {
      "type": "string",
      "description": "STATO ontology IRI",
      "format": "uri"
    },
    "inputs": {
      "type": "array",
      "description": "Input specifications for this concept",
      "items": {
        "type": "object",
        "required": ["name", "description", "semanticRole", "dataType"],
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "semanticRole": {"type": "string"},
          "dataType": {
            "type": "string",
            "enum": ["string", "integer", "float", "boolean", "date", "datetime"]
          },
          "adClass": {"type": "string"}
        }
      }
    },
    "outputs": {
      "type": "array",
      "description": "Output specifications for this concept",
      "items": {
        "type": "object",
        "required": ["name", "description", "semanticRole", "dataType"],
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "semanticRole": {"type": "string"},
          "dataType": {
            "type": "string",
            "enum": ["string", "integer", "float", "boolean", "date", "datetime"]
          },
          "adClass": {"type": "string"}
        }
      }
    },
    "derivationMethod": {
      "type": "object",
      "description": "Method that computes this concept",
      "required": ["methodOID"],
      "properties": {
        "methodOID": {
          "type": "string",
          "description": "Reference to Method",
          "pattern": "^METHOD\\."
        },
        "formula": {
          "type": "string",
          "description": "Computational formula"
        },
        "description": {
          "type": "string",
          "description": "Description of derivation"
        }
      }
    }
  }
}
```

### Complete Schema for Method

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Method",
  "description": "Statistical or derivation method with implementations",
  "type": "object",
  "required": ["OID", "name", "description", "methodCategory"],
  "properties": {
    "OID": {
      "type": "string",
      "description": "Unique identifier for the method",
      "pattern": "^METHOD\\."
    },
    "name": {
      "type": "string",
      "description": "Human-readable name"
    },
    "description": {
      "type": "string",
      "description": "Detailed description of the method"
    },
    "methodCategory": {
      "type": "string",
      "description": "Category of method",
      "enum": [
        "statistical_test",
        "estimation_method",
        "descriptive_method",
        "derivation_method",
        "imputation_method",
        "simulation_method"
      ]
    },
    "methodType": {
      "type": "string",
      "description": "Specific type within category",
      "enum": [
        "linear_model",
        "generalized_linear_model",
        "mixed_effects_model",
        "survival_analysis",
        "non_parametric_test",
        "bayesian_method",
        "arithmetic_operation",
        "logical_operation"
      ]
    },
    "statoIRI": {
      "type": "string",
      "description": "STATO ontology IRI",
      "format": "uri"
    },
    "parameters": {
      "type": "array",
      "description": "Method parameters with semantic roles",
      "items": {
        "type": "object",
        "required": ["name", "description", "semanticRole", "dataType"],
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "semanticRole": {
            "type": "string",
            "enum": [
              "dependent_variable",
              "predictor_variable",
              "covariate",
              "weight_variable",
              "grouping_variable"
            ]
          },
          "dataType": {
            "type": "string",
            "enum": ["string", "integer", "float", "boolean", "list", "matrix"]
          },
          "required": {
            "type": "boolean",
            "default": true
          }
        }
      }
    },
    "modelSpecification": {
      "type": "object",
      "description": "Formal model structure",
      "required": ["type"],
      "properties": {
        "type": {
          "type": "string",
          "description": "Model type",
          "enum": [
            "linear_model",
            "generalized_linear_model",
            "mixed_effects_model",
            "survival_model",
            "arithmetic_expression",
            "logical_expression"
          ]
        },
        "formula": {
          "type": "string",
          "description": "Model formula (e.g., Y ~ X1 + X2)"
        },
        "description": {
          "type": "string",
          "description": "Description of model"
        }
      }
    },
    "assumptions": {
      "type": "array",
      "description": "Statistical assumptions",
      "items": {"type": "string"}
    },
    "outputDefinitions": {
      "type": "array",
      "description": "Expected outputs with semantic roles",
      "items": {
        "type": "object",
        "required": ["name", "description", "semanticRole", "dataType"],
        "properties": {
          "name": {"type": "string"},
          "description": {"type": "string"},
          "semanticRole": {
            "type": "string",
            "enum": [
              "effect_estimate",
              "statistical_evidence",
              "uncertainty_estimate",
              "model_fit",
              "diagnostic"
            ]
          },
          "dataType": {
            "type": "string",
            "enum": ["string", "integer", "float", "boolean", "list", "matrix"]
          }
        }
      }
    },
    "implementations": {
      "type": "array",
      "description": "Code implementations in multiple languages",
      "items": {
        "type": "object",
        "required": ["language", "code"],
        "properties": {
          "language": {
            "type": "string",
            "description": "Programming language",
            "enum": ["R", "SAS", "Python", "Julia", "MATLAB"]
          },
          "code": {
            "type": "string",
            "description": "Implementation code"
          },
          "description": {
            "type": "string",
            "description": "Description of implementation"
          }
        }
      }
    }
  }
}
```

### Schema Extensions for Study Instances

#### ItemDef Extension

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ItemDefExtension",
  "description": "Extensions to ItemDef for concept implementation",
  "type": "object",
  "properties": {
    "implementsConcept": {
      "description": "Reference to abstract DataConcept(s) that this item implements. Follows base Define-JSON specification pattern using simple string references.",
      "oneOf": [
        {
          "type": "string",
          "description": "Single DataConcept reference",
          "pattern": "^DC\\."
        },
        {
          "type": "array",
          "description": "Multiple DataConcept references",
          "items": {
            "type": "string",
            "pattern": "^DC\\."
          }
        }
      ]
    },
    "semanticRole": {
      "type": "string",
      "description": "Semantic role of this item"
    },
    "semanticType": {
      "type": "string",
      "description": "Ontology type URI",
      "format": "uri"
    },
    "adClass": {
      "type": "string",
      "description": "ADaM IG class"
    },
    "statoIRI": {
      "type": "string",
      "description": "STATO ontology IRI",
      "format": "uri"
    }
  }
}
```

#### Analysis Extension

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AnalysisExtension",
  "description": "Extensions to Analysis for template instantiation",
  "type": "object",
  "properties": {
    "instantiates": {
      "type": "object",
      "description": "Links this analysis to abstract AnalysisConcept",
      "required": ["analysisConceptOID"],
      "properties": {
        "analysisConceptOID": {
          "type": "string",
          "description": "Reference to AnalysisConcept",
          "pattern": "^AC\\."
        },
        "description": {
          "type": "string",
          "description": "Description of instantiation"
        }
      }
    },
    "sentenceComposition": {
      "type": "array",
      "description": "How building blocks were composed into analysis sentence",
      "items": {
        "type": "object",
        "required": ["buildingBlockOID", "composedPhrase"],
        "properties": {
          "buildingBlockOID": {
            "type": "string",
            "description": "Reference to BuildingBlock",
            "pattern": "^BB\\."
          },
          "composedPhrase": {
            "type": "string",
            "description": "Instantiated phrase with parameters filled in"
          },
          "parameterBindings": {
            "type": "object",
            "description": "Parameter name to value mappings",
            "additionalProperties": {
              "type": "string"
            }
          }
        }
      }
    }
  }
}
```

---

## Neo4j Graph Relationships

The extensions enable creation of rich graph relationships in Neo4j:

### Library Relationships

1. **REQUIRES_BUILDING_BLOCK**: `(:AnalysisConcept)-[:REQUIRES_BUILDING_BLOCK {semanticRole}]->(:BuildingBlock)`
2. **REQUIRES_DATA_CONCEPT**: `(:AnalysisConcept)-[:REQUIRES_DATA_CONCEPT {semanticRole}]->(:DataConcept)`
   - Aggregate-level relationship showing all DataConcepts required by an AnalysisConcept
3. **USES_METHOD**: `(:AnalysisConcept)-[:USES_METHOD {semanticRole}]->(:Method)`
4. **MAPS_TO_CONCEPT**: `(:BuildingBlock)-[:MAPS_TO_CONCEPT]->(:DataConcept)`
5. **DERIVED_BY_METHOD**: `(:DataConcept)-[:DERIVED_BY_METHOD {formula}]->(:Method)`

### Parameter Mapping Relationships (New)

6. **PROVIDES_INPUT**: `(:BuildingBlock)-[:PROVIDES_INPUT {buildingBlockParameter, mappingType, description}]->(:ConceptInput)`
   - Created when `parameterMappings.mapsToInput` is specified

7. **DESCRIBES_OUTPUT**: `(:BuildingBlock)-[:DESCRIBES_OUTPUT {buildingBlockParameter, mappingType, description}]->(:ConceptOutput)`
   - Created when `parameterMappings.mapsToOutput` is specified

### ConceptInput/ConceptOutput Relationships

8. **IMPLEMENTS_CONCEPT**: `(:ConceptInput)-[:IMPLEMENTS_CONCEPT {semanticRole}]->(:DataConcept)`
   - Granular-level relationship showing which specific ConceptInput implements which DataConcept
   - Complements the aggregate-level REQUIRES_DATA_CONCEPT relationship
   - Created from the `implementsConcept` property on input specifications
   - Enables queries like "which inputs implement DC.CHANGE.FROM.BASELINE?" or "what DataConcept does this input implement?"

### Study Instance Relationships

9. **INSTANTIATES**: `(:StudyAnalysis)-[:INSTANTIATES]->(:AnalysisConcept)`
10. **IMPLEMENTS_CONCEPT**: `(:Item)-[:IMPLEMENTS_CONCEPT {semanticRole}]->(:DataConcept)`
    - Study-level relationship: dataset variables (Items) implementing abstract DataConcepts
11. **USES_METHOD**: `(:StudyAnalysis)-[:USES_METHOD]->(:Method)`

---

## Semantic Role Vocabulary

### Input/Output Semantic Roles

- `dependent_variable`: Outcome being predicted or analyzed
- `primary_predictor`: Main predictor of interest
- `confounding_adjuster`: Covariate adjusted for confounding
- `adjustment_variable`: General adjustment covariate
- `baseline_covariate`: Baseline measurement as covariate
- `population_filter`: Filter defining analysis population
- `stratification_variable`: Variable for stratified analysis

### Output Semantic Roles

- `statistical_evidence`: P-values, test statistics
- `effect_estimate`: Coefficients, effect sizes
- `confidence_interval`: Interval estimates
- `model_fit`: R-squared, AIC, BIC
- `diagnostic`: Residual plots, assumption checks

### Method Semantic Roles

- `primary_statistical_method`: Main analysis method
- `sensitivity_analysis`: Alternative method for robustness
- `derivation_method`: Method for computing derived variables

---

## Implementation Notes

### JSON Storage
- Extensions are stored in JSON files following Define-JSON structure
- Parameter mappings stored as arrays within `requiredBuildingBlocks`
- Relationships are implicit in OID references

### Neo4j Storage
- JSON data loaded into Neo4j graph database
- OID references converted to graph relationships
- Parameter mappings create explicit `PROVIDES_INPUT` and `DESCRIBES_OUTPUT` relationships
- Enables complex traversal queries and validation

### Validation
- System validates study analyses have all required building blocks
- System validates all required inputs are implemented by items
- System validates formal expressions reference valid items
- System validates parameter mappings are bidirectionally consistent

---

## Benefits of Extensions

### 1. Composability
Building blocks enable sentence composition while maintaining semantic structure.

### 2. Validation
Rich semantic annotations enable automated validation:
- Required building blocks present?
- Required data concepts implemented?
- Formal expressions reference valid items?
- Parameter mappings consistent?

### 3. Traceability
Complete path from specification to implementation:
- Analysis → AnalysisConcept → BuildingBlocks → DataConcepts → Methods → Items

### 4. Code Generation
Method implementations + formal expressions → executable code in R/SAS/Python

### 5. Interoperability
- STATO ontology integration for semantic alignment
- ADaM IG alignment via adClass properties
- Define-JSON compliance for regulatory submissions

### 6. Reusability
Library concepts are abstract and reusable across studies.

---

## Compatibility with Define-JSON

All extensions are **additive** and maintain backward compatibility:
- Base Define-JSON properties unchanged
- Extensions use new properties that can be ignored by non-aware systems
- Standard Define-JSON tools can still process base structure
- Extended tools gain semantic richness and validation capabilities

---

## Example Use Cases

### Use Case 1: Validate Study Analysis
```cypher
// Find required vs. implemented data concepts
MATCH (sa:StudyAnalysis)-[:INSTANTIATES]->(ac:AnalysisConcept)
MATCH (ac)-[:REQUIRES_DATA_CONCEPT]->(dc:DataConcept)
OPTIONAL MATCH (sa)-[:HAS_ANALYSIS_SET]->(:AnalysisSet)-[:FILTERS]->(ig:ItemGroup)
OPTIONAL MATCH (ig)-[:CONTAINS_ITEM]->(it:Item)-[:IMPLEMENTS_CONCEPT]->(dc)
RETURN dc.name as RequiredConcept,
       CASE WHEN it IS NOT NULL THEN 'SATISFIED' ELSE 'MISSING' END as Status
```

### Use Case 2: Trace Building Block to Implementation
```cypher
// Show how building block parameter maps to item
MATCH (bb:BuildingBlock)-[:PROVIDES_INPUT {buildingBlockParameter: 'parameter'}]->(ci:ConceptInput)
MATCH (ci)<-[:HAS_INPUT]-(ac:AnalysisConcept)
MATCH (sa:StudyAnalysis)-[:INSTANTIATES]->(ac)
MATCH (sa)-[:HAS_ANALYSIS_SET]->(:AnalysisSet)-[:FILTERS]->(ig:ItemGroup)
MATCH (ig)-[:CONTAINS_ITEM]->(it:Item)-[:IMPLEMENTS_CONCEPT]->(dc:DataConcept)
WHERE dc.OID = ci.dataConceptOID
RETURN bb.name as BuildingBlock,
       bb.template as Template,
       ci.name as Input,
       it.name as ImplementedBy
```

### Use Case 3: Generate Analysis Code
```cypher
// Get method implementation for study analysis
MATCH (sa:StudyAnalysis)-[:USES_METHOD]->(m:Method)
MATCH (sa)-[:HAS_EXPRESSION]->(fe:FormalExpression)
WHERE sa.OID = 'ANALYSIS.STUDY001.ANA-001'
RETURN m.name as Method,
       fe.expression as Formula,
       [impl IN m.implementations WHERE impl.language = 'R' | impl.code][0] as RCode
```

---

## Future Enhancements

### 1. Natural Language Processing
Auto-parse sentences to identify building blocks and parameters.

### 2. Automated Code Generation
Generate executable code from formal expressions and method templates.

### 3. Results Integration
Link analysis results back to specifications for complete traceability.

### 4. Versioning
Support library versioning and evolution tracking.

### 5. Additional Semantic Vocabularies
Integrate additional ontologies (BRIDG, CDASH, SDTM).

---

## References

- **Define-JSON Specification**: https://temeta.github.io/define-json/
- **ADaM Implementation Guide**: https://www.cdisc.org/standards/foundational/adam
- **STATO Ontology**: http://stato-ontology.org/
- **Neo4j Documentation**: https://neo4j.com/docs/

---

## Document Version

**Version**: 1.0
**Date**: 2025-01-21
**Authors**: Analysis Concepts Working Group
**Status**: Draft for Review

---

## Appendix: Complete Schema Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         LIBRARY COMPONENTS                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    REQUIRES_BUILDING_BLOCK    ┌───────────────┐  │
│  │   Analysis   │───────────────────────────────→│   Building    │  │
│  │   Concept    │                                 │     Block     │  │
│  │              │                                 │               │  │
│  │ - inputs[]   │                                 │ - template    │  │
│  │ - outputs[]  │                                 │ - parameters[]│  │
│  │ - methods[]  │                                 │               │  │
│  └──────┬───────┘                                 └───────┬───────┘  │
│         │                                                 │          │
│         │ REQUIRES_DATA_CONCEPT                           │          │
│         │                                                 │          │
│         │                                    PROVIDES_INPUT          │
│         │                                    DESCRIBES_OUTPUT        │
│         │                                                 │          │
│         ↓                                                 ↓          │
│  ┌──────────────┐    DERIVED_BY_METHOD      ┌───────────────┐      │
│  │     Data     │───────────────────────────→│     Method    │      │
│  │   Concept    │                             │               │      │
│  │              │                             │ - parameters[]│      │
│  │ - inputs[]   │                             │ - implements[]│      │
│  │ - outputs[]  │                             │               │      │
│  │ - derivation │                             │               │      │
│  └──────────────┘                             └───────────────┘      │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                       STUDY INSTANCES                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐    INSTANTIATES           ┌───────────────┐       │
│  │    Study     │───────────────────────────→│   Analysis    │       │
│  │   Analysis   │                             │   Concept     │       │
│  │              │                             │   (Library)   │       │
│  │ - sentence   │                             └───────────────┘       │
│  │   Composition│                                                     │
│  └──────┬───────┘                                                     │
│         │                                                             │
│         │ HAS_ANALYSIS_SET                                            │
│         ↓                                                             │
│  ┌──────────────┐    FILTERS                ┌───────────────┐       │
│  │  Analysis    │───────────────────────────→│   ItemGroup   │       │
│  │     Set      │                             │   (Dataset)   │       │
│  └──────────────┘                             └───────┬───────┘       │
│                                                       │               │
│                                          CONTAINS_ITEM│               │
│                                                       ↓               │
│                                                ┌──────────────┐       │
│                                                │     Item     │       │
│                                                │  (Variable)  │       │
│                                                │              │       │
│                                                └──────┬───────┘       │
│                                                       │               │
│                                        IMPLEMENTS_CONCEPT             │
│                                                       ↓               │
│                                                ┌──────────────┐       │
│                                                │     Data     │       │
│                                                │   Concept    │       │
│                                                │   (Library)  │       │
│                                                └──────────────┘       │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

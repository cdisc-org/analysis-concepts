# Creating Study Implementation Examples

This guide explains how to create study implementation examples for the study model.

## Overview

Study implementation examples demonstrate how to:
1. Reference library concepts via OIDs
2. Define ADaM dataset structures with variables
3. Create analysis instances that bind library concepts to study data
4. Map building block parameters to actual study variables
5. Define CUBE structures for analysis results

## Example Structure

A complete study example includes:

```yaml
studyOID: "STUDY.YOUR.STUDY"
studyName: "Your Study Name"

libraryReferences: [...]      # Link to concept libraries
dataStructures: [...]         # ADaM datasets (ADSL, BDS, OCCDS)
studyAnalyses: [...]          # Analysis instances
analysisOutputDatasets: [...] # CUBE structures for results
```

## Step-by-Step Guide

### Step 1: Define Study Metadata

```yaml
studyOID: "STUDY.DIABETES.301"
studyName: "Phase 3 Efficacy Study of Drug X"

libraryReferences:
  - libraryOID: "LIB.CDISC.AC.V1"
    libraryName: "CDISC Analysis Concepts Library"
    libraryVersion: "1.0"
```

### Step 2: Define Dataset Structures

For each ADaM dataset (ADSL, ADLBC, ADAE, etc.):

```yaml
dataStructures:
  - OID: "IG.ADSL"
    name: "ADSL"
    dataClass: "ADSL"  # ADSL, BDS, OCCDS, etc.
    structure: "one_record_per_subject"

    variables:
      - OID: "IT.ADSL.USUBJID"
        name: "USUBJID"
        dataType: "text"
        role: "IDENTIFIER"
        mandatory: true

      - OID: "IT.ADSL.TRT01P"
        name: "TRT01P"
        label: "Planned Treatment"
        dataType: "text"
        implementsBiomedicalConcept: ["BC.TREATMENT.PLANNED"]
```

#### Key Points for Variables:

- **OID prefix**: Use `IT.` for ItemDef (study variables)
- **implementsDerivationConcept**: References library DC.* concepts
- **implementsBiomedicalConcept**: References library BC.* concepts
- **dataType**: `text`, `integer`, `float`, `date`, `datetime`, `boolean`
- **role**: `IDENTIFIER`, `TIMING`, `RESULT`, `CATEGORIZATION`, etc.

#### Common Variable Patterns:

**Baseline variables:**
```yaml
- OID: "IT.ADLBC.BASE"
  name: "BASE"
  label: "Baseline Value"
  dataType: "float"
  implementsDerivationConcept: ["DC.BASELINE.VALUE"]
```

**Change from baseline:**
```yaml
- OID: "IT.ADLBC.CHGBL"
  name: "CHG"
  label: "Change from Baseline"
  dataType: "float"
  implementsDerivationConcept: ["DC.CHANGE.FROM.BASELINE"]
```

**Treatment variables:**
```yaml
- OID: "IT.ADSL.TRT01P"
  name: "TRT01P"
  label: "Planned Treatment"
  dataType: "text"
  implementsBiomedicalConcept: ["BC.TREATMENT.PLANNED"]
```

### Step 3: Define Study Analyses

For each analysis (primary, secondary, exploratory):

```yaml
studyAnalyses:
  - analysisOID: "ANALYSIS.001"
    analysisName: "Primary Efficacy Analysis"

    # Reference library AnalysisConcept
    implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"

    # Human-readable sentence
    composedSentence: "ANCOVA comparing LS means of change from baseline..."

    # Bind building block parameters to study data
    parameterBindings: [...]

    # Define population
    populationRef: {...}

    # Reference datasets
    datasetRefs: [...]

    # Specify method execution
    methodExecutions: [...]

    # Map outputs to result locations
    outputs: [...]
```

#### Parameter Bindings

Map building block parameters to study-specific values:

**Bind to a variable:**
```yaml
parameterBindings:
  - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
    parameterName: "change_variable"
    boundToVariable: "IT.ADLBC.CHGBL"
    description: "Change from baseline variable"
```

**Bind to a literal value:**
```yaml
  - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
    parameterName: "timepoint"
    literalValue: "Week 24"
    description: "Primary timepoint"
```

**Bind to an expression:**
```yaml
  - buildingBlockRef: "BB.CALCULATION"
    parameterName: "formula"
    expression: "AVAL - BASE"
    description: "Calculate change from baseline"
```

#### Population Specification

```yaml
populationRef:
  populationOID: "POP.FAS"
  populationName: "Full Analysis Set"
  whereClause: "FASFL = 'Y' and PARAMCD = 'HBA1C' and AVISITN = 24"
```

#### Method Execution

```yaml
methodExecutions:
  - methodRef: "METHOD.ANCOVA.TYPE3"
    selectedLanguage: "SAS"  # or "R", "Python"
    executionOrder: 1
    parameters: "type=3 cl=0.95"
```

#### Output Mappings

Map library concept outputs to CUBE result locations:

```yaml
outputs:
  - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.LS_MEAN"
    resultLocation: "CUBE.PRIMARY.LSMEAN"
    displayFormat: "F8.2"
    description: "LS mean by treatment group"

  - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.P_VALUE"
    resultLocation: "CUBE.PRIMARY.PVAL"
    displayFormat: "PVALUE6.4"
    description: "P-value for treatment comparison"
```

### Step 4: Define CUBE Structures

Define the structure of analysis result datasets:

```yaml
analysisOutputDatasets:
  - OID: "CUBE.PRIMARY"
    name: "Primary Efficacy Results"
    sourceAnalyses: ["ANALYSIS.001"]

    # Dimensions (grouping variables)
    dimensions:
      - name: "TRTP"
        label: "Treatment"
        dataType: "text"
        order: 1

      - name: "AVISIT"
        label: "Visit"
        dataType: "text"
        order: 2

    # Measures (result values)
    measures:
      - name: "LSMEAN"
        label: "LS Mean"
        dataType: "float"
        statisticType: "adjusted_mean"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.LSMEAN"
        displayFormat: "F8.2"

      - name: "PVAL"
        label: "P-value"
        dataType: "float"
        statisticType: "p_value"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.PVAL"
        displayFormat: "PVALUE6.4"
```

## OID Naming Conventions

Follow these conventions for OIDs:

| Entity | Prefix | Example |
|--------|--------|---------|
| Study | `STUDY.` | `STUDY.DIABETES.301` |
| ItemGroupDef | `IG.` | `IG.ADSL`, `IG.ADLBC` |
| ItemDef | `IT.` | `IT.ADSL.USUBJID`, `IT.ADLBC.CHGBL` |
| Analysis | `ANALYSIS.` | `ANALYSIS.001`, `ANALYSIS.PRIMARY` |
| Population | `POP.` | `POP.FAS`, `POP.PPS` |
| CUBE | `CUBE.` | `CUBE.PRIMARY`, `CUBE.SAFETY` |

**Library concept OIDs** (referenced, not defined in study):
- `AC.` - AnalysisConcept
- `DC.` - DerivationConcept
- `BB.` - BuildingBlock
- `BC.` - BiomedicalConcept
- `METHOD.` - Method

## Common Patterns

### Pattern 1: Simple ANCOVA Analysis

```yaml
studyAnalyses:
  - analysisOID: "ANALYSIS.001"
    implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"
    parameterBindings:
      - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
        parameterName: "change_variable"
        boundToVariable: "IT.ADLBC.CHGBL"
```

### Pattern 2: Categorical Analysis

```yaml
studyAnalyses:
  - analysisOID: "ANALYSIS.002"
    implementsConcept: "AC.CMH.BINARY"
    parameterBindings:
      - buildingBlockRef: "BB.OUTCOME.BINARY"
        parameterName: "response_variable"
        boundToVariable: "IT.ADEFF.RESPFL"
```

### Pattern 3: Time-to-Event Analysis

```yaml
studyAnalyses:
  - analysisOID: "ANALYSIS.003"
    implementsConcept: "AC.COX.HAZARD_RATIO"
    parameterBindings:
      - buildingBlockRef: "BB.OUTCOME.TIME_TO_EVENT"
        parameterName: "time_variable"
        boundToVariable: "IT.ADTTE.AVAL"
      - buildingBlockRef: "BB.OUTCOME.TIME_TO_EVENT"
        parameterName: "event_variable"
        boundToVariable: "IT.ADTTE.CNSR"
```

## Validation

### Validate Your Example

```bash
# From the study/ directory
make validate-one FILE=examples/your_example.yaml
```

### Common Validation Errors

**Error: "Required field missing"**
- Check that all required properties are present
- Required: `studyOID`, `studyName` at root
- Required: `analysisOID`, `implementsConcept` in StudyAnalysis

**Error: "Invalid OID pattern"**
- Ensure OIDs follow the correct prefix pattern
- `IG.` for datasets, `IT.` for variables, etc.

**Error: "Invalid enum value"**
- Check that enums match schema definitions
- `dataClass`: Must be one of ADSL, BDS, OCCDS, ADAE, ADCM
- `dataType`: Must be one of text, integer, float, date, datetime, boolean

## Templates

### Minimal Example Template

```yaml
studyOID: "STUDY.TEMPLATE"
studyName: "Template Study"

libraryReferences:
  - libraryOID: "LIB.CDISC.AC.V1"
    libraryName: "CDISC Analysis Concepts"
    libraryVersion: "1.0"

dataStructures:
  - OID: "IG.ADSL"
    name: "ADSL"
    dataClass: "ADSL"
    structure: "one_record_per_subject"
    variables:
      - OID: "IT.ADSL.USUBJID"
        name: "USUBJID"
        dataType: "text"
        role: "IDENTIFIER"
        mandatory: true

studyAnalyses:
  - analysisOID: "ANALYSIS.001"
    analysisName: "Primary Analysis"
    implementsConcept: "AC.YOUR.CONCEPT"
    parameterBindings: []
```

## Tips

1. **Start Simple**: Begin with a minimal example and add complexity incrementally
2. **Validate Often**: Run validation after each major addition
3. **Reference Library**: Ensure all referenced OIDs exist in the library
4. **Consistent Naming**: Use clear, consistent naming for OIDs
5. **Document**: Add `description` fields to explain non-obvious choices
6. **Real Data**: Base examples on actual study designs for realism

## Getting Help

- **Schema Documentation**: See [study/README.md](README.md)
- **Library Concepts**: See [library/README.md](../library/README.md)
- **Complete Example**: See [examples/primary_efficacy_study.yaml](examples/primary_efficacy_study.yaml)
- **Schema Reference**: See [schema/define_json_study_implementation.yaml](schema/define_json_study_implementation.yaml)

## Next Steps

After creating examples:

1. **Validate**: Run `make validate` to check all examples
2. **Generate Code**: Run `make python` to generate Python classes
3. **Generate Documentation**: Run `make docs` for markdown docs
4. **Generate UML**: Run `make uml` for visual diagrams

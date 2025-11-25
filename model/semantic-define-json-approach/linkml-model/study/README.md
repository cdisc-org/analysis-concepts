# Define-JSON Study Implementation - Study Model (LinkML)

This directory contains the **Study Model** - a [LinkML](https://linkml.io) representation of study-specific analysis implementations. This model defines concrete instantiations of abstract concepts from the [library/](../library/) model.

**Part of the two-model architecture**: See [parent README](../README.md) for the complete architecture overview.

## Overview

The study implementation model provides a formal specification for:

- **Study-specific implementations** that reference library concepts
- **ADaM dataset structures** (DataStructureDefinition → ItemGroupDef, StudyVariable → ItemDef)
- **Analysis instantiations** (StudyAnalysis) that bind library concepts to study data
- **Parameter bindings** that map building block parameters to actual variables
- **Analysis result structures** (CUBE/AnalysisOutputDataset) for output datasets

## Key Classes

### StudyImplementation

Root container for a study's analysis implementation.

```yaml
studyOID: "STUDY.12345"
studyName: "Phase 3 Efficacy Study"
libraryReferences:
  - libraryOID: "LIB.CDISC.AC"
    libraryName: "CDISC Analysis Concepts"
    libraryVersion: "1.0"
dataStructures: [...]
studyAnalyses: [...]
analysisOutputDatasets: [...]
```

### DataStructureDefinition

ADaM dataset structure (equivalent to Define-XML ItemGroupDef).

```yaml
OID: "IG.ADLBC"
name: "ADLBC"
dataClass: "BDS"  # Basic Data Structure
structure: "one_record_per_subject_per_parameter"
variables:
  - OID: "IT.ADLBC.CHGBL"
    name: "CHGBL"
    label: "Change from Baseline"
    dataType: "float"
    implementsDerivationConcept: ["DC.CHANGE.FROM.BASELINE"]
```

### StudyAnalysis

Instantiated analysis for a specific study.

```yaml
analysisOID: "ANALYSIS.001"
analysisName: "Primary Efficacy Analysis"
implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"  # References library AnalysisConcept
composedSentence: "ANCOVA comparing LS means of change from baseline in HbA1c at Week 24"

parameterBindings:
  - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"  # References library BuildingBlock
    parameterName: "parameter"
    boundToVariable: "IT.ADLBC.CHGBL"  # Study-specific variable

populationRef:
  populationOID: "POP.FAS"
  populationName: "Full Analysis Set"

outputs:
  - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.LS_MEAN_DIFF"
    resultLocation: "CUBE.RESULT.LSMDIFF"
```

### AnalysisParameterBinding

Binds building block parameters to study-specific values.

```yaml
buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"  # References library
parameterName: "parameter"
boundToVariable: "IT.ADLBC.CHGBL"  # Study variable
```

Or with literal value:
```yaml
buildingBlockRef: "BB.TIMEPOINT"
parameterName: "timepoint"
literalValue: "Week 24"
```

### AnalysisOutputDataset (CUBE)

Structure for analysis results.

```yaml
OID: "CUBE.PRIMARY"
name: "Primary Efficacy Results"
sourceAnalyses: ["ANALYSIS.001", "ANALYSIS.002"]

dimensions:
  - name: "TRTP"
    label: "Planned Treatment"
    dataType: "text"
    codelistRef: "CL.TRTP"

measures:
  - name: "LSMDIFF"
    label: "LS Mean Difference"
    dataType: "float"
    statisticType: "effect_estimate"
    analysisOutputRef: "ANALYSIS.001.OUTPUT.LSMDIFF"
```

## Directory Structure

```
study/
├── schema/
│   ├── define_json_study_implementation.yaml        # Main schema
│   ├── define_json_study_implementation.schema.json # Generated JSON Schema
│   └── define_json_study_implementation.ttl         # Generated RDF
├── examples/
│   └── (study implementation examples - to be added)
├── docs/
│   └── (generated documentation)
├── generated/
│   └── define_json_study_implementation.py # Generated Python classes
├── Makefile                                # Build automation
└── README.md                               # This file
```

## Prerequisites

Install LinkML:

```bash
pip install linkml linkml-runtime
```

## Usage

### Validate Schema

```bash
make validate-schema
```

### Generate Artifacts

```bash
# Generate all artifacts (JSON Schema, Python, RDF, UML)
make all

# Or generate individually
make json-schema  # JSON Schema
make python       # Python dataclasses
make rdf          # RDF/Turtle
make uml          # UML diagrams
```

### Validate Examples

Once examples are added:

```bash
make validate
```

Validate a single file:

```bash
make validate-one FILE=examples/study_example.yaml
```

## Creating Study Implementations

### Step 1: Define Dataset Structures

Create ADaM dataset structures with variables that implement library concepts:

```yaml
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

      - OID: "IT.ADSL.TRT01P"
        name: "TRT01P"
        label: "Planned Treatment"
        dataType: "text"
        implementsBiomedicalConcept: ["BC.TREATMENT.ASSIGNMENT"]
        role: "CATEGORIZATION"

  - OID: "IG.ADLBC"
    name: "ADLBC"
    dataClass: "BDS"
    structure: "one_record_per_subject_per_parameter"
    keys: ["USUBJID", "PARAMCD", "AVISITN"]
    variables:
      - OID: "IT.ADLBC.AVAL"
        name: "AVAL"
        label: "Analysis Value"
        dataType: "float"
        implementsDerivationConcept: ["DC.ANALYSIS.VALUE"]

      - OID: "IT.ADLBC.BASE"
        name: "BASE"
        label: "Baseline Value"
        dataType: "float"
        implementsDerivationConcept: ["DC.BASELINE.VALUE"]

      - OID: "IT.ADLBC.CHGBL"
        name: "CHGBL"
        label: "Change from Baseline"
        dataType: "float"
        implementsDerivationConcept: ["DC.CHANGE.FROM.BASELINE"]
```

### Step 2: Define Analyses

Create analysis instances that reference library concepts:

```yaml
studyAnalyses:
  - analysisOID: "ANALYSIS.001"
    analysisName: "Primary Efficacy - ANCOVA of HbA1c Change"
    implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"

    composedSentence: >-
      ANCOVA comparing LS means of change from baseline in HbA1c
      at Week 24 between treatment groups, adjusted for baseline
      HbA1c and stratification factors

    parameterBindings:
      - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
        parameterName: "parameter"
        boundToVariable: "IT.ADLBC.CHGBL"

      - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
        parameterName: "timepoint"
        literalValue: "Week 24"

      - buildingBlockRef: "BB.COVARIATE.BASELINE"
        parameterName: "covariate"
        boundToVariable: "IT.ADLBC.BASE"

    populationRef:
      populationOID: "POP.FAS"
      populationName: "Full Analysis Set"
      whereClause: "FASFL = 'Y'"

    datasetRefs:
      - datasetOID: "IG.ADLBC"
        datasetName: "ADLBC"
        role: "PRIMARY"

      - datasetOID: "IG.ADSL"
        datasetName: "ADSL"
        role: "SUPPLEMENTAL"

    methodExecutions:
      - methodRef: "METHOD.ANCOVA.TYPE3"
        selectedLanguage: "R"
        executionOrder: 1

    outputs:
      - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.LS_MEAN"
        resultLocation: "CUBE.PRIMARY.LSMEAN"
        displayFormat: "F8.2"

      - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.LS_MEAN_DIFF"
        resultLocation: "CUBE.PRIMARY.LSMDIFF"
        displayFormat: "F8.2"

      - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.CI_LOWER"
        resultLocation: "CUBE.PRIMARY.CI_LOWER"
        displayFormat: "F8.2"

      - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.CI_UPPER"
        resultLocation: "CUBE.PRIMARY.CI_UPPER"
        displayFormat: "F8.2"

      - conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.P_VALUE"
        resultLocation: "CUBE.PRIMARY.PVAL"
        displayFormat: "PVALUE6.4"
```

### Step 3: Define Output Structures

Create CUBE structures for results:

```yaml
analysisOutputDatasets:
  - OID: "CUBE.PRIMARY"
    name: "Primary Efficacy Results"
    label: "ANCOVA Results for HbA1c Change"
    sourceAnalyses: ["ANALYSIS.001"]

    dimensions:
      - name: "PARAM"
        label: "Parameter"
        dataType: "text"
        order: 1

      - name: "AVISIT"
        label: "Analysis Visit"
        dataType: "text"
        order: 2

      - name: "TRTP"
        label: "Planned Treatment"
        dataType: "text"
        codelistRef: "CL.TRTP"
        order: 3

    measures:
      - name: "LSMEAN"
        label: "LS Mean"
        dataType: "float"
        statisticType: "adjusted_mean"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.LSMEAN"
        displayFormat: "F8.2"

      - name: "LSMDIFF"
        label: "LS Mean Difference vs Placebo"
        dataType: "float"
        statisticType: "effect_estimate"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.LSMDIFF"
        displayFormat: "F8.2"

      - name: "CI_LOWER"
        label: "95% CI Lower Bound"
        dataType: "float"
        statisticType: "confidence_interval_lower"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.CI_LOWER"
        displayFormat: "F8.2"

      - name: "CI_UPPER"
        label: "95% CI Upper Bound"
        dataType: "float"
        statisticType: "confidence_interval_upper"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.CI_UPPER"
        displayFormat: "F8.2"

      - name: "PVAL"
        label: "P-value"
        dataType: "float"
        statisticType: "p_value"
        analysisOutputRef: "ANALYSIS.001.OUTPUT.PVAL"
        displayFormat: "PVALUE6.4"
```

## Schema Highlights

### References to Library Model

All references to library concepts use OID strings:

```yaml
# StudyAnalysis references AnalysisConcept
implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"

# StudyVariable references DerivationConcept
implementsDerivationConcept: ["DC.CHANGE.FROM.BASELINE"]

# AnalysisParameterBinding references BuildingBlock
buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"

# MethodExecution references Method
methodRef: "METHOD.ANCOVA.TYPE3"

# AnalysisOutput references ConceptOutput
conceptOutputRef: "AC.ANCOVA.LS_MEANS_CHG.OUTPUT.LS_MEAN"
```

### OID Prefixes

Type-specific OID prefixes for study elements:

- `IG.` - ItemGroupDef (DataStructureDefinition)
- `IT.` - ItemDef (StudyVariable)
- `ANALYSIS.` - StudyAnalysis
- `CUBE.` - AnalysisOutputDataset
- `POP.` - Population

Library concept prefixes (referenced):
- `AC.` - AnalysisConcept
- `DC.` - DerivationConcept
- `BB.` - BuildingBlock
- `BC.` - BiomedicalConcept
- `METHOD.` - Method

## Makefile Targets

```bash
make help          # Show all available targets
make validate      # Validate examples
make validate-schema  # Validate schema itself
make json-schema   # Generate JSON Schema
make python        # Generate Python classes
make rdf           # Generate RDF/Turtle
make uml           # Generate UML diagrams
make all           # Generate all artifacts
make clean         # Remove generated files
```

## Relationship to Library Model

The study model **references** the [library model](../library/) via OIDs:

| Study Class | References Library Class | Via Property |
|---|---|---|
| StudyAnalysis | AnalysisConcept | `implementsConcept` |
| StudyVariable | DerivationConcept | `implementsDerivationConcept` |
| StudyVariable | BiomedicalConcept | `implementsBiomedicalConcept` |
| AnalysisParameterBinding | BuildingBlock | `buildingBlockRef` |
| MethodExecution | Method | `methodRef` |
| AnalysisOutput | ConceptOutput | `conceptOutputRef` |

See [parent README](../README.md) for details on the two-model architecture.

## Benefits

1. **Traceability**: Clear mapping from abstract concepts to concrete implementations
2. **Validation**: Verify study references point to valid library concepts
3. **Reusability**: Same library concepts used across multiple studies
4. **Semantics**: Preserve statistical semantics from library to implementation
5. **Documentation**: Machine-readable analysis specifications
6. **Automation**: Enable automated code generation and validation

## Next Steps

1. **Add Examples**:
   - Simple study with single analysis
   - Complex study with multiple analyses
   - CUBE structures for different output types

2. **Cross-Model Validation**:
   - Verify OID references point to valid library concepts
   - Check parameter bindings match building block parameters
   - Validate output mappings against concept outputs

3. **Code Generation**:
   - Generate SAS/R analysis code from StudyAnalysis
   - Generate dataset specifications from DataStructureDefinition
   - Generate result table shells from AnalysisOutputDataset

4. **Documentation**:
   - Generate human-readable analysis specifications
   - Create traceability matrices
   - Produce statistical analysis plan content

## References

- [LinkML Documentation](https://linkml.io)
- [Parent README](../README.md) - Two-model architecture overview
- [Library Model](../library/README.md) - Abstract concept definitions
- [Define-JSON Extensions](../../DEFINE_JSON_EXTENSIONS.md)

## License

This work is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

# CDISC Pilot Study Implementation Example

This directory will contain a complete study implementation example based on the CDISC Pilot study, demonstrating real-world usage of the LinkML study model.

## Overview

The CDISC Pilot study is a publicly available reference study used to demonstrate CDISC standards. This example shows how to represent actual study implementations using the LinkML study model.

## Directory Structure

```
cdisc-pilot/
├── source-data/              # Source materials (git-ignored)
│   ├── define.xml            # Define-XML with dataset/variable definitions
│   ├── analysis-descriptions.txt  # Analysis text descriptions
│   ├── result-tables/        # Result table files (PDF, CSV, etc.)
│   └── datasets/             # ADaM/SDTM datasets (optional)
│
├── cdisc_pilot_study.yaml    # Complete study implementation (TO BE CREATED)
└── README.md                 # This file
```

## What This Example Will Demonstrate

### 1. Real ADaM Dataset Structures
- ADSL - Subject-level analysis dataset
- ADLBC - Laboratory results (e.g., HbA1c, glucose)
- ADAE - Adverse events (if included)
- Others as appropriate

### 2. Multiple Analysis Examples
Three analyses from the CDISC Pilot study showing:
- Different analysis types (efficacy, safety, descriptive)
- Different statistical methods (ANCOVA, categorical, descriptive)
- Different parameter binding patterns
- Different output structures

### 3. Complete Traceability
- ADaM variables → Library DerivationConcepts
- Study analyses → Library AnalysisConcepts
- Parameter bindings → Study variables
- Analysis outputs → CUBE result structures
- Define-XML ItemDefs → StudyVariable definitions

### 4. Real-World Patterns
- Actual variable naming conventions
- Realistic population definitions
- Standard ADaM structure conventions
- Industry-standard statistical methods

## Source Data

Source materials are stored in `source-data/` and are **NOT committed to git**.

To use this example, place the following files in `source-data/`:

1. **define.xml** - CDISC Pilot Define-XML file
2. **analysis-descriptions.txt** - Text descriptions of the 3 analyses
3. **result-tables/** - Result table files showing analysis results
4. **datasets/** - (Optional) Actual ADaM dataset files

See README files in each subdirectory for details on what to include.

## How to Use This Example

### As a Template
Use this as a template for your own study implementations:
1. Review the structure and patterns
2. Adapt variable names and analysis specifications
3. Reference your own library concepts
4. Validate against the schema

### As Documentation
Understand how real studies map to the LinkML model:
1. See how Define-XML translates to LinkML structures
2. Learn parameter binding patterns
3. Understand CUBE output structures
4. Follow traceability from source to results

### For Validation
Test tools and processes:
1. Validate the example: `make validate-one FILE=examples/cdisc-pilot/cdisc_pilot_study.yaml`
2. Generate Python classes: `cd ../.. && make python`
3. Test cross-model validation (study OIDs → library concepts)

## Creating the Example

Once source data is provided, the example will be created by:

1. **Parsing Define-XML**:
   - Extract ItemGroupDef definitions → DataStructureDefinition
   - Extract ItemDef definitions → StudyVariable
   - Map variables to library DerivationConcepts

2. **Analyzing Analysis Descriptions**:
   - Identify analysis types and methods
   - Match to library AnalysisConcepts
   - Determine required BuildingBlocks
   - Create parameter bindings

3. **Structuring Result Tables**:
   - Identify dimensions (treatment, visit, etc.)
   - Identify measures (statistics, p-values, CIs)
   - Create CUBE structures
   - Map to analysis outputs

4. **Validation and Documentation**:
   - Validate against schema
   - Add detailed comments
   - Document mappings and decisions
   - Create traceability matrix

## Benefits of CDISC Pilot Example

Using the CDISC Pilot study provides:

1. **Public availability**: Anyone can access the source materials
2. **Well-known reference**: Widely used in CDISC training and documentation
3. **Complete data**: Includes Define-XML, datasets, and result tables
4. **Realistic complexity**: Real study structure with multiple analyses
5. **Educational value**: Demonstrates industry-standard patterns

## Status

**Status**: Awaiting source data

**Next Steps**:
1. Add source materials to `source-data/`
2. Process materials to create `cdisc_pilot_study.yaml`
3. Validate and document
4. Use as reference for other examples

## References

- CDISC Pilot Study: https://www.cdisc.org/cdisc-pilot-project
- LinkML Study Model: [../../schema/define_json_study_implementation.yaml](../../schema/define_json_study_implementation.yaml)
- LinkML Library Model: [../../../library/README.md](../../../library/README.md)

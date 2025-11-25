# Instructions for Adding CDISC Pilot Source Data

This directory is configured to **NOT be committed to git**. You can safely add files here without worrying about them being tracked.

## What to Add

### 1. Define-XML File (Required)
**Filename**: `define.xml`

Place the CDISC Pilot Define-XML file here. This should include:
- ItemGroupDef definitions (datasets like ADSL, ADLBC, ADAE)
- ItemDef definitions (variables)
- Variable-level metadata (derivations, codelists, etc.)
- Analysis metadata (if available)

**Where to get it**: Available from CDISC website or your CDISC Pilot package

### 2. Analysis Descriptions (Required)
**Filename**: `analysis-descriptions.txt`

Create a text file with descriptions of your 3 analyses. Format example:

```text
================================================================================
ANALYSIS 1: Primary Efficacy Analysis
================================================================================
Title: ANCOVA of Change from Baseline in HbA1c at Week 24

Description:
Analysis of covariance (ANCOVA) model comparing mean change from baseline
in HbA1c (%) at Week 24 between treatment groups, adjusted for baseline
HbA1c value and stratification factors (baseline HbA1c category and region).

Population: Full Analysis Set (FAS)
Dataset: ADLBC
Primary Variable: CHG (Change from Baseline)
Baseline Variable: BASE
Treatment Variable: TRT01P
Timepoint: Week 24 (AVISITN = 24)
Parameter: HbA1c (PARAMCD = 'HBA1C')

Statistical Method: ANCOVA Type III

Outputs:
- LS Mean by treatment group
- LS Mean difference vs placebo
- 95% Confidence intervals
- P-values

================================================================================
ANALYSIS 2: [Second Analysis]
================================================================================
...

================================================================================
ANALYSIS 3: [Third Analysis]
================================================================================
...
```

### 3. Result Tables (Helpful)
**Location**: `result-tables/` subdirectory

Add result table files showing the actual analysis outputs:

**Formats accepted**:
- PDF: `table-14-2-01-efficacy.pdf`
- CSV: `table-14-2-01-efficacy.csv`
- Excel: `table-14-2-01-efficacy.xlsx`
- Screenshots: `table-14-2-01-efficacy.png`

**What I need from tables**:
1. **Dimensions** (row/column groupings):
   - Treatment groups
   - Visit/timepoint
   - Parameters
   - Subgroups

2. **Measures** (statistics displayed):
   - N (count)
   - Mean, LS Mean, Median
   - Standard deviation, Standard error
   - Differences (vs comparator)
   - Confidence intervals
   - P-values
   - Display formats (e.g., "8.2", "0.001")

### 4. Datasets (Optional)
**Location**: `datasets/` subdirectory

If you can share actual datasets:
- `adsl.xpt` - Subject-level analysis dataset
- `adlbc.xpt` - Laboratory analysis dataset
- Other relevant datasets

**Alternative** (if you can't share data):
Create variable list files like `adsl-variables.txt`:

```text
Dataset: ADSL
Purpose: Subject-level analysis dataset
Structure: One record per subject

Variables:
----------
USUBJID | Char(50) | Unique Subject Identifier | IDENTIFIER | Required
STUDYID | Char(20) | Study Identifier | IDENTIFIER | Required
SUBJID  | Char(10) | Subject Identifier | IDENTIFIER | Required
TRT01P  | Char(100)| Planned Treatment | CATEGORIZATION | Required
TRT01PN | Num(8)   | Planned Treatment (N) | CATEGORIZATION | Required
AGE     | Num(8)   | Age | CATEGORIZATION
SEX     | Char(1)  | Sex | CATEGORIZATION | Codelist: SEX
RACE    | Char(50) | Race | CATEGORIZATION | Codelist: RACE
FASFL   | Char(1)  | Full Analysis Set Flag | CATEGORIZATION | Required
...
```

## What Happens Next

Once you add these files:

1. I'll parse the Define-XML to extract:
   - Dataset structures → `DataStructureDefinition`
   - Variables → `StudyVariable`
   - Mappings to library concepts

2. I'll analyze the descriptions to create:
   - `StudyAnalysis` instances
   - Parameter bindings
   - Population definitions
   - Method specifications

3. I'll use result tables to create:
   - `AnalysisOutputDataset` (CUBE) structures
   - Dimension and measure definitions
   - Output mappings

4. I'll generate:
   - Complete `cdisc_pilot_study.yaml` file
   - Validation against schema
   - Documentation of mappings

## Checking Git Status

To verify files are ignored:

```bash
# From repository root
cd /Users/kwl/repos/Github/CDISC/analysis-concepts

# Check git status - source-data files should NOT appear
git status

# Add a test file to verify
echo "test" > model/semantic-define-json-approach/linkml-model/study/examples/cdisc-pilot/source-data/test.xml
git status  # Should NOT show test.xml

# Clean up test
rm model/semantic-define-json-approach/linkml-model/study/examples/cdisc-pilot/source-data/test.xml
```

## Ready to Proceed

Once you've added:
- ✅ `define.xml`
- ✅ `analysis-descriptions.txt`
- ✅ Result table files in `result-tables/`
- ⚪ (Optional) Dataset files in `datasets/`

Let me know and I'll process them to create the comprehensive CDISC Pilot example!

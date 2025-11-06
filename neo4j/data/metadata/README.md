# Analysis Concepts Metadata Repository

## Overview

This folder contains structured metadata definitions for analysis concepts in YAML format. Analysis concepts capture the specification of statistical analyses in a machine-readable, yet human-friendly format that enables automation, validation, and traceability.

**Two Main Types:**
- **ACTemplate**: Reusable analysis patterns that can be applied across multiple studies
- **ACStudyInstance**: Study-specific analysis implementations based on templates

## Folder Structure

```
metadata/
├── ACTemplate/          (7 files) - Reusable analysis concept templates
│   ├── T_AC_002_change_from_baseline.yaml
│   ├── T_AC_003_sdtm_to_aval.yaml
│   ├── T_AC_004_sdtm_to_base.yaml
│   ├── T_AC_006_sum_with_missing_adjustment.yaml
│   ├── T_AC_007_linear_model.yaml
│   ├── T_AC_008_ancova_pairwise.yaml
│   └── T_AC_009_descriptive_statistics.yaml
│
└── ACStudyInstance/     (8 files) - Study-specific implementations
    ├── D_AC_003_adas_cog_change_from_baseline.yaml    (Derivations)
    ├── D_AC_004_adas_cog_item_aval.yaml
    ├── D_AC_005_adas_cog_total_score.yaml
    ├── D_AC_006_adas_cog_item_base.yaml
    ├── D_AC_007_adas_cog_total_base.yaml
    ├── M_AC_021_dose_response.yaml                    (Model-based)
    ├── M_AC_022_ancova_pairwise_comparison.yaml
    └── S_AC_001_adas_cog_summary_statistics.yaml      (Summary)
```

## Why This YAML Structure?

### Core Design Goals

1. **Machine Readability**: Enable automated processing, validation, and code generation
2. **Human Readability**: YAML is more accessible than XML or JSON for clinical statisticians and programmers
3. **Semantic Precision**: Link to standardized ontologies (STATO) for unambiguous statistical meaning
4. **Traceability**: Capture dependencies between analysis concepts explicitly through SOURCE_AC references
5. **Standards Alignment**: Reference CDISC ADaM IG terminology and structure consistently
6. **Separation of Concerns**: Distinguish reusable patterns (templates) from study-specific details (instances)

### Why Structured Metadata?

Moving analysis specifications from narrative documents to computable artifacts provides:

- **Validation**: Check against standards (ADaM IG, STATO) automatically
- **Automation**: Generate analysis code, documentation, and visualizations
- **Audit Trail**: Create complete lineage for regulatory submissions
- **Impact Analysis**: Understand ripple effects when modifying analyses
- **Reproducibility**: Capture all details needed to reproduce results
- **Communication**: Shared vocabulary between statisticians, programmers, and regulators

---

## YAML Structure Explanation

### Header Information

```yaml
AC_ID: T_AC_002                    # Unique identifier for referencing
AC_NAME: Change from Baseline      # Human-readable name
AC_PURPOSE: Calculate change from baseline for analysis parameter
AC_TEMPLATE: T_AC_002              # (Instances only) Links to parent template
```

**Purpose**: Basic identification and description of the analysis concept.

### ONTOLOGY Section

```yaml
ONTOLOGY:
  STATO_IRI: http://purl.obolibrary.org/obo/STATO_0000175
  STATO_LABEL: difference
  ADDITIONAL_IRIS:
    - IRI: http://purl.obolibrary.org/obo/STATO_0000002
      ONTOLOGY: STATO
      LABEL: data transformation
```

**Why?** Links to Statistics Ontology (STATO) ensure precise semantic meaning. Different stakeholders interpret "ANCOVA" or "change from baseline" identically. Enables semantic queries like "Find all analyses using ANCOVA."

### INPUTS Section

Each input specifies what data the analysis consumes:

```yaml
INPUTS:
  - INPUT_ID: T_AC_002_IN_001
    SOURCE_AC_TEMPLATE: null           # Template this input comes from (templates)
    SOURCE_AC: D_AC_005                # Analysis concept this input comes from (instances)
    SOURCE_CLASS_VARIABLE: AVAL        # ADaM IG standard variable name
    SOURCE_CLASS_DATASET: null         # ADaM IG dataset class
    SOURCE_DATASET: ADQSADAS           # Specific sponsor dataset (instances)
    SOURCE_VARIABLE: AVAL              # Specific variable in dataset (instances)
    ROLE: post_baseline_value          # Semantic role in this analysis
    DESCRIPTION: Analysis value at post-baseline timepoint
    REQUIRED: true                     # Is this input mandatory?
    DATA_TYPE: Numeric                 # Numeric or Character
    MEASUREMENT_SCALE: continuous      # continuous, categorical, nominal
    STATO_IRI: http://...              # Ontology reference for statistical role
    SELECTION_CRITERIA: "PARAMCD = 'ACTOT'"  # Filter conditions
```

**Why This Structure?**

- **Separates "what" from "where"**: Class variable (standard) vs specific dataset (implementation)
- **Captures "why"**: Role and STATO IRI explain the input's purpose, not just its name
- **Links analyses**: SOURCE_AC creates dependency graph for traceability
- **Enables dual representation**: Templates use class variables (generic), instances add datasets (concrete)

**Key Fields Explained:**

- `SOURCE_AC` / `SOURCE_AC_TEMPLATE`: Creates analysis dependency chain (e.g., "CHG comes from D_AC_003")
- `SOURCE_CLASS_VARIABLE`: ADaM IG standard name, enables template reusability
- `SOURCE_DATASET` / `SOURCE_VARIABLE`: Concrete implementation details (instances only)
- `ROLE`: Semantic function (baseline_value, grouping_variable, model fixed effect term, population_flag)
- `SELECTION_CRITERIA`: Filter logic (e.g., "EFFFL = 'Y'", "AVISIT = 'Week 24'")

### OUTPUTS Section

```yaml
OUTPUTS:
  - OUTPUT_ID: T_AC_002_OUT_001
    VARIABLE_NAME: CHG                 # What variable is produced
    DESCRIPTION: Change from baseline (AVAL - BASE)
    DATA_TYPE: Numeric
    MEASUREMENT_SCALE: continuous
    STATO_IRI: http://...
    CARDINALITY: multiple              # single or multiple values
    BY_VARIABLES: ["USUBJID", "AVISIT"]  # Grouping structure
    BY_CONTRAST:                       # For comparisons
      VARIABLE: TRTP
      TYPE: pairwise_vs_reference
      REFERENCE_LEVEL: "Placebo"
```

**Why?**

- **Explicit output definition**: What the analysis produces
- **Structure documentation**: Cardinality and BY_VARIABLES describe output shape
- **Comparison specification**: BY_CONTRAST details what's compared to what

### METHOD Section

```yaml
METHOD:
  IMPLEMENTATION: base::subtract      # Software implementation hint
  OPERATION: subtract                 # High-level operation type
  FORMULA: "AVAL - BASE"             # Mathematical formula
  PARAMETERS:                         # Method-specific parameters
    operation: subtract
    missing_handling: propagate
    description: "Simple arithmetic subtraction"
```

**Why?**

- **Bridges concept to computation**: From statistical idea to executable code
- **Reproducibility**: Parameters make analysis exactly reproducible
- **Documentation**: Formula provides mathematical definition

### METADATA Section

```yaml
METADATA:
  VERSION: "1.0"
  CREATED_DATE: "2025-11-05"
  CREATED_BY: "CDISC Analysis Concepts Team"
  LAST_MODIFIED_DATE: "2025-11-05"
  LAST_MODIFIED_BY: "CDISC Analysis Concepts Team"
  STATUS: Active                      # Active, Draft, Deprecated
  REVIEW_STATUS: Template             # Template, Approved, In Review
  SOURCE: "CDISC ADaM Analysis Concepts"
```

Just an example - not important for our model discussions

---

## Template vs Instance Design

### Templates (T_AC_XXX)

**Purpose**: Define reusable analysis patterns applicable across studies.

**Characteristics**:
- Reference **ADaM IG class variables** (generic): "AVAL", "BASE", "CHG", "TRTPN"
- No specific datasets: `SOURCE_DATASET: null`
- No specific selection criteria: `SELECTION_CRITERIA: null`
- Can be applied across multiple studies with similar designs
- Focus on **statistical pattern**, not study protocol

**Example**: T_AC_002 "Change from Baseline"
- Works for any continuous parameter (ADAS-Cog, vital signs, lab values)
- Inputs: AVAL, BASE (class variables)
- Output: CHG
- Method: subtract

### Instances (D_AC_XXX, M_AC_XXX, S_AC_XXX)

**Purpose**: Apply template to specific study context with concrete details.

**Characteristics**:
- Reference **specific datasets**: "ADQSADAS", "ADVS"
- Reference **specific variables**: Match actual column names in datasets
- Include **selection criteria**: "PARAMCD = 'ACTOT'", "AVISIT = 'Week 24'", "EFFFL = 'Y'"
- Link to **specific upstream analyses**: `SOURCE_AC: "D_AC_003"`
- Define **populations and filters**: Population flags, visit filters, parameter filters

**Example**: D_AC_003 "Change from Baseline ADAS-Cog (11)"
- Specific application for ADAS-Cog assessment in CDISC Pilot Study
- Inputs: AVAL from ADQSADAS (PARAMCD='ACTOT'), BASE from ADQSADAS
- Output: CHG by USUBJID, AVISIT
- Method: subtract (inherited from template)

### Why This Two-Level Pattern?

**Reusability**: One template → many instances across studies
- T_AC_002 can generate change from baseline for any continuous endpoint
- Same statistical logic, different clinical applications

**Consistency**: All "change from baseline" analyses follow same pattern
- Reduces errors from ad-hoc implementations
- Standardizes approach across organization

**Maintainability**: Fix template once, benefit all instances
- Update statistical method in template
- All derived instances inherit the improvement

**Clarity**: Separates conceptual pattern from operational details
- Statisticians review templates (scientific correctness)
- Programmers implement instances (technical execution)

---

## Level of Abstraction vs Executability

This is a **key design tension** in the Analysis Concepts framework.

### The Abstraction Spectrum

```
High Abstraction                              Low Abstraction
(Generic)                                     (Specific)
     │                                             │
Templates                                    Instances
     │                                             │
Reusable                                     Executable
Not runnable                                 Study-specific
```

**High Abstraction (Templates):**
- ✅ Maximally reusable across studies
- ✅ Captures statistical concept clearly
- ✅ Easy to understand the "what" and "why"
- ❌ Not directly executable (missing dataset names, filters)
- ❌ Requires instantiation and parameterization

**Low Abstraction (Instances):**
- ✅ Directly executable (all details present)
- ✅ Tied to specific study datasets
- ✅ Includes all filters and selection criteria
- ❌ Less reusable (CDISC Pilot Study specific)
- ❌ More verbose (repeats details)

### Our Approach: Two-Level Strategy

We chose **two levels of abstraction** as a pragmatic compromise:

1. **Templates**: Abstract enough to be reusable across studies with similar designs
2. **Instances**: Concrete enough to be executable without additional interpretation

This balances reusability with executability.

### What Makes Templates Reusable?

- **Reference ADaM IG class variables**: Standard names used across studies (AVAL, BASE, CHG)
- **Avoid study-specific details**: No "Week 24" or "ACTOT" parameter codes
- **Define statistical pattern**: "Calculate change from baseline" not "Calculate ADAS-Cog change"
- **Generic roles**: "baseline_value", "post_baseline_value" work for any parameter

**Example**: T_AC_002 works for:
- ADAS-Cog assessments
- Vital signs (blood pressure, heart rate)
- Laboratory values (glucose, cholesterol)
- Any continuous measurement with baseline and follow-up

### What Makes Instances Executable?

- **Specific dataset names**: "ADQSADAS" not "Basic Data Structure"
- **Specific variable names**: Match actual dataset columns
- **Selection criteria**: Concrete values ("PARAMCD = 'ACTOT'", "AVISIT = 'Week 24'")
- **Dependencies to concrete analyses**: `SOURCE_AC: "D_AC_003"` not `SOURCE_AC_TEMPLATE: "T_AC_002"`
- **Population flags**: "EFFFL = 'Y'", "ANL01FL = 'Y'" define analysis population

**Example**: M_AC_022 has all details to generate SAS/R code:
```sas
PROC GLM DATA=adqsadas;
  WHERE efffl='Y' AND anl01fl='Y' AND paramcd='ACTOT' AND avisit='Week 24';
  CLASS trtpn sitegr1;
  MODEL chg = base trtpn sitegr1;
  LSMEANS trtpn / PDIFF CL;
RUN;
```

### The Middle Ground - What Goes Where?

**Template Level (Conceptual):**
- Statistical method type (ANCOVA, descriptive statistics, derivation formula)
- Generic variable roles (baseline_value, dependent variable, grouping_variable)
- Required vs optional inputs
- Output structure (cardinality, data types)
- Mathematical formula or model specification

**Instance Level (Operational):**
- Dataset selection ("ADQSADAS")
- Variable selection (specific column names)
- Record filtering (parameter codes, visit names)
- Population definition (analysis flags)
- Links to prerequisite analyses in this study
- Study-specific parameter values

### Trade-offs Considered

**Could Templates Be More Abstract?**

*Option*: Remove even generic variable names, use pure parameterization
```yaml
# Hypothetical ultra-abstract template
INPUTS:
  - TYPE: continuous_variable
    ROLE: minuend
  - TYPE: continuous_variable
    ROLE: subtrahend
OUTPUTS:
  - TYPE: continuous_variable
    FORMULA: "{minuend} - {subtrahend}"
```

*Why We Didn't*:
- Would be harder to understand and validate
- Would require complex parameterization language
- Clinical statisticians need recognizable ADaM terminology
- Loses connection to domain (no one talks about "minuend" in clinical trials)

**Could Instances Be More Generic?**

*Option*: Use variable types instead of names
```yaml
# Hypothetical more-abstract instance
INPUTS:
  - TYPE: continuous_outcome
    DATASET: ADQSADAS
    # But which variable? System would need to infer...
```

*Why We Didn't*:
- Wouldn't be directly executable
- Would need runtime binding to actual column names
- Ambiguous: multiple variables could match "continuous_outcome"
- Programming teams need exact specifications

### Current Balance - The Sweet Spot

**Templates**: Abstract enough to reuse across studies with similar ADaM implementations
- Use standard ADaM IG variable names
- Reference common analysis patterns
- Understandable by study biostatisticians without extensive training

**Instances**: Concrete enough to generate executable code
- All dataset and variable names specified
- All filters and criteria explicit
- All dependencies resolved

**Result**: Study team can:
1. Understand the template (scientific review)
2. Create instance by filling in study details
3. Validate instance against study design
4. Generate code directly from instance

### Example Progression: Abstract → Concrete

**Level 1: Pure Concept (Mathematical)**
```
Δy = y₂ - y₁
```

**Level 2: Template (Statistical/ADaM)**
```yaml
AC_ID: T_AC_002
AC_NAME: Change from Baseline
INPUTS:
  - SOURCE_CLASS_VARIABLE: AVAL    # Post-baseline value
  - SOURCE_CLASS_VARIABLE: BASE    # Baseline value
OUTPUTS:
  - VARIABLE_NAME: CHG             # Change from baseline
METHOD:
  FORMULA: "AVAL - BASE"
```

**Level 3: Instance (Executable)**
```yaml
AC_ID: D_AC_003
AC_NAME: Change from Baseline ADAS-Cog (11)
AC_TEMPLATE: T_AC_002
INPUTS:
  - SOURCE_AC: D_AC_005
    SOURCE_DATASET: ADQSADAS
    SOURCE_VARIABLE: AVAL
    SOURCE_CLASS_VARIABLE: AVAL
    SELECTION_CRITERIA: "PARAMCD = 'ACTOT'"
  - SOURCE_AC: D_AC_007
    SOURCE_DATASET: ADQSADAS
    SOURCE_VARIABLE: BASE
    SOURCE_CLASS_VARIABLE: BASE
    SELECTION_CRITERIA: "PARAMCD = 'ACTOT'"
OUTPUTS:
  - VARIABLE_NAME: CHG
    BY_VARIABLES: ["USUBJID", "AVISIT"]
```

**Level 4: Generated Code (Implementation)**
```sas
DATA chg;
  MERGE aval(RENAME=(aval=aval_post))
        base(RENAME=(aval=aval_base));
  BY usubjid paramcd;
  WHERE paramcd='ACTOT';
  CHG = aval_post - aval_base;
RUN;
```

Each level adds specificity while maintaining traceability to the previous level.

---

## Design Rationale

### Why Not More Abstract?

**We Could Have**:
- Used pure mathematical notation (ℝⁿ → ℝⁿ transformations)
- Used generic variable types only ("CONTINUOUS_1", "CONTINUOUS_2")
- Created a complex parameter substitution language

**Why We Didn't**:
- Clinical statisticians need recognizable ADaM terminology (AVAL, BASE, CHG)
- Templates should be understandable without computer science degree
- Connection to clinical domain is valuable (everyone knows "change from baseline")
- CDISC standards provide common vocabulary across industry

### Why Not More Concrete?

**We Could Have**:
- Collapsed templates and instances into single files
- Hard-coded everything study-specific from the start
- Eliminated the template layer entirely

**Why We Didn't**:
- Reusability across studies is essential (one organization runs many trials)
- Need to capture both "what we always do" (template) and "what we did here" (instance)
- Templates enable organizational standards and best practices
- Separation makes both scientific review and technical implementation clearer

### Why Explicit Dependencies (SOURCE_AC)?

**Benefits**:
- Creates directed acyclic graph (DAG) of analysis pipeline
- Enables impact analysis: "If D_AC_003 changes, which analyses are affected?"
- Supports reproducibility: Can trace any result back to source data
- Documents analysis lineage for regulatory review
- Facilitates incremental computation: Only rerun affected downstream analyses

**Example Dependency Chain**:
```
D_AC_004 (SDTM → Item AVAL)
    ↓
D_AC_005 (Sum Items → Total Score AVAL)
    ↓
D_AC_007 (Define Baseline → BASE)
    ↓
D_AC_003 (Calculate Change → CHG)
    ↓
M_AC_022 (ANCOVA Pairwise Comparison)
```

If D_AC_005 changes (e.g., different summation rule), we know D_AC_003 and M_AC_022 must be revalidated.

### Why STATO Ontology?

**Semantic Precision**:
- "ANCOVA" means Analysis of Covariance globally (STATO_0000179)
- No ambiguity between "ANCOVA" and "ANOVA with covariates"
- Machine can validate: "This analysis claims to be ANCOVA but has no covariates"

**Query Enablement**:
- "Find all analyses using ANCOVA" → Query by STATO IRI
- "Find all baseline adjustments" → Query by STATO concept
- "What statistical methods are we using?" → Aggregate by STATO terms

**Automation Support**:
- Code generators know what "baseline_value" means statistically
- Validation rules can check: "ANCOVA requires continuous dependent variable"
- Documentation generators can explain methods using standard definitions

**International Standard**:
- STATO is an OBO Foundry ontology (Open Biological and Biomedical Ontologies)
- Used globally in scientific publishing
- Enables interoperability with other systems using same ontology

---

## Examples

### Example 1: Simple Derivation Chain

**Template: T_AC_002 (Change from Baseline)**

```yaml
AC_ID: T_AC_002
AC_NAME: Change from Baseline
AC_PURPOSE: Calculate change from baseline for analysis parameter

INPUTS:
  - INPUT_ID: T_AC_002_IN_001
    SOURCE_CLASS_VARIABLE: AVAL    # Generic - any analysis value
    ROLE: post_baseline_value
    REQUIRED: true
    DATA_TYPE: Numeric

  - INPUT_ID: T_AC_002_IN_002
    SOURCE_CLASS_VARIABLE: BASE    # Generic - any baseline
    ROLE: baseline_value
    REQUIRED: true
    DATA_TYPE: Numeric

OUTPUTS:
  - OUTPUT_ID: T_AC_002_OUT_001
    VARIABLE_NAME: CHG             # Generic - change output
    DESCRIPTION: Change from baseline (AVAL - BASE)
    DATA_TYPE: Numeric

METHOD:
  IMPLEMENTATION: base::subtract
  FORMULA: "AVAL - BASE"
```

**Instance: D_AC_003 (ADAS-Cog Change from Baseline)**

```yaml
AC_ID: D_AC_003
AC_TEMPLATE: T_AC_002              # Inherits pattern from template
AC_NAME: Change from Baseline ADAS-Cog (11)
AC_PURPOSE: Calculate change from baseline in ADAS-Cog (11) total score

INPUTS:
  - INPUT_ID: D_AC_003_IN_001
    SOURCE_AC: D_AC_005            # Depends on total score derivation
    SOURCE_DATASET: ADQSADAS       # Concrete dataset
    SOURCE_VARIABLE: AVAL          # Concrete variable
    SOURCE_CLASS_VARIABLE: AVAL    # Still references class
    ROLE: post_baseline_value      # Inherited role
    REQUIRED: true
    SELECTION_CRITERIA: null       # No additional filtering

  - INPUT_ID: D_AC_003_IN_002
    SOURCE_AC: D_AC_007            # Depends on baseline derivation
    SOURCE_DATASET: ADQSADAS
    SOURCE_VARIABLE: BASE
    SOURCE_CLASS_VARIABLE: BASE
    ROLE: baseline_value
    REQUIRED: true

  - INPUT_ID: D_AC_003_IN_003      # Additional input for grouping
    SOURCE_DATASET: ADQSADAS
    SOURCE_VARIABLE: USUBJID
    SOURCE_CLASS_VARIABLE: USUBJID
    ROLE: grouping_variable
    SELECTION_CRITERIA: null

OUTPUTS:
  - OUTPUT_ID: D_AC_003_OUT_001
    VARIABLE_NAME: CHG
    DESCRIPTION: Change from baseline in ADAS-Cog (11) total score
    BY_VARIABLES: ["USUBJID", "AVISIT"]  # Output structure specified

METHOD:
  IMPLEMENTATION: base::subtract   # Inherited from template
  FORMULA: "AVAL - BASE"
```

**Key Points**:
- Template defines **pattern**: subtract baseline from post-baseline
- Instance adds **specifics**: ADAS-Cog in ADQSADAS dataset
- Instance includes **dependencies**: D_AC_005 and D_AC_007
- Instance specifies **structure**: One CHG per USUBJID per AVISIT

### Example 2: Model-Based Analysis with Complex Inputs

**Template: T_AC_008 (ANCOVA Pairwise Comparison)**

```yaml
AC_ID: T_AC_008
AC_NAME: ANCOVA Pairwise Comparison
AC_PURPOSE: Perform pairwise treatment comparisons adjusted for baseline using ANCOVA

ONTOLOGY:
  STATO_IRI: http://purl.obolibrary.org/obo/STATO_0000179
  STATO_LABEL: ANCOVA

INPUTS:
  - INPUT_ID: T_AC_008_IN_001
    SOURCE_CLASS_VARIABLE: CHG     # Dependent variable
    ROLE: study design dependent variable
    REQUIRED: true
    DATA_TYPE: Numeric
    MEASUREMENT_SCALE: continuous

  - INPUT_ID: T_AC_008_IN_002
    SOURCE_CLASS_VARIABLE: BASE    # Covariate
    ROLE: model fixed effect term
    REQUIRED: true
    DATA_TYPE: Numeric
    MEASUREMENT_SCALE: continuous

  - INPUT_ID: T_AC_008_IN_003
    SOURCE_CLASS_VARIABLE: TRTPN   # Treatment factor
    ROLE: model fixed effect term
    REQUIRED: true
    DATA_TYPE: Numeric
    MEASUREMENT_SCALE: categorical

OUTPUTS:
  - OUTPUT_ID: T_AC_008_OUT_001
    VARIABLE_NAME: LSMEAN
    DESCRIPTION: Least squares means by treatment
    BY_VARIABLES: ["TRTP"]

  - OUTPUT_ID: T_AC_008_OUT_002
    VARIABLE_NAME: LSMEAN_DIFF
    DESCRIPTION: LS mean differences (pairwise comparisons)
    BY_CONTRAST:
      TYPE: pairwise_vs_reference

METHOD:
  IMPLEMENTATION: stats::lm
  FORMULA: "CHG ~ BASE + TRTPN + ..."
```

**Instance: M_AC_022 (ADAS-Cog ANCOVA at Week 24)**

```yaml
AC_ID: M_AC_022
AC_TEMPLATE: T_AC_008
AC_NAME: ADAS-Cog Pairwise Comparisons - ANCOVA
AC_PURPOSE: Perform pairwise treatment comparisons for ADAS-Cog change from baseline at Week 24

INPUTS:
  - INPUT_ID: M_AC_022_IN_001
    SOURCE_AC: D_AC_003            # Uses derived CHG
    SOURCE_CLASS_VARIABLE: CHG
    SOURCE_VARIABLE: CHG
    SOURCE_DATASET: ADQSADAS
    ROLE: study design dependent variable
    DESCRIPTION: Change from baseline in ADAS-Cog (11) Total Score
    REQUIRED: true

  - INPUT_ID: M_AC_022_IN_002      # Baseline covariate
    SOURCE_DATASET: ADQSADAS       # Direct from dataset (not derived)
    SOURCE_CLASS_VARIABLE: BASE
    SOURCE_VARIABLE: BASE
    ROLE: model fixed effect term
    SELECTION_CRITERIA: null

  - INPUT_ID: M_AC_022_IN_003      # Treatment factor
    SOURCE_DATASET: ADQSADAS
    SOURCE_CLASS_VARIABLE: TRTPN
    SOURCE_VARIABLE: TRTPN
    ROLE: model fixed effect term
    DESCRIPTION: Treatment as class variable (Placebo, Low Dose, High Dose)

  - INPUT_ID: M_AC_022_IN_004      # Additional covariate
    SOURCE_DATASET: ADQSADAS
    SOURCE_CLASS_VARIABLE: SITEGRy
    SOURCE_VARIABLE: SITEGR1
    ROLE: model fixed effect term
    DESCRIPTION: Site group stratification variable

  - INPUT_ID: M_AC_022_IN_005      # Population flag
    SOURCE_DATASET: ADQSADAS
    SOURCE_VARIABLE: EFFFL
    ROLE: population_flag
    DESCRIPTION: Efficacy Population Flag
    SELECTION_CRITERIA: "EFFFL = 'Y'"

  - INPUT_ID: M_AC_022_IN_006      # Analysis flag
    SOURCE_DATASET: ADQSADAS
    SOURCE_CLASS_VARIABLE: ANLzzFL
    SOURCE_VARIABLE: ANL01FL
    ROLE: population_flag
    SELECTION_CRITERIA: "ANL01FL = 'Y'"

  - INPUT_ID: M_AC_022_IN_007      # Visit selection
    SOURCE_DATASET: ADQSADAS
    SOURCE_CLASS_VARIABLE: AVISIT
    SOURCE_VARIABLE: AVISIT
    ROLE: grouping_variable
    SELECTION_CRITERIA: "AVISIT = 'Week 24'"

OUTPUTS:
  - OUTPUT_ID: M_AC_022_OUT_001
    VARIABLE_NAME: LSMEAN
    DESCRIPTION: Least squares mean (adjusted mean) by treatment group
    BY_VARIABLES: ["TRTP"]

  - OUTPUT_ID: M_AC_022_OUT_002
    VARIABLE_NAME: LSMEAN_DIFF
    DESCRIPTION: LS mean difference (pairwise comparison vs placebo)
    BY_CONTRAST:
      VARIABLE: TRTP
      TYPE: pairwise_vs_reference
      REFERENCE_LEVEL: "Placebo"
      COMPARISONS:
        - "Xanomeline Low Dose vs Placebo"
        - "Xanomeline High Dose vs Placebo"

METHOD:
  MODEL_FORMULA: "CHG = BASE + TREATMENT + SITEGR1"
  PARAMETERS:
    comparison: TRTPN
    lsmeans: true
    confidence_level: 0.95
```

**Key Points**:
- Template defines **ANCOVA pattern**: dependent variable, baseline covariate, treatment
- Instance adds **study specifics**: ADAS-Cog at Week 24
- Instance includes **population**: EFFFL='Y' AND ANL01FL='Y'
- Instance specifies **comparisons**: Pairwise vs Placebo with specific treatment names
- Shows **mixed sourcing**: Some inputs from other ACs (D_AC_003), some directly from dataset

### Example 3: Complete Analysis Pipeline

```
[SDTM Data: QS domain]
        ↓
D_AC_004: SDTM to Item AVAL
  Template: T_AC_003 (SDTM to AVAL Mapping)
  Inputs: QS.QSSTRESN (by QSTESTCD)
  Outputs: ADQSADAS.AVAL (items)
        ↓
D_AC_005: Sum Items to Total Score
  Template: T_AC_006 (Sum with Missing Adjustment)
  Inputs: D_AC_004.AVAL (11 items)
  Outputs: ADQSADAS.AVAL (ACTOT)
        ↓
D_AC_007: Define Baseline
  Template: T_AC_004 (SDTM to BASE Mapping)
  Inputs: D_AC_005.AVAL (at baseline visit)
  Outputs: ADQSADAS.BASE
        ↓
D_AC_003: Change from Baseline
  Template: T_AC_002 (Change from Baseline)
  Inputs: D_AC_005.AVAL, D_AC_007.BASE
  Outputs: ADQSADAS.CHG
        ↓
M_AC_022: ANCOVA Pairwise Comparison
  Template: T_AC_008 (ANCOVA Pairwise)
  Inputs: D_AC_003.CHG, BASE, TRTPN, SITEGR1 + population flags
  Outputs: LSMEAN, LSMEAN_DIFF (by TRTP)
        ↓
S_AC_001: Descriptive Statistics
  Template: T_AC_009 (Descriptive Summary)
  Inputs: D_AC_005.AVAL, D_AC_003.CHG
  Outputs: N, MEAN, SD, MEDIAN, MIN, MAX (by TRTP, AVISIT)
```

**Traceability Example**:

If someone asks "Where does the ANCOVA p-value come from?", we can trace:
1. M_AC_022 uses CHG from D_AC_003
2. D_AC_003 calculates AVAL - BASE
3. AVAL comes from D_AC_005 (sum of items)
4. Items come from D_AC_004 (SDTM mapping)
5. BASE comes from D_AC_007 (baseline definition)

Complete lineage from source SDTM to final result.

---

## Review Discussion Points

### Abstraction Level

**Questions for Discussion**:
- Is the template/instance split at the right level of abstraction?
- Should templates be more generic (further from execution)?
- Should templates be more specific (closer to common use cases)?
- Are there scenarios where we need a **third level**?
  - Template → Template Variant → Instance
  - Example: ANCOVA Template → ANCOVA with Repeated Measures → Study Instance
- How do we handle **parameterized templates**?
  - Example: T_AC_009 could have parameter: "which statistics to compute"
  - Should this be in template or instance?

### Executability

**Questions for Discussion**:
- Is there sufficient information to generate executable code?
- What additional fields would facilitate automation?
- Should `SELECTION_CRITERIA` be structured instead of free text?
  - Free text: "PARAMCD = 'ACTOT' AND AVISIT = 'Week 24'"
  - Structured: List of conditions with operators
- How do we handle **complex logic** (nested conditions, OR logic)?
- Should we include **programming hints** (loop structure, merge keys)?

### Roles and Semantics

**Questions for Discussion**:
- Is the current ROLE vocabulary comprehensive?
  - Current: baseline_value, post_baseline_value, grouping_variable, model fixed effect term, population_flag, etc.
  - Missing: Any roles we commonly use that aren't captured?
- Should roles have a **controlled terminology** (official list)?
- Are STATO references sufficient, or do we need additional ontologies?
  - CDISC Glossary terms?
  - Clinical trial terminology (CTTL)?
  - Additional statistical ontologies?
- How do we handle **domain-specific** statistical methods not in STATO?

### Dependencies

**Questions for Discussion**:
- How should we handle **optional dependencies**?
  - Current: All SOURCE_AC are required
  - Need: "Use D_AC_003 if available, else use D_AC_005"
- Should we version dependencies?
  - Example: SOURCE_AC: "D_AC_003" vs SOURCE_AC: "D_AC_003:v1.0"
  - Pro: Reproducibility
  - Con: Complexity
- How do we represent **alternative analysis paths**?
  - Example: "Use imputed data if available, else use complete cases"
- Should we capture **soft dependencies** (referenced but not consumed)?
  - Example: Method document references prior analysis for context

### Maintenance and Evolution

**Questions for Discussion**:
- How do we handle **template evolution**?
  - What happens to instances when template is updated?
  - Should instances "lock" to a template version?
- Is there a need for **template compatibility** mechanisms?
  - Example: "This instance requires T_AC_002 v1.0 or later"
- How do we **deprecate** old patterns?
  - Mark as deprecated but keep for historical instances?
  - Provide migration path to new template?
- Should we support **template inheritance**?
  - Example: T_AC_008_REPEATED extends T_AC_008
  - More complex but more flexible

### Organizational Adoption

**Questions for Discussion**:
- What training is needed for **biostatisticians** to write templates?
- What training is needed for **programmers** to implement instances?
- How do we ensure **quality control**?
  - Peer review process for templates?
  - Automated validation for instances?
- Should there be **centralized template library** vs study-specific?
- How do we handle **organization-specific** methods not in CDISC standards?

---

## References

### CDISC Standards
- **ADaMIG v1.3**: Analysis Data Model Implementation Guide (Version 1.3)
  - Source for standard class variable names (AVAL, BASE, CHG, PARAMCD, etc.)
  - Defines Basic Data Structure and other dataset classes
  - Available: https://www.cdisc.org/standards/foundational/adam

### Ontologies
- **STATO**: Statistics Ontology
  - Provides semantic definitions for statistical methods and concepts
  - Website: http://stato-ontology.org/
  - Browser: https://www.ebi.ac.uk/ols/ontologies/stato
  - Example terms:
    - STATO_0000175: difference
    - STATO_0000179: analysis of covariance (ANCOVA)
    - STATO_0000251: continuous data

### Study Context
- **CDISC Pilot Study**: Reference implementation
  - Public study data demonstrating CDISC standards
  - Dataset ADQSADAS: Questionnaire analysis dataset for ADAS-Cog assessment
  - Available: https://github.com/cdisc-org/sdtm-adam-pilot-project

### Additional Resources
- **ADaM Basic Data Structure (BDS)**: Core ADaM dataset structure with PARAMCD, AVAL, BASE, CHG pattern
- **ADAS-Cog (11)**: Alzheimer's Disease Assessment Scale - Cognitive Subscale (11-item version)
  - Primary endpoint in many Alzheimer's disease trials
  - Total score ranges 0-70 (higher = worse cognitive impairment)

---

## Questions or Feedback?

This metadata structure is designed to be discussed, refined, and improved based on real-world use. Please bring questions, concerns, and suggestions to the working group discussion.

**Contact**: CDISC Analysis Concepts Team

**Last Updated**: November 2025

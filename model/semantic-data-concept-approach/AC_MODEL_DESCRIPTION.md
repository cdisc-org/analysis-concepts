# AC Model Description for Principles Generation

## Purpose

This document describes the Analysis Concept (AC) and Derivation Concept (DC) cube-based model as input for generating guiding principles.

---

## Model Overview

The AC/DC model uses a **cube-based approach** to represent analysis and derivation concepts at two levels:

- **Library level**: Reusable templates defining analysis patterns
- **Study level**: Specific instances binding templates to study data

---

## Core Model Elements

### 1. Analysis/Derivation (Template and Instance)

**Template** (Library level):

- `ID`: Unique template identifier (e.g., `T_AC_ANCOVA`, `T_DC_018`)
- `name`: Descriptive name (e.g., `ANCOVA_ChangeFromBaseline`)
- `description`: Human-readable purpose
- `template_type`: Either "Analysis" or "Derivation"
- `formula` (Derivation only): Abstract calculation (e.g., `Value - BaselineValue`)

**Instance** (Study level):

- `ID`: Unique study instance identifier (e.g., `S_AC_001`)
- `name`: Study-specific name (e.g., `ANCOVA Change from Baseline ADAS-Cog(11) Week 24`)
- `instance_of`: Reference to template ID

**Design rationale**: Separating templates from instances enables reuse across studies while maintaining study-specific traceability.

---

### 2. Method

- `name`: Method identifier (e.g., `FitANCOVAModel`, `CalculateChangeFromBaseline`)
- `model` (Analysis): Statistical model specification (e.g., `CHG ~ BASE + SITEID + TRTP`)
- `derivation` (Derivation): Calculation expression (e.g., `change_value = analysis_value - baseline_value`)
- `comparison`: Comparison specification (e.g., `LSMeans pairwise`)

**Relationships**:

- `implements` -> Analysis/Derivation (one method implements one concept)
- `input` -> Cube (method takes input cube)
- `output` -> Cube (method produces output cube(s))

**Design rationale**: Methods encapsulate the "how" separate from the "what" (concept) and "with what" (data/cubes).

---

### 3. Cube (Input and Output)

Represents a multi-dimensional data structure analogous to OLAP cubes or ADaM BDS datasets.

- `name`: Cube identifier (e.g., `ancova_input`, `treatment_results`)
- `label`: Human-readable description
- `dimensions`: List of dimension names (output cubes only)

**Relationships**:

- `contains` -> Dimension (categorical axes)
- `contains` -> Measure (quantitative values)
- `qualified by` -> Attribute (metadata)

**Design rationale**: Cubes provide a consistent abstraction for analysis data that maps naturally to ADaM BDS structure and statistical operations.

---

### 4. Dimension

Represents a categorical axis of the cube (grouping/stratification variable).

- `name`: Dimension identifier (e.g., `subject`, `treatment`, `site`)
- `role`: Semantic role (`identifier`, `factor`, `reference`)
- `datatype`: Data type (`string`, `numeric`, `CodedValue`)

**Relationships**:

- `is_a` -> DataConcept (semantic meaning)

**Examples**:

- `subject` (role: identifier) - unique participant
- `treatment` (role: factor) - treatment groups for comparison
- `site` (role: identifier) - clinical site

---

### 5. Measure

Represents a quantitative value in the cube.

- `name`: Measure identifier (e.g., `change_value`, `lsmean`, `p_value`)
- `role`: Semantic role (`dependent`, `covariate`, `estimate`, `difference`, `significance`, `confidence_bound`, `standard_error`)
- `datatype`: Always `numeric`

**Relationships**:

- `is_a` -> DataConcept (semantic meaning)

**Examples**:

- Input measures: `change_value` (dependent), `baseline_value` (covariate)
- Output measures: `lsmean` (estimate), `lsmean_diff` (difference), `p_value` (significance)

---

### 6. Attribute

Represents qualifying metadata that can be fixed by slices.

- `name`: Attribute identifier (e.g., `parameter`, `timepoint`, `population_flag`, `imputation_method`)
- `role`: Always `qualifier`
- `datatype`: `string` or `CodedValue`
- `value`: Empty at template level, bound at instance level

**Design rationale**: Attributes represent the "context" of an analysis - what parameter, what timepoint, what population, etc. Slices fix these values.

---

### 7. Slice

Represents a constrained view of a cube with specific attribute values fixed.

- `name`: Slice identifier (e.g., `ancova_input_slice`)

**Relationships**:

- `constrains` -> Cube (which cube is sliced)
- `fix` -> Attribute (which attributes are constrained)

**Example at study level**:

- Slice fixes: `parameter = ADAS-Cog(11)`, `timepoint = Week 24`, `population_flag = Y`, `imputation_method = LOCF`

**Design rationale**: Slices define the exact subset of data used for an analysis without modifying the underlying cube structure.

---

### 8. DataConcept

Provides semantic meaning and CDISC alignment for structural elements.

- `name`: Concept name (e.g., `subject`, `treatment`, `change_value`)
- `description`: Semantic definition
- `adam_variable`: ADaM variable mapping (e.g., `USUBJID`, `TRTP`, `CHG`)

**Relationships**:

- Dimension/Measure `is_a` -> DataConcept

**Design rationale**: DataConcepts separate semantic meaning from structural representation, enabling consistent terminology and CDISC alignment.

---

## Key Design Patterns

### Pattern 1: Template/Instance Separation

```text
Library Level:
  Analysis (template)
    ID: T_AC_ANCOVA
    name: ANCOVA_ChangeFromBaseline
    Attribute: parameter (value: [empty])
    Attribute: timepoint (value: [empty])

Study Level:
  Analysis (instance)
    ID: S_AC_001
    instance_of: T_AC_ANCOVA
    Attribute: parameter (value: ADAS-Cog(11))
    Attribute: timepoint (value: Week 24)
```

**Benefit**: Single template reused across studies with different parameters.

### Pattern 2: Input/Output Cube Transformation

```text
Input Cube (subject-level data)
  Dimensions: [subject, treatment, site]
  Measures: [change_value, baseline_value]

  --> Method: FitANCOVAModel -->

Output Cube 1 (treatment-level results)
  Dimensions: [treatment]
  Measures: [lsmean, lsmean_se, ci_lower, ci_upper]

Output Cube 2 (comparison-level results)
  Dimensions: [treatment, comparison_group]
  Measures: [lsmean_diff, p_value]
```

**Benefit**: Clear lineage from input data through analysis to results.

### Pattern 3: Semantic Typing

```text
Dimension (subject)
  --> is_a --> DataConcept (subject)
                 adam_variable: USUBJID
                 description: Study participant
```

**Benefit**: Structural elements inherit meaning and CDISC alignment from concepts.

---

## Relationship Summary

| From | Relationship | To |
|------|--------------|-----|
| Method | implements | Analysis/Derivation |
| Method | input | Cube |
| Method | output | Cube |
| Cube | contains | Dimension |
| Cube | contains | Measure |
| Cube | qualified by | Attribute |
| Slice | constrains | Cube |
| Slice | fix | Attribute |
| Dimension | is_a | DataConcept |
| Measure | is_a | DataConcept |
| Instance | instance_of | Template |

---

## Example: ANCOVA Analysis

### Library Template

```yaml
Analysis:
  ID: T_AC_ANCOVA
  name: ANCOVA_ChangeFromBaseline
  description: ANCOVA analysis of change from baseline

Method:
  name: FitANCOVAModel
  model: change_value ~ baseline_value + site + treatment
  comparison: LSMeans pairwise
  implements: T_AC_ANCOVA
  input: ancova_input
  output: [treatment_results, comparison_results]

Input Cube (ancova_input):
  Dimensions: [subject, treatment, site]
  Measures: [change_value (dependent), baseline_value (covariate)]
  Attributes: [parameter, timepoint, population_flag, imputation_method]
```

### Study Instance

```yaml
Analysis:
  ID: S_AC_001
  name: ANCOVA Change from Baseline ADAS-Cog(11) Week 24
  instance_of: T_AC_ANCOVA

Slice (ancova_input_slice):
  constrains: ancova_input
  fixes:
    parameter: ADAS-Cog(11)
    timepoint: Week 24
    population_flag: Y (Efficacy population)
    imputation_method: LOCF
```

---

## User Workflow: Three Steps to Execution

The AC/DC model enables a radically simplified workflow. Users only need to perform **three configuration steps** before execution:

### Step 1: Configure AC/DC Templates (from Library)

Copy a template from the library and bind study-specific values in `study_instance_metadata.csv`:

```csv
entity_type,entity_id,name,label,role,datatype,value,parent_entity,relationship,data_concept,adam_class_variable
Derivation,S_DC_001,ChangeFromBaseline Adas-Cog Total Score,...
Method,,CalculateChangeFromBaseline,change_value = analysis_value - baseline_value,...
Cube,chg_input,chg_input,The input dataset,,,,Method,input,,
...
Attribute,,PARAM,,qualifier,string,Adas-Cog(11) Subscore,chg_input_pop_parameter_slice,fix,parameter,PARAM
Attribute,,ITTFL,,qualifier,string,Y,chg_input_pop_parameter_slice,fix,record_population_flag,ITTFL
```

**Key user actions:**

- Set `value` column for Attributes (e.g., `PARAM = Adas-Cog(11) Subscore`, `ITTFL = Y`)
- Specify `adam_class_variable` to map cube elements to ADaM Class variables

### Step 2: Link ADaM Model Variables to ADaM Class Variables

Create `adam_class_variable_mapping.csv` to map your study's actual ADaM variables to the standard ADaM Class variables:

```csv
adam_class_variable,class_datatype,adam_variable,adam_dataset,relationship
PARAM,string,PARAM,ADQSADAS,of_class
USUBJID,string,USUBJID,ADQSADAS,of_class
AVAL,numeric,AVAL,ADQSADAS,of_class
CHG,numeric,CHG,ADQSADAS,of_class
BASE,numeric,BASE,ADQSADAS,of_class
```

**Key user actions:**

- Map each ADaM Class variable to the actual variable name in your dataset
- Specify which dataset contains each variable

### Step 3: Determine Which DCs Go in Which ADaM Dataset

Create `derivation_adam_dataset.csv` to assign derivations to datasets:

```csv
derivation_id,adam_dataset,relationship
S_DC_001,ADQSADAS,contains_dc
```

**Key user actions:**

- Link each derivation instance to its target ADaM dataset

### Then: Execute

With these three files configured, the derivation engine (`execute_derivation.R`) automatically:

1. Reads the metadata from all three CSV files
2. Parses the derivation formula from the Method
3. Maps cube variable names to ADaM variable names
4. Applies slice filters (PARAM, ITTFL, etc.)
5. Executes the calculation on matching records
6. Outputs the result with the new derived variable

```text
=== Metadata-Driven Derivation Execution ===

Method: CalculateChangeFromBaseline
Formula (cube): change_value = analysis_value - baseline_value
Formula (ADaM): CHG = AVAL - BASE

Applying slice filters:
   PARAM = Adas-Cog(11) Subscore
   ITTFL = Y

Records matching slice: 42 of 100

Derivation applied to 42 records
Output variable: CHG

=== Derivation Complete ===
```

---

## Key Insight: Separation of Concerns

The model achieves this simplicity through clear separation:

| Layer | Who Defines | What It Contains |
|-------|-------------|------------------|
| **Library Templates** | Standards body / Organization | Reusable patterns (formulas, cube structures, roles) |
| **Study Configuration** | Study statistician | Specific parameter values, population flags, timepoints |
| **ADaM Class Mapping** | Study programmer | Links to actual ADaM variables |
| **Dataset Assignment** | Study programmer | Which derivations populate which datasets |
| **Execution Engine** | Standards body | Generic processor that reads metadata and executes |

The study team only touches the shaded rows - everything else is reusable infrastructure.

---

## Alignment with Wiki Guiding Principles

This model implements several principles from the [AC/DC Guiding Principles Wiki](https://github.com/cdisc-org/analysis-concepts/wiki):

| Model Feature | Wiki Principle | How Implemented |
|---------------|----------------|-----------------|
| DataConcepts → Cubes → Methods | **A1: Layered Architecture** | Clear separation: Concepts → Structures → Implementations |
| DataConcepts as abstract entities | **A2: Concept Independence** | Concepts defined without study/standard specifics |
| Cube with Dimensions/Measures/Attributes | **A5: Cube-Based Data Organization** | Direct implementation of cube metaphor |
| Slice-based subsetting | **A6: Slice-Based Subsetting** | Slices fix attribute values declaratively |
| Method input/output/arguments | **A7: Method Structure** | Methods declare inputs, outputs explicitly |
| Immutable cubes, DAG structure | **B1: Reproducibility & Provenance** | Methods produce new cubes, no circular deps |
| Method → Slice → Cube → Concept chain | **B2: End-to-End Traceability** | Full traceability from results to concepts |
| DataConcept mappings to ADaM/SDTM/ARS | **C1: CDISC Standards Alignment** | Multi-standard mappings on concepts |
| Template/Instance pattern | **D3: Progressive Refinement** | Templates = logical, Instances = physical level |
| Declarative Method formulas | **D1: Declarative Specification** | "What" specified, not "how" |

---

## Proposed New Principle: Universal Connector Architecture

This model introduces an architectural pattern not explicitly covered in the current wiki principles:

### A-NEW: Universal Connector Architecture

**DataConcepts SHALL serve as the universal abstraction layer connecting analytical structures to external domain models.**

- Cube elements (Dimensions, Measures, Attributes) SHALL reference DataConcepts via `is_a` relationships, NOT domain-specific variables directly
- DataConcepts SHALL support simultaneous mappings to multiple external models (ADaM, SDTM, USDM, ARS, or proprietary)
- Adding support for a new domain model SHALL NOT require changes to existing cube structures or templates
- Templates SHALL be expressed in terms of DataConcepts, enabling portability across organizations
- The same DataConcept MAY map to different representations in different domain models (e.g., `subject` maps to USUBJID in ADaM and SUBJID in SDTM)

**Supported domain model linkages:**

| Domain Model | Mapping Property | Example |
|--------------|------------------|---------|
| ADaM | `adam_variable` | subject → USUBJID |
| SDTM | `sdtm_variable` | subject → SUBJID |
| ARS | `ars_element` | lsmean → AnalysisResult |
| USDM | `usdm_element` | treatment → Intervention |

**Rationale:** This architectural pattern:

- Provides the mechanism (HOW) for achieving C1 (CDISC Alignment) and C4 (Interoperability)
- Enables portable templates that work across organizations with different naming conventions
- Supports multi-standard compliance from a single model definition
- Future-proofs against new standards without breaking existing templates
- Decouples analytical logic from data standard specifics

**Evidence:** The `adam_class_variable_mapping.csv` demonstrates ADaM linkage, but the same pattern applies to any domain model. A DataConcept `change_value` could simultaneously declare `adam_variable: CHG`, `sdtm_variable: --CHG`, and `ars_result: ChangeFromBaselineResult`.

**Priority:** CRITICAL - This is foundational architecture that enables multiple other principles.

---

## Implementation Patterns (Supporting Existing Principles)

### Pattern: Template/Instance Separation

Implements: D3 (Progressive Refinement)

- **Templates** (Library level): Define structural patterns with placeholder values
- **Instances** (Study level): Bind concrete study-specific values to templates
- Templates = Logical level specification; Instances = Physical level execution

**Evidence:** `T_DC_018` (template) and `S_DC_001` (instance) demonstrate reuse of `change_value = analysis_value - baseline_value`.

---

### Pattern: Configuration-Driven Execution

Implements: D1 (Declarative Specification), D2 (KISS), E2 (Machine Readability)

Study-specific analyses specified through metadata configuration rather than custom code:

1. **Template Configuration:** Bind study-specific attribute values
2. **Variable Mapping:** Link study variables to standard class variables
3. **Dataset Assignment:** Specify which concepts populate which datasets

**Evidence:** The `execute_derivation.R` engine is generic - it reads metadata and executes. New derivation types require new templates, not new code.

---

### Pattern: Minimal User Configuration

Implements: D2 (KISS), E4 (Tool-Hidden Complexity)

Study teams only configure study-specific bindings via three CSV files:

- `study_instance_metadata.csv` - template configuration
- `adam_class_variable_mapping.csv` - variable mapping
- `derivation_adam_dataset.csv` - dataset assignment

All structural and computational definitions provided by library templates.

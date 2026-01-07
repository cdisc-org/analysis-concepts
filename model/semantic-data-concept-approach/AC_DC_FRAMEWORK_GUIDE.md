# AC/DC Framework for Traditional ADaM Programmers

## The Problem You Already Know

When you write an ANCOVA program in SAS, you probably do something like this:

```sas
/* Filter to the right population and parameter */
data work.analysis_data;
  set adam.adqsadas;
  where PARAMCD = "ACTOT11" and AVISIT = "Week 24" and EFFFL = "Y";
run;

/* Run the model */
proc mixed data=work.analysis_data;
  class TRTP SITEID;
  model CHG = BASE SITEID TRTP;
  lsmeans TRTP / diff cl;
run;
```

This works. But notice what's **hardcoded**:
- The dataset name (`adqsadas`)
- The filter conditions (`PARAMCD = "ACTOT11"`, etc.)
- The variable names (`CHG`, `BASE`, `TRTP`, `SITEID`)
- The model structure

If you want to run the same analysis for a different parameter or timepoint, you copy-paste and change values. If you want to reuse this across studies, you rewrite it.

---

## What AC/DC Does

**AC/DC separates the "what" from the "how" using three distinct layers:**

```
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 1: Analysis/Derivation Specification                           │
│  (Knows ONLY DataConcepts - nothing about ADaM/SDTM)                  │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  "I need: subject, treatment, change_value, baseline_value"           │
│  "My formula: change_value ~ baseline_value + site + treatment"       │
│  "Filter by: parameter, timepoint, population_flag"                   │
│                                                                       │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │ points to
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  LAYER 2: DataConcepts + Class Variable Mapping (The Hub)             │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  DataConcept        ADaM Class Variable                               │
│  ───────────────────────────────────                                  │
│  subject        ◀── USUBJID                                           │
│  treatment      ◀── TRTxxP                                            │
│  change_value   ◀── CHG                                               │
│  baseline_value ◀── BASE                                              │
│  parameter      ◀── PARAM                                             │
│  timepoint      ◀── AVISIT                                            │
│                                                                       │
└───────────────────────────────────▲───────────────────────────────────┘
                                    │ points to
                                    │
┌───────────────────────────────────┴───────────────────────────────────┐
│  LAYER 3: Sponsor/Study Implementation                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ADaM Class     ◀──  ADaM Variable    ◀──  Dataset                    │
│  ─────────────────────────────────────────────────                    │
│  USUBJID        ◀──  USUBJID          ◀──  ADQSADAS                   │
│  CHG            ◀──  CHG              ◀──  ADQSADAS                   │
│  BASE           ◀──  BASE             ◀──  ADQSADAS                   │
│  TRTxxP         ◀──  TRTP             ◀──  ADQSADAS                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## What Each Layer Knows

| Layer | Knows About | Doesn't Know About |
|-------|-------------|-------------------|
| **1. Specification** | DataConcepts only | ADaM, SDTM, physical datasets |
| **2. Mapping** | DataConcepts ↔ Class Variables | Specific studies, actual datasets |
| **3. Implementation** | Class Variables ↔ Physical data | Semantic meaning, other studies |

---

## The Three Metadata Files (Think of Them Like Specs)

### 1. `analysis_instance_metadata.csv` — Layer 1: "What analysis am I running?"

This is like your analysis specification, but machine-readable:

| entity_type | name | role | value | data_concept |
|------------|------|------|-------|--------------|
| Dimension | treatment | factor | | treatment |
| Dimension | site | factor | | site |
| Measure | change_value | dependent | | change_value |
| Measure | baseline_value | covariate | | baseline_value |
| Attribute | PARAM | qualifier | ADAS-Cog(11) | parameter |
| Attribute | AVISIT | qualifier | Week 24 | timepoint |
| Attribute | EFFFL | qualifier | Y | population_flag |

**Translation for ADaM programmers:**
- `Dimension` with `role=factor` → Your `CLASS` variables in PROC MIXED
- `Measure` with `role=dependent` → Left side of your MODEL statement
- `Measure` with `role=covariate` → Continuous variables on right side of MODEL
- `Attribute` with fixed `value` → Your `WHERE` clause conditions

### 2. `data_concept_class_mapping.csv` — Layer 2: "How do concepts map to ADaM?"

| data_concept | adam_class_variable |
|--------------|---------------------|
| subject | USUBJID |
| treatment | TRTxxP |
| change_value | CHG |
| baseline_value | BASE |
| parameter | PARAM |
| timepoint | AVISIT |

### 3. `adam_class_variable_mapping.csv` — Layer 3: "What's in my actual study?"

| adam_class_variable | adam_variable | adam_dataset |
|--------------------|---------------|--------------|
| USUBJID | USUBJID | ADQSADAS |
| TRTxxP | TRTP | ADQSADAS |
| CHG | CHG | ADQSADAS |
| BASE | BASE | ADQSADAS |

---

## Resolution: Connecting It All Up

When we connect all three layers, concepts resolve to actual data:

**Analysis spec says:**
```
formula: change_value ~ baseline_value + site + treatment
filter:  parameter = "ADAS-Cog(11)", timepoint = "Week 24", population_flag = "Y"
```

**After resolution:**
```
formula: CHG ~ BASE + SITEID + TRTP
filter:  PARAM = "ADAS-Cog(11)" AND AVISIT = "Week 24" AND EFFFL = "Y"
dataset: ADQSADAS
```

| Concept (Layer 1) | Class (Layer 2) | Variable (Layer 3) | Dataset |
|-------------------|-----------------|-------------------|---------|
| change_value | CHG | CHG | ADQSADAS |
| baseline_value | BASE | BASE | ADQSADAS |
| treatment | TRTxxP | TRTP | ADQSADAS |
| subject | USUBJID | USUBJID | ADQSADAS |

---

## Two Execution Approaches

Once the metadata resolves concepts to actual variables, you have two options:

### Option A: Generic Metadata-Driven Code

The code reads metadata at runtime and executes dynamically:

```r
# Generic code - never changes
metadata <- load_analysis_metadata("analysis_instance_metadata.csv")
mappings <- load_mappings("adam_class_variable_mapping.csv")

# Resolve concepts to variables
formula <- resolve_formula(metadata, mappings)  # Returns: CHG ~ BASE + SITEID + TRTP
filters <- resolve_filters(metadata, mappings)   # Returns: PARAM == "ADAS-Cog(11)" & ...
dataset <- resolve_dataset(metadata, mappings)   # Returns: "ADQSADAS"

# Execute
data <- load_data(dataset) %>% apply_filters(filters)
model <- lm(formula, data = data)
```

### Option B: Generate Study-Specific Code

Use metadata to generate traditional code that can be reviewed/validated:

```r
# Generator reads metadata and produces:
# ─────────────────────────────────────────────────────────────

# Generated code for S_AC_001: ANCOVA ADAS-Cog(11) Week 24
# Generated on: 2024-01-15
# Source metadata: analysis_instance_metadata.csv

library(dplyr)
library(emmeans)

# Load data
data <- read.csv("ADQSADAS.csv") %>%
  filter(PARAM == "ADAS-Cog(11)",
         AVISIT == "Week 24",
         EFFFL == "Y")

# Fit model
model <- lm(CHG ~ BASE + SITEID + TRTP, data = data)

# LS Means
emm <- emmeans(model, "TRTP")
pairs(emm)
```

### Comparison

| Aspect | Generic Code | Generated Code |
|--------|--------------|----------------|
| **Code changes** | Never | Generated per analysis |
| **Validation** | Validate the engine once | Validate each generated script |
| **Transparency** | Logic in metadata | Logic visible in code |
| **Debugging** | Trace through metadata | Read traditional code |
| **Regulatory** | May need to explain engine | Familiar to reviewers |

**Hybrid Approach:** Many organizations use both — generic code for development, generated code for submission.

---

## Modular Concepts: A Different Way of Thinking

Traditional ADaM programming often bundles everything into monolithic programs:

```sas
/* Traditional: One big program does everything */
data adqsadas;
  set sdtm.qs;
  /* 500 lines of derivations all in one place */
  AVAL = QSSTRESN;
  if VISITNUM = 1 then ABLFL = "Y";
  BASE = ...; /* complex logic */
  CHG = AVAL - BASE;
  /* ... more derivations ... */
run;
```

**AC/DC breaks this into atomic, composable pieces:**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DERIVATION DEPENDENCY GRAPH                          │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │   ANCOVA    │  Analysis Concept
                    │  (S_AC_001) │
                    └──────┬──────┘
                           │ requires
                           ▼
                    ┌─────────────┐
                    │     CHG     │  Derivation Concept
                    │  (S_DC_004) │
                    └──────┬──────┘
                           │ requires
              ┌────────────┼────────────┐
              ▼            ▼            ▼
       ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
       │    AVAL     │ │    BASE     │ │   ABLFL     │
       │  (S_DC_001) │ │  (S_DC_003) │ │  (S_DC_002) │
       └─────────────┘ └──────┬──────┘ └──────┬──────┘
                              │               │
                              │ requires      │ requires
                              ▼               ▼
                       ┌─────────────┐ ┌─────────────┐
                       │    AVAL     │ │   VISITNUM  │
                       │  (S_DC_001) │ │   (source)  │
                       └─────────────┘ └─────────────┘
```

**Each concept is defined independently:**

| Concept ID | Name | Formula | Depends On |
|------------|------|---------|------------|
| S_DC_001 | AVAL | analysis_value = raw_value | raw_value |
| S_DC_002 | ABLFL | baseline_flag = "Y" when visit = baseline_visit | visit |
| S_DC_003 | BASE | baseline_value = analysis_value when baseline_flag = "Y" | analysis_value, baseline_flag |
| S_DC_004 | CHG | change_value = analysis_value - baseline_value | analysis_value, baseline_value |
| S_AC_001 | ANCOVA | change_value ~ baseline_value + site + treatment | change_value, baseline_value, site, treatment |

---

## Why Modular? Traceability.

**Traditional approach:** "Where does CHG come from?"
- Search through 500-line program
- Hope comments are accurate
- No formal dependency tracking

**AC/DC approach:** "Where does CHG come from?"

```
Query: What does S_AC_001 (ANCOVA) depend on?

Answer:
  S_AC_001 (ANCOVA)
    └── requires S_DC_004 (CHG)
          └── requires S_DC_001 (AVAL)
          └── requires S_DC_003 (BASE)
                └── requires S_DC_001 (AVAL)
                └── requires S_DC_002 (ABLFL)
```

**Benefits of modular traceability:**

| Benefit | Description |
|---------|-------------|
| **Impact analysis** | Change ABLFL logic → instantly see what's affected |
| **Validation** | Validate each concept independently |
| **Reuse** | Same CHG derivation used by multiple analyses |
| **Documentation** | The graph IS the documentation |
| **Debugging** | Trace issues to specific atomic concept |

---

## Bidirectional Flow: Specification to Execution

The AC/DC framework works in **two directions** depending on where you are in the study lifecycle:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TWO DIRECTIONS OF FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

DIRECTION 1: TOP-DOWN (SAP Writing / Planning)
══════════════════════════════════════════════
"What do I need to produce this analysis?"

    ┌─────────────┐
    │   ANCOVA    │  Start here: Define the analysis
    │  (S_AC_001) │
    └──────┬──────┘
           │ requires what?
           ▼
    ┌─────────────┐
    │ change_value│  Analysis needs CHG
    │ baseline_val│  Analysis needs BASE
    │ treatment   │  Analysis needs TRTP
    └──────┬──────┘
           │ which derivations provide these?
           ▼
    ┌─────────────────────────────────────┐
    │  Required Derivation Concepts:      │
    │  • S_DC_004 (CHG)                   │
    │  • S_DC_003 (BASE)                  │
    │  • S_DC_002 (ABLFL)                 │
    │  • S_DC_001 (AVAL)                  │
    └─────────────────────────────────────┘


DIRECTION 2: BOTTOM-UP (Execution / Traceability)
═════════════════════════════════════════════════
"Where did this result come from?"

    ┌─────────────────────────────────────┐
    │  LS Mean for Treatment A: 2.34      │  Start here: A result
    └──────┬──────────────────────────────┘
           │ produced by?
           ▼
    ┌─────────────┐
    │   ANCOVA    │  Which used CHG from...
    │  (S_AC_001) │
    └──────┬──────┘
           │ which used?
           ▼
    ┌─────────────┐
    │ S_DC_004    │  CHG = AVAL - BASE
    │   (CHG)     │
    └──────┬──────┘
           │ which came from?
           ├───────────────┐
           ▼               ▼
    ┌─────────────┐ ┌─────────────┐
    │ S_DC_001    │ │ S_DC_003    │
    │   (AVAL)    │ │   (BASE)    │
    └─────────────┘ └──────┬──────┘
                           │
                    ... back to source
```

---

## At SAP Writing Time: Top-Down Discovery

When you define an analysis in the SAP, the framework tells you what you need:

**Step 1: Define the Analysis Concept**
```
Analysis: ANCOVA Change from Baseline
Formula:  change_value ~ baseline_value + site + treatment
Filter:   parameter, timepoint, population_flag
```

**Step 2: System identifies required DataConcepts**
```
Required concepts for this analysis:
  ✓ change_value   (dependent variable)
  ✓ baseline_value (covariate)
  ✓ site           (factor)
  ✓ treatment      (factor)
  ✓ subject        (identifier)
  ✓ parameter      (filter)
  ✓ timepoint      (filter)
  ✓ population_flag (filter)
```

**Step 3: System identifies required Derivation Concepts**
```
To provide these concepts, you need these derivations:

  change_value   ← S_DC_004 (CHG = AVAL - BASE)
                     ├── S_DC_001 (AVAL)
                     └── S_DC_003 (BASE)
                            ├── S_DC_001 (AVAL)
                            └── S_DC_002 (ABLFL)

  baseline_value ← S_DC_003 (BASE)
                     └── (already included above)

  population_flag ← S_DC_005 (EFFFL)
                     └── ... criteria derivation
```

**Step 4: Complete derivation checklist for ADaM spec**
```
┌─────────────────────────────────────────────────────────────────┐
│  ADaM Derivations Required for S_AC_001 (ANCOVA)                │
├──────────┬──────────────────────────────────────────────────────┤
│ Priority │ Derivation                                           │
├──────────┼──────────────────────────────────────────────────────┤
│    1     │ S_DC_001: AVAL (analysis value from raw)             │
│    2     │ S_DC_002: ABLFL (baseline flag)                      │
│    3     │ S_DC_003: BASE (baseline value)                      │
│    4     │ S_DC_004: CHG (change from baseline)                 │
│    5     │ S_DC_005: EFFFL (efficacy population flag)           │
└──────────┴──────────────────────────────────────────────────────┘
```

---

## At Execution/Submission Time: Full Traceability

Once everything is linked, you get complete traceability in both directions:

**Forward trace: "What does this analysis need?"**
```
S_AC_001 (ANCOVA)
  ├── Input data concepts:
  │     ├── change_value   → CHG → ADQSADAS.CHG
  │     ├── baseline_value → BASE → ADQSADAS.BASE
  │     ├── treatment      → TRTP → ADQSADAS.TRTP
  │     └── site           → SITEID → ADQSADAS.SITEID
  │
  ├── Filter conditions:
  │     ├── parameter = "ADAS-Cog(11)" → PARAM
  │     ├── timepoint = "Week 24"      → AVISIT
  │     └── population_flag = "Y"      → EFFFL
  │
  └── Derivation chain:
        S_DC_004 (CHG) ← S_DC_001 (AVAL) + S_DC_003 (BASE)
        S_DC_003 (BASE) ← S_DC_001 (AVAL) + S_DC_002 (ABLFL)
```

**Backward trace: "Where did this result come from?"**
```
Result: LS Mean Difference = -3.2, p = 0.023

Produced by: S_AC_001 (ANCOVA)
  Method: lm(CHG ~ BASE + SITEID + TRTP)

  CHG values derived by: S_DC_004
    Formula: CHG = AVAL - BASE

    AVAL derived by: S_DC_001
      Formula: AVAL = QSSTRESN (from SDTM.QS)

    BASE derived by: S_DC_003
      Formula: BASE = AVAL where ABLFL = "Y"

      ABLFL derived by: S_DC_002
        Formula: ABLFL = "Y" where VISITNUM = 1

Complete source chain: SDTM.QS.QSSTRESN → AVAL → BASE/CHG → ANCOVA → Result
```

---

## The Lifecycle View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STUDY LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

 PLANNING (SAP)              IMPLEMENTATION              SUBMISSION
 ─────────────────          ──────────────────          ──────────────────

 ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
 │ Define      │            │ Execute     │            │ Trace       │
 │ Analyses    │───────────▶│ Derivations │───────────▶│ Results     │
 │ (AC)        │            │ & Analyses  │            │             │
 └──────┬──────┘            └─────────────┘            └──────┬──────┘
        │                                                     │
        │ TOP-DOWN                                  BOTTOM-UP │
        │ "What do I need?"                  "Where did this  │
        │                                     come from?"     │
        ▼                                                     ▼
 ┌─────────────┐                                       ┌─────────────┐
 │ Discover    │                                       │ Full        │
 │ Required    │                                       │ Traceability│
 │ Derivations │                                       │ Report      │
 │ (DC)        │                                       │             │
 └─────────────┘                                       └─────────────┘
```

---

## Practical Example: SAP to Traceability

**1. SAP Author defines analysis:**
> "Primary efficacy analysis: ANCOVA of change from baseline in ADAS-Cog(11) at Week 24"

**2. System generates derivation requirements:**
```
To execute this analysis, ensure these derivations exist:
- CHG (change from baseline)
- BASE (baseline value)
- ABLFL (baseline flag)
- AVAL (analysis value)
- EFFFL (efficacy population)
```

**3. ADaM programmer implements derivations with concept IDs**

**4. At submission, reviewer asks:** "How was the LS Mean difference of -3.2 calculated?"

**5. System provides complete trace:**
```
LS Mean Difference: -3.2 (p=0.023)
├── Analysis: S_AC_001 (ANCOVA)
├── Method: emmeans pairwise comparison
├── Input variable: CHG
│   └── Derivation: S_DC_004 (CHG = AVAL - BASE)
│       ├── AVAL from S_DC_001
│       └── BASE from S_DC_003
│           └── Depends on ABLFL from S_DC_002
├── Filter: PARAM="ADAS-Cog(11)", AVISIT="Week 24", EFFFL="Y"
└── Dataset: ADQSADAS (N=245 subjects)
```

---

## Comparison: Traditional vs. AC/DC

| Aspect | Traditional | AC/DC |
|--------|-------------|-------|
| **Structure** | Monolithic programs | Atomic concepts with dependencies |
| **Reuse** | Copy-paste between studies | Reference same concept definition |
| **Traceability** | Manual documentation | Built into the graph |
| **Change impact** | Grep and hope | Query the dependency graph |
| **Validation** | Validate entire program | Validate individual concepts |
| **Testing** | End-to-end only | Unit test each concept |

---

## Why Bother?

| Benefit | What It Means |
|---------|---------------|
| **Reusability** | Same analysis/derivation template works across studies |
| **Traceability** | Metadata documents exactly what was done and why |
| **Automation** | Generate analyses from specs programmatically |
| **Validation** | Validate individual concepts, not monolithic programs |
| **Flexibility** | Change parameter/timepoint without touching code |
| **Impact Analysis** | Know exactly what's affected when something changes |

**Same spec, different study:**

| Concept | Study A resolves to | Study B resolves to |
|---------|--------------------|--------------------|
| change_value | ADQSADAS.CHG | ADEFF.CHG |
| treatment | ADQSADAS.TRTP | ADEFF.TRT01P |

The analysis definition stays identical. Only Layer 3 changes.

---

## The "DC" Part (Derivation Concepts)

The same three-layer pattern applies to derivations:

Instead of hardcoding:
```sas
CHG = AVAL - BASE;
```

You define it in metadata:
```
Derivation: S_DC_004
Formula: target = analysis_value - baseline_value
Depends on: S_DC_001 (AVAL), S_DC_003 (BASE)
```

The derivation logic is documented, reusable, traceable, and its dependencies are explicit.

---

## Summary: Both Directions

| Direction | When | Purpose |
|-----------|------|---------|
| **Top-Down** | SAP writing, planning | Discover what derivations are needed |
| **Bottom-Up** | Submission, audit, QC | Trace results back to source |

**The same metadata structure supports both directions** — once the concepts are linked, traceability is automatic.

---

---

## Optional: Natural Language Descriptions with Phrases

The AC/DC framework also supports generating **human-readable descriptions** of analyses using a Phrase/Sentence structure. This bridges the gap between machine-readable metadata and natural language documentation.

### The Concept

Each analysis can be described by a **Sentence** composed of **Phrases**. Each phrase maps to a specific part of the analysis definition:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SENTENCE: "Analysis of change from baseline in ADAS-Cog(11) at Week 24    │
│            using ANCOVA with baseline, site, and treatment as covariates   │
│            in the efficacy population"                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ composed of
                                    ▼
┌──────────────────┬──────────────────┬──────────────────┬───────────────────┐
│ Phrase 1         │ Phrase 2         │ Phrase 3         │ Phrase 4          │
│ "Analysis of     │ "in ADAS-Cog(11)"│ "at Week 24"     │ "in the efficacy  │
│  change from     │                  │                  │  population"      │
│  baseline"       │                  │                  │                   │
├──────────────────┼──────────────────┼──────────────────┼───────────────────┤
│ Maps to:         │ Maps to:         │ Maps to:         │ Maps to:          │
│ Measure          │ Attribute        │ Attribute        │ Attribute         │
│ (change_value)   │ (parameter)      │ (timepoint)      │ (population_flag) │
└──────────────────┴──────────────────┴──────────────────┴───────────────────┘
```

### How It Works

**1. Define phrase templates linked to metadata elements:**

| Phrase ID | Template | Linked To | Example Value |
|-----------|----------|-----------|---------------|
| P001 | "Analysis of {measure}" | Measure (dependent) | "Analysis of change from baseline" |
| P002 | "in {parameter}" | Attribute (parameter) | "in ADAS-Cog(11)" |
| P003 | "at {timepoint}" | Attribute (timepoint) | "at Week 24" |
| P004 | "using {method}" | Method | "using ANCOVA" |
| P005 | "in the {population} population" | Attribute (population_flag) | "in the efficacy population" |

**2. Compose sentences from phrases:**

```
Sentence for S_AC_001:
  = P001 + P002 + P003 + P004 + P005
  = "Analysis of change from baseline in ADAS-Cog(11) at Week 24
     using ANCOVA in the efficacy population"
```

### Benefits

| Benefit | Description |
|---------|-------------|
| **Auto-generated documentation** | SAP text generated from metadata |
| **Consistency** | Same phrase structure across all analyses |
| **Linked to source** | Each phrase traces back to a specific metadata element |
| **Multi-language** | Define phrase templates in different languages |
| **Change propagation** | Update parameter value → sentence updates automatically |

### Example: From Metadata to SAP Text

**Metadata defines:**
```
Analysis: S_AC_001
Measure (dependent): change_value → "change from baseline"
Attribute (parameter): "ADAS-Cog(11)"
Attribute (timepoint): "Week 24"
Attribute (population): "Y" → "efficacy"
Method: "ANCOVA"
```

**System generates:**
> "The primary efficacy analysis will be an analysis of change from baseline
> in ADAS-Cog(11) at Week 24 using ANCOVA with baseline value, site, and
> treatment as covariates, performed in the efficacy population."

This natural language description is **traceable** — each phrase links back to the metadata element that generated it.

---

## One-Sentence Summary

**AC/DC separates what you want to do (Layer 1) from how concepts map to standards (Layer 2) from where your actual data lives (Layer 3) — with atomic, modular concepts that form a traceable dependency graph, resolving to either generic or generated executable code, and optionally generating human-readable documentation through linked phrases.**

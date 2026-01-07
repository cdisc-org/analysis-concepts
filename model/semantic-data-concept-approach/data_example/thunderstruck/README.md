# Thunderstruck Examples: Analysis Concept Cube Model

This directory contains Thunderstruck DSL representations of the Analysis Concept (AC) and Derivation Concept (DC) cube-based model from the draw.io diagrams.

## Source Materials

These examples are based on:

- `analysis_concept_cube.drawio` - ChangeFromBaseline derivation template
- `analysis_concept_cube_ac_library.drawio` - ANCOVA analysis template
- `analysis_concept_cube_ac_study.drawio` - ANCOVA study instance

## Files

| File | Description | Source Diagram |
|------|-------------|----------------|
| `concepts-data.tsk` | Pure semantic DataConcept definitions (no mappings) | All diagrams |
| `model-mappings.tsk` | External model variables -> DataConcepts (ADaM, SDTM, USDM, ARS) | All diagrams |
| `dc-change-from-baseline.tsk` | Derivation template (library level) | analysis_concept_cube.drawio |
| `ac-ancova-template.tsk` | Analysis template (library level) | analysis_concept_cube_ac_library.drawio |
| `ac-ancova-study-instance.tsk` | Analysis instance (study level) | analysis_concept_cube_ac_study.drawio |
| `sentences.tsk` | Sentence/Phrase definitions for natural language descriptions | analysis_concept_cube_ac_study.drawio |

## Universal Connector Architecture

The key architectural pattern demonstrated is the **Universal Connector** - DataConcepts serve as the abstraction layer connecting analytical structures to external domain models.

### How It Works

The DataConcept is a **central hub** - everything points TO it via `is_a` relationships:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA CONCEPTS                                     │
│                    (Pure Semantic Definitions)                              │
│                                                                             │
│   Subject, Visit, Treatment, AnalysisValue, ChangeValue, etc.              │
│   - Just name, definition, category                                         │
│   - NO knowledge of ADaM, SDTM, USDM                                       │
│   - Defined in: concepts-data.tsk                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ is_a (all arrows point UP to DataConcepts)
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
┌─────────┴─────────┐   ┌───────────┴───────────┐   ┌─────────┴─────────┐
│  AC/DC Cubes      │   │  ADaM Variables       │   │  SDTM Variables   │
│                   │   │                       │   │                   │
│  Dimension        │   │  USUBJID is_a Subject │   │  USUBJID is_a ... │
│   - subject       │   │  AVAL is_a AnalysisVal│   │  VISIT is_a Visit │
│   - is_a Subject  │   │  CHG is_a ChangeValue │   │                   │
│                   │   │                       │   │                   │
│  Measure          │   │  Defined in:          │   │  Defined in:      │
│   - change_value  │   │  model-mappings.tsk   │   │  model-mappings.  │
│   - is_a ChangeVal│   └───────────────────────┘   │  tsk              │
│                   │                               └───────────────────┘
│  Defined in:      │
│  dc-*.tsk,        │
│  ac-*.tsk         │
└───────────────────┘
```

**Resolution Example:**

```text
                    ┌─────────────────────┐
                    │    DataConcept      │
                    │    ChangeValue      │
                    │    (pure semantic)  │
                    └──────────▲──────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
      is_a │              is_a │              is_a │
           │                   │                   │
  ┌────────┴────────┐ ┌────────┴────────┐ ┌────────┴────────┐
  │ Cube Measure    │ │ ADaM Variable   │ │ USDM Element    │
  │ change_value    │ │ CHG             │ │ Observation.    │
  │ (dc-*.tsk)      │ │ (model-mappings)│ │ change          │
  └─────────────────┘ └─────────────────┘ └─────────────────┘
```

To resolve `change_value` to ADaM: follow `is_a` to `ChangeValue`, then find the ADaM variable in `model-mappings.tsk` that also has `is_a ChangeValue` → `CHG`.

### Key Principles

1. **DataConcepts are Pure Semantic**: DataConcepts contain ONLY definition and category - no knowledge of ADaM, SDTM, USDM. Mappings are declared by the external model elements pointing TO the concepts.

2. **External Models Point to DataConcepts**: ADaM variables, SDTM variables, and USDM elements declare `is_a` relationships TO DataConcepts (not the reverse). See `model-mappings.tsk`.

3. **Cube Elements are Instances**: Dimensions, measures, and attributes in AC/DC cubes are "instances" of DataConcepts via `is_a` - they represent the concept in the context of that analysis.

4. **CodeLists for Terminology Only**: Use `codeLists` block only for controlled terminology references (LOINC, SNOMED, MedDRA codes) - these ARE semantic identifiers.

5. **Template/Instance Separation**: Library templates use semantic names; study instances bind concrete values via slice `fix` clause.

## Template vs. Instance Pattern

### Template Level (Library)

```thunderstruck
// No fixed values - placeholders only
slice ANCOVAInputSlice from ANCOVAInput {
    vary: [subject, treatment, site],
    measures: [change_value, baseline_value]
    // Attributes are EMPTY
}

// Semantic names - portable
model FitANCOVAModel {
    formula: change_value ~ baseline_value + site + treatment
}
```

### Instance Level (Study)

```thunderstruck
// Concrete values bound
slice ANCOVASlice_ADAS_Week24 from ADQSADAS_ANCOVA {
    fix: {
        parameter: "ADAS-Cog(11)",
        timepoint: "Week 24",
        population_flag: "Y",
        imputation_method: "LOCF"
    },
    vary: [subject, treatment, site],
    measures: [change_value, baseline_value]
}

// ADaM names - resolved from concepts
model FitANCOVAModel_ADAS {
    formula: CHG ~ BASE + SITEID + TRTP
}
```

## Connector Resolution

When a template formula is executed, resolution follows the DataConcept hub:

```text
Cube element -> is_a -> DataConcept <- is_a <- External Model Variable
```

| Semantic Name | DataConcept | ADaM Variable | SDTM Variable | USDM Element |
|---------------|-------------|---------------|---------------|--------------|
| subject | Subject | USUBJID | USUBJID | StudySubject.identifier |
| analysis_value | AnalysisValue | AVAL | --STRESN | Observation.value |
| baseline_value | BaselineValue | BASE | (derived) | Observation.baselineValue |
| change_value | ChangeValue | CHG | (derived) | Observation.change |
| treatment | Treatment | TRT01A | ARM | StudyIntervention |
| site | Site | SITEID | SITEID | StudySite.identifier |

All mappings in this table are defined in `model-mappings.tsk` where ADaM/SDTM/USDM elements declare `is_a` relationships pointing TO the DataConcepts.

## Draw.io to Thunderstruck Mapping

| Draw.io Element | Thunderstruck Construct |
|-----------------|------------------------|
| Derivation/Analysis Template | File header comments |
| Method (implements) | `derive` or `model` block |
| Cube (input/output) | `cube` definition |
| Dimension (is_a DataConcept) | `dimensions: [name: Type is_a Concept]` |
| Measure (is_a DataConcept) | `measures: [name: Type is_a Concept]` |
| Attribute (qualifier) | `attributes: [...]` |
| Slice (constrains/fix) | `slice` with `fix:` clause |
| DataConcept | `concept` in concepts-data.tsk (pure semantic) |
| ADaM/SDTM/USDM Mappings | `adam_class_variable`, `sdtm_variable`, `usdm_element` in model-mappings.tsk |
| Sentence | `sentence` with `describes` and `composed_of` |
| Phrase | `phrase` with `role`, `is_a`, and `fix` relationships |

## Sentence/Phrase Pattern

The Sentence/Phrase pattern enables composing human-readable analysis descriptions from structured, semantically-linked components. This provides traceability from natural language descriptions to the underlying data structures.

### Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SENTENCE                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ text: "Analysis of the change from baseline in ADAS-Cog(11)..."      │  │
│  │                                                                       │  │
│  │ describes: S_AC_001 (AnalysisInstance)                               │  │
│  │ composed_of: [Phrase, Phrase, Phrase, ...]                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ▲
                      composed_of   │
       ┌────────────────────────────┼────────────────────────────┐
       │                            │                            │
┌──────┴──────┐              ┌──────┴──────┐              ┌──────┴──────┐
│   Phrase    │              │   Phrase    │              │   Phrase    │
│             │              │             │              │             │
│ role: scope │              │ role: time  │              │ role: pop   │
│ text: "in   │              │ text: "to   │              │ text: "on   │
│ ADAS-Cog"   │              │ Week 24"    │              │ efficacy"   │
│ value: ...  │              │ value: ...  │              │ value: "Y"  │
│             │              │             │              │             │
│ is_a:       │              │ is_a:       │              │ is_a:       │
│ Parameter   │              │ Visit       │              │ EfficacyFlag│
└──────┬──────┘              └──────┬──────┘              └──────┬──────┘
       │                            │                            │
       │ fix                        │ fix                        │ fix
       ▼                            ▼                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SLICE                                          │
│  fix: {                                                                     │
│      parameter: "ADAS-Cog(11)",   <── from ScopePhrase                     │
│      timepoint: "Week 24",        <── from TimepointPhrase                 │
│      population_flag: "Y",        <── from PopulationPhrase                │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phrase Roles

| Role | Purpose | Example Text |
|------|---------|--------------|
| `as_result` | What analysis produces | "Analysis of the change from baseline" |
| `as_method` | Statistical method used | "using ANCOVA model with..." |
| `as_scope` | Parameter being analyzed | "in ADAS-Cog(11)" |
| `as_timepoint` | When (analysis visit) | "to Week 24" |
| `as_population` | Analysis population | "on the efficacy population" |
| `as_imputation` | Missing data handling | "with LOCF imputation..." |
| `as_comparison` | Treatment comparisons | "Pairwise comparisons..." |
| `as_alpha` | Significance level | "at significance level 0.05" |

### Relationship Terminology

The draw.io diagrams use `is_a` and `fix` relationships. Alternative terms that may better express the semantics:

| Original Term | Alternative | Meaning |
|---------------|-------------|---------|
| `is_a` (Phrase → DataConcept) | `typed_by` | The DataConcept types/constrains the phrase's parameter value |
| `fix` (Phrase → Slice) | `binds_to` | The phrase value flows to the slice fix clause attribute |

### Data Flow

```text
User fills parameter --> Phrase.value --> fix --> Slice.fix.attribute
                                                         |
                                                         | constrains
                                                         v
                                                   Cube dimension/
                                                   attribute values
```

See `sentences.tsk` for the full implementation.

## Related Files

- `../data_example/input_data/study_instance_metadata.csv` - CSV representation of the same model
- `../data_example/input_data/adam_class_variable_mapping.csv` - ADaM variable mappings
- `../AC_MODEL_DESCRIPTION.md` - Detailed model documentation
- `../WIKI_PROPOSAL_UNIVERSAL_CONNECTOR.md` - Universal Connector principle proposal

## References

- [Thunderstruck DSL Examples](https://github.com/metadatadriven/acdc-wip/tree/dev/stuart/27-bottom-up/examples/thunderstruck)
- [AC/DC Guiding Principles Wiki](https://github.com/cdisc-org/analysis-concepts/wiki)

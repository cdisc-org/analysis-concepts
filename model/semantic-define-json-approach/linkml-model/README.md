# Define-JSON Analysis Concepts - LinkML Models

This directory contains [LinkML](https://linkml.io) (Linked Data Modeling Language) representations for the Define-JSON Analysis Concepts framework with a two-model architecture.

## Overview

The LinkML models provide formal, machine-readable specifications split into two complementary models:

- **[library/](library/)** - Abstract, reusable concept definitions (templates)
- **[study/](study/)** - Study-specific implementation structures (instances)

This separation follows the Define-XML v2.1 pattern of Global Library vs Study Define-XML, providing clear separation of concerns between reusable semantic templates and concrete study implementations.

## Two-Model Architecture

### Library Model ([library/](library/))

**Purpose**: Define abstract, reusable semantic concepts that can be shared across studies.

**Key Classes**:
- **ReifiedConcept Hierarchy**: Abstract base with specialized types
  - `AnalysisConcept`: Statistical analysis patterns
  - `DerivationConcept`: Data derivation semantics
  - `BuildingBlock`: Phrase templates for sentence composition
  - `BiomedicalConcept`: Clinical semantic concepts
- **AbstractMethod Hierarchy**: Method specifications with implementations
  - `StatisticalMethod`: Complex statistical methods (ANCOVA, regression, etc.)
  - `DerivationMethod`: Formula-based derivations (CHG = AVAL - BASE)

**Example Concepts**:
- `AC.ANCOVA.LS_MEANS_CHG` - ANCOVA comparing LS means of change from baseline
- `DC.CHANGE.FROM.BASELINE` - Change from baseline derivation concept
- `BB.OUTCOME.CHANGE_PARAM_TIME` - "change from baseline in {parameter} at {timepoint}"

See [library/README.md](library/README.md) for details.

### Study Model ([study/](study/))

**Purpose**: Define study-specific implementations that reference library concepts.

**Key Classes**:
- `StudyImplementation`: Root container for study analysis implementation
- `DataStructureDefinition`: ADaM dataset structures (ItemGroupDef)
- `StudyVariable`: Dataset variables that implement library concepts
- `StudyAnalysis`: Instantiated analyses referencing library AnalysisConcepts
- `AnalysisParameterBinding`: Binds building block parameters to study variables
- `AnalysisOutputDataset`: CUBE structures for analysis results

**Example Usage**:
```yaml
StudyAnalysis:
  analysisOID: "ANALYSIS.001"
  analysisName: "Primary Efficacy Analysis"
  implementsConcept: "AC.ANCOVA.LS_MEANS_CHG"  # References library
  parameterBindings:
    - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"  # References library
      parameterName: "parameter"
      boundToVariable: "IT.ADLBC.CHGBL"  # Study-specific variable
```

See [study/README.md](study/README.md) for details.

## Relationship Between Models

The study model **references** the library model via OIDs:

| Study Class | References Library Class | Via Property |
|---|---|---|
| StudyAnalysis | AnalysisConcept | `implementsConcept` |
| StudyVariable | DerivationConcept | `implementsDerivationConcept` |
| StudyVariable | BiomedicalConcept | `implementsBiomedicalConcept` |
| AnalysisParameterBinding | BuildingBlock | `buildingBlockRef` |
| MethodExecution | Method | `methodRef` |
| AnalysisOutput | ConceptOutput | `conceptOutputRef` |

This maintains clean separation while enabling:
- **Validation**: Check that study references point to valid library concepts
- **Reusability**: Same library concepts used across multiple studies
- **Versioning**: Library and study evolve independently
- **Governance**: Library concepts managed centrally, study implementations per protocol

## Directory Structure

```
linkml-model/
├── library/                    # Abstract concept library
│   ├── schema/
│   │   ├── define_json_analysis_concepts.yaml        # Main schema
│   │   ├── define_json_analysis_concepts.schema.json # Generated JSON Schema
│   │   └── define_json_analysis_concepts.ttl         # Generated RDF
│   ├── examples/
│   │   ├── analysis_concepts.yaml          # AC examples
│   │   ├── derivation_concepts.yaml        # DC examples
│   │   └── building_blocks.yaml            # BB examples
│   ├── docs/
│   │   ├── class_diagram.puml              # UML diagram (PlantUML)
│   │   ├── class_diagram.yuml              # UML diagram (yUML)
│   │   └── UML_README.md                   # How to view diagrams
│   ├── generated/
│   │   └── define_json_analysis_concepts.py # Generated Python classes
│   ├── Makefile                            # Build automation
│   └── README.md                           # Library documentation
│
├── study/                      # Study implementation model
│   ├── schema/
│   │   ├── define_json_study_implementation.yaml        # Main schema
│   │   ├── define_json_study_implementation.schema.json # Generated JSON Schema
│   │   └── define_json_study_implementation.ttl         # Generated RDF
│   ├── examples/
│   │   └── (study implementation examples)
│   ├── docs/
│   │   └── (generated documentation)
│   ├── generated/
│   │   └── define_json_study_implementation.py # Generated Python classes
│   ├── Makefile                            # Build automation
│   └── README.md                           # Study model documentation
│
├── fix_plantuml_duplicates.py # Shared utility for UML generation
└── README.md                   # This file
```

## Prerequisites

Install LinkML:

```bash
pip install linkml linkml-runtime
```

## Quick Start

### Working with Library Model

```bash
cd library/

# Validate library examples
make validate

# Generate all artifacts (JSON Schema, Python, RDF, UML)
make all

# View UML diagram (requires PlantUML extension in VS Code)
# Open docs/class_diagram.puml and press Alt+D
```

### Working with Study Model

```bash
cd study/

# Validate study examples
make validate

# Generate all artifacts
make all
```

### Generate Both Models

From the `linkml-model/` directory:

```bash
# Generate library artifacts
cd library && make all && cd ..

# Generate study artifacts
cd study && make all && cd ..
```

## Example Workflow

### 1. Define Library Concepts (Once, Reusable)

Create abstract concepts in `library/`:

```yaml
# library/examples/my_concepts.yaml
libraryOID: "LIB.MY.CONCEPTS"
libraryName: "My Analysis Concepts"

concepts:
  - OID: "AC.MY.ANALYSIS"
    name: "My Custom Analysis"
    conceptType: "analysis_concept"
    semanticRole: "statistical_analysis_pattern"
    purpose: "Analyze treatment effect"

    requiredBuildingBlocks:
      - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
        semanticRole: "outcome_specification"

    inputs:
      - OID: "AC.MY.ANALYSIS.INPUT.OUTCOME"
        name: "outcome"
        semanticRole: "dependent_variable"
        dataType: "float"
```

Validate:
```bash
cd library && linkml-validate -s schema/define_json_analysis_concepts.yaml examples/my_concepts.yaml
```

### 2. Implement in Study (Study-Specific)

Create study implementation in `study/`:

```yaml
# study/examples/my_study.yaml
studyOID: "STUDY.12345"
studyName: "Phase 3 Efficacy Study"

libraryReferences:
  - libraryOID: "LIB.MY.CONCEPTS"
    libraryName: "My Analysis Concepts"
    libraryVersion: "1.0"

dataStructures:
  - OID: "IG.ADLBC"
    name: "ADLBC"
    dataClass: "BDS"
    structure: "one_record_per_subject_per_parameter"
    variables:
      - OID: "IT.ADLBC.CHGBL"
        name: "CHGBL"
        dataType: "float"
        implementsDerivationConcept: ["DC.CHANGE.FROM.BASELINE"]

studyAnalyses:
  - analysisOID: "ANALYSIS.001"
    analysisName: "Primary Efficacy"
    implementsConcept: "AC.MY.ANALYSIS"  # References library
    parameterBindings:
      - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
        parameterName: "parameter"
        boundToVariable: "IT.ADLBC.CHGBL"
```

Validate:
```bash
cd study && linkml-validate -s schema/define_json_study_implementation.yaml examples/my_study.yaml
```

## Benefits of Two-Model Architecture

1. **Separation of Concerns**
   - Library: "What analyses can be done?" (templates)
   - Study: "What was actually done?" (instances)

2. **Reusability**
   - Same library concepts used across multiple studies
   - Build once, reuse many times

3. **Independent Versioning**
   - Library evolves independently of studies
   - Studies can reference specific library versions

4. **Governance**
   - Library concepts: Centrally managed, reviewed, standardized
   - Study implementations: Protocol-specific, per-study

5. **Validation**
   - Type safety: Study references validated against library
   - Semantic consistency: Ensure implementations match concepts

6. **Interoperability**
   - Standard library enables cross-study queries
   - Common semantics facilitate meta-analysis

## LinkML Features Used

Both models leverage LinkML's powerful features:

- **Inheritance**: `is_a` for class hierarchies (ReifiedConcept → AC/DC/BB/BC)
- **Type Discrimination**: `designates_type: true` for polymorphic deserialization
- **Multivalued Slots**: Lists with `inlined_as_list: true`
- **Controlled Vocabularies**: Enumerations for type safety
- **OID Patterns**: Type-specific prefixes enforced via regex
- **Multi-Format Generation**: JSON Schema, Python, RDF, UML from single source

## Code Generation

Both models generate multiple artifacts:

### JSON Schema
```bash
cd library && make json-schema
cd study && make json-schema
```

Use with standard validators:
```python
import jsonschema
import yaml

# Load and validate
with open("schema/define_json_analysis_concepts.schema.json") as f:
    schema = json.load(f)
with open("examples/analysis_concepts.yaml") as f:
    data = yaml.safe_load(f)

jsonschema.validate(data, schema)
```

### Python Classes
```bash
cd library && make python
cd study && make python
```

Use in code:
```python
from library.generated.define_json_analysis_concepts import AnalysisConcept
from study.generated.define_json_study_implementation import StudyAnalysis

# Type-safe objects with IDE autocomplete
ac = AnalysisConcept(OID="AC.TEST", name="Test", ...)
analysis = StudyAnalysis(analysisOID="ANALYSIS.001", implementsConcept=ac.OID, ...)
```

### UML Diagrams
```bash
cd library && make uml
cd study && make uml
```

View in VS Code with PlantUML extension or at [plantuml.com](https://www.plantuml.com/plantuml/uml/).

## Relationship to Other Representations

This LinkML implementation is part of a multi-representation approach:

| Representation | Purpose | Location |
|---|---|---|
| **LinkML Models** | Formal specification, validation, code generation | `linkml-model/` |
| **Pydantic Models** | Python validation with runtime type checking | `../validation/` |
| **Neo4j Schema** | Graph database schema with constraints | `../schema.cypher` |
| **JSON Examples** | Library content (actual concepts) | `../library/` |
| **Documentation** | Human-readable specification | `../DEFINE_JSON_EXTENSIONS.md` |

All representations maintain consistency through:
- Same class hierarchies and property names
- Same OID prefix conventions (AC., DC., BB., BC., METHOD., IG., IT., etc.)
- Same controlled vocabularies
- Same semantic relationships

## Contributing

When extending the models:

1. **Library Changes**:
   - Update `library/schema/define_json_analysis_concepts.yaml`
   - Add examples in `library/examples/`
   - Validate: `cd library && make validate`
   - Regenerate: `cd library && make all`

2. **Study Changes**:
   - Update `study/schema/define_json_study_implementation.yaml`
   - Add examples in `study/examples/`
   - Validate: `cd study && make validate`
   - Regenerate: `cd study && make all`

3. **Update Documentation**:
   - Update this README for architectural changes
   - Update individual README files for model-specific changes

## Next Steps

1. **Library Model**:
   - Add more AnalysisConcept examples (t-tests, survival analysis, etc.)
   - Expand BiomedicalConcept examples for clinical domains
   - Add SDTM data concept templates

2. **Study Model**:
   - Create complete study implementation examples
   - Add CUBE structure examples for different output types
   - Develop validation rules for OID references

3. **Integration**:
   - Build cross-model validation tool (verify study OIDs exist in library)
   - Develop conversion utilities between LinkML and other formats
   - Create Neo4j import scripts for both models

4. **Tooling**:
   - API endpoints for library concept lookup
   - Study implementation templates generator
   - Interactive documentation browser

## References

- [LinkML Documentation](https://linkml.io)
- [LinkML Schema Language](https://linkml.io/linkml-model/latest/)
- [Library Model README](library/README.md)
- [Study Model README](study/README.md)
- [Define-JSON Extensions](../DEFINE_JSON_EXTENSIONS.md)
- [Neo4j Schema](../schema.cypher)

## License

This work is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

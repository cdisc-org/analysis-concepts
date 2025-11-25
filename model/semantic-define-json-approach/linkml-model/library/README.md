# Define-JSON Analysis Concepts - Library Model (LinkML)

This directory contains the **Library Model** - a [LinkML](https://linkml.io) representation of abstract, reusable analysis concept definitions. This model defines templates and patterns that can be referenced by study-specific implementations in the [study/](../study/) model.

**Part of the two-model architecture**: See [parent README](../README.md) for the complete architecture overview.

## Overview

The LinkML schema provides a formal, machine-readable specification of:

- **ReifiedConcept Inheritance Hierarchy**: Abstract base class with specialized concept types
  - `AnalysisConcept`: Statistical analysis patterns
  - `DerivationConcept`: Data derivation semantics
  - `BuildingBlock`: Phrase templates for sentence composition
  - `BiomedicalConcept`: Clinical semantic concepts
- **Semantic Relationships**: implementsConcept, conformsTo, requiredBuildingBlocks, etc.
- **Controlled Vocabularies**: Enumerations for semantic roles, data types, ADaM classes
- **Bidirectional Parameter Mappings**: Building block parameters ↔ concept inputs/outputs
- **Method Specifications**: Statistical methods with multi-language implementations

## Directory Structure

```
linkml-model/
├── schema/
│   └── define_json_analysis_concepts.yaml  # Main LinkML schema
├── examples/
│   ├── analysis_concepts.yaml              # AC examples (ANCOVA, dose-response)
│   ├── derivation_concepts.yaml            # DC examples (CHG, BASE, PCHG)
│   ├── building_blocks.yaml                # BB examples (phrase templates)
│   └── complete_study_example.yaml         # Full study analysis example
├── docs/
│   └── (generated documentation)
├── README.md                               # This file
└── Makefile                                # Build automation
```

## Schema Highlights

### Inheritance with `is_a`

The schema uses LinkML's native inheritance via `is_a`:

```yaml
ReifiedConcept:
  abstract: true
  slots: [OID, name, description, conceptType, semanticRole, label, statoIRI]

AnalysisConcept:
  is_a: ReifiedConcept
  slots: [purpose, requiredBuildingBlocks, inputs, outputs, methodReferences]

DerivationConcept:
  is_a: ReifiedConcept
  slots: [adClass, dataType, derivationMethod, mapsToVariable]

BuildingBlock:
  is_a: ReifiedConcept
  slots: [template, parameters, mapsToDataConcept, examples]
```

### Type Discrimination

Uses `conceptType` enum with `designates_type: true`:

```yaml
conceptType:
  range: ConceptTypeEnum
  designates_type: true
  values: [analysis_concept, derivation_concept, building_block, biomedical_concept]
```

### Bidirectional Parameter Mappings

Critical feature enabling building blocks to both provide inputs AND describe outputs:

```yaml
ParameterMapping:
  slots:
    - buildingBlockParameter  # Parameter name in template
    - mapsToInput            # Optional: input it provides
    - mapsToOutput           # Optional: output it describes
    - mappingType            # "provides_input" OR "describes_output"
```

### Semantic Role Enumerations

Context-specific semantic roles for precise semantics:

- `SemanticRoleInputEnum`: dependent_variable, primary_predictor, baseline_covariate, etc.
- `SemanticRoleOutputEnum`: effect_estimate, statistical_evidence, confidence_interval, etc.
- `SemanticRoleBuildingBlockEnum`: outcome_specification, method_specification, etc.
- `SemanticRoleDerivationConceptEnum`: derived_endpoint, measurement, treatment_quantification, etc.

## Prerequisites

Install LinkML:

```bash
pip install linkml
```

## Usage

### Validate Examples

Validate example files against the schema:

```bash
linkml-validate -s schema/define_json_analysis_concepts.yaml examples/analysis_concepts.yaml
linkml-validate -s schema/define_json_analysis_concepts.yaml examples/derivation_concepts.yaml
linkml-validate -s schema/define_json_analysis_concepts.yaml examples/building_blocks.yaml
```

### Generate JSON Schema

Generate JSON Schema for validation tools:

```bash
gen-json-schema schema/define_json_analysis_concepts.yaml > schema/define_json_analysis_concepts.schema.json
```

Use the JSON Schema with standard validators:

```bash
pip install jsonschema
jsonschema -i examples/analysis_concepts.yaml schema/define_json_analysis_concepts.schema.json
```

### Generate Python Dataclasses

Generate Python classes with type hints:

```bash
gen-python schema/define_json_analysis_concepts.yaml > generated/define_json_analysis_concepts.py
```

Use in Python code:

```python
from generated.define_json_analysis_concepts import AnalysisConcept, BuildingBlock

# Load and validate
ac = AnalysisConcept(
    OID="AC.TEST",
    name="Test Analysis",
    conceptType="analysis_concept",
    semanticRole="statistical_analysis_pattern",
    purpose="Test analysis purpose"
)
```

### Generate RDF/OWL

Generate RDF representation for semantic web applications:

```bash
gen-rdf schema/define_json_analysis_concepts.yaml > schema/define_json_analysis_concepts.ttl
```

### Generate Documentation

Generate markdown documentation:

```bash
gen-markdown schema/define_json_analysis_concepts.yaml -d docs/
```

Or use the Makefile for all generations:

```bash
make all
```

## Example Workflows

### 1. Library Development

Create new analysis concepts using the schema:

```yaml
- OID: "AC.MY.ANALYSIS"
  name: "My Custom Analysis"
  conceptType: "analysis_concept"
  semanticRole: "confirmatory_analysis_pattern"
  purpose: "Custom analysis purpose"

  requiredBuildingBlocks:
    - buildingBlockRef: "BB.OUTCOME.CHANGE_PARAM_TIME"
      semanticRole: "outcome_specification"
      required: true
      parameterMappings:
        - buildingBlockParameter: "parameter"
          mapsToInput: "AC.MY.ANALYSIS.INPUT.OUTCOME"
          mappingType: "provides_input"

  inputs:
    - OID: "AC.MY.ANALYSIS.INPUT.OUTCOME"
      name: "outcome"
      semanticRole: "dependent_variable"
      dataType: "float"
      required: true
      implementsConcept: ["DC.CHANGE.FROM.BASELINE"]
```

Validate:

```bash
linkml-validate -s schema/define_json_analysis_concepts.yaml my_concepts.yaml
```

### 2. Study Implementation

See [complete_study_example.yaml](examples/complete_study_example.yaml) for a full example showing:

1. **Analysis concept instantiation**
2. **Building block sentence composition** with parameter bindings
3. **Data concept implementation** via study variables
4. **Method specification** with executable code
5. **Output mapping** to result locations

### 3. Tool Integration

#### JSON Schema Validation

```python
import json
import jsonschema
import yaml

# Load schema
with open("schema/define_json_analysis_concepts.schema.json") as f:
    schema = json.load(f)

# Load and validate data
with open("examples/analysis_concepts.yaml") as f:
    data = yaml.safe_load(f)

jsonschema.validate(data, schema)
```

#### Python Type-Safe Access

```python
from generated.define_json_analysis_concepts import ConceptLibrary
import yaml

# Load library
with open("library/analysis_concepts.yaml") as f:
    data = yaml.safe_load(f)

library = ConceptLibrary(**data)

# Type-safe access with IDE autocomplete
for concept in library.concepts:
    if isinstance(concept, AnalysisConcept):
        print(f"Analysis: {concept.name}")
        print(f"Purpose: {concept.purpose}")
        for input in concept.inputs or []:
            print(f"  Input: {input.name} ({input.semanticRole})")
```

#### Neo4j Graph Import

Convert LinkML to Neo4j using generated Python classes:

```python
from neo4j import GraphDatabase
from generated.define_json_analysis_concepts import ConceptLibrary
import yaml

# Load library
with open("library/analysis_concepts.yaml") as f:
    library = ConceptLibrary(**yaml.safe_load(f))

# Import to Neo4j
driver = GraphDatabase.driver("bolt://localhost:7687")
with driver.session() as session:
    for concept in library.concepts:
        if isinstance(concept, AnalysisConcept):
            session.run("""
                CREATE (ac:AnalysisConcept:ReifiedConcept {
                    OID: $oid,
                    name: $name,
                    conceptType: $conceptType,
                    semanticRole: $semanticRole,
                    purpose: $purpose
                })
            """, oid=concept.OID, name=concept.name,
                conceptType=concept.conceptType,
                semanticRole=concept.semanticRole,
                purpose=concept.purpose)
```

## Relationship to Study Model

This library model is referenced by the [study implementation model](../study/):

- Study analyses reference library AnalysisConcepts via OID
- Study variables implement library DerivationConcepts
- Study parameter bindings reference library BuildingBlocks
- Study methods execute library Method specifications

See [parent README](../README.md) for details on the two-model architecture.

## Relationship to Other Representations

This LinkML library model is part of a multi-representation approach:

| Representation | Purpose | Location |
|---|---|---|
| **LinkML Library Model** | Abstract concept specification | `linkml-model/library/` (this directory) |
| **LinkML Study Model** | Study implementation specification | `linkml-model/study/` |
| **Pydantic Models** | Python validation with runtime checking | `../../validation/` |
| **Neo4j Schema** | Graph database schema with constraints | `../../schema.cypher` |
| **JSON Examples** | Actual library content (concepts, methods) | `../../library/` |
| **Documentation** | Human-readable specification | `../../DEFINE_JSON_EXTENSIONS.md` |

All representations maintain consistency through:
- Same inheritance hierarchy (ReifiedConcept → AC/DC/BB/BC)
- Same property names and semantics
- Same OID prefix conventions (AC., DC., BB., BC., METHOD.)
- Same controlled vocabularies

## Key Design Decisions

### 1. Abstract Base Class Pattern

`ReifiedConcept` is marked `abstract: true` and defines shared properties. Concrete types use `is_a: ReifiedConcept`.

### 2. Multivalued Slots with Inlining

Lists use `multivalued: true` with `inlined_as_list: true` for inline JSON representation:

```yaml
parameters:
  multivalued: true
  range: TemplateParameter
  inlined_as_list: true
```

### 3. Type Discrimination

`conceptType` uses `designates_type: true` to enable polymorphic deserialization.

### 4. Controlled Vocabularies

Semantic roles use enumerations for type safety and validation:

```yaml
SemanticRoleInputEnum:
  permissible_values:
    dependent_variable:
      description: Dependent variable in analysis
    primary_predictor:
      description: Primary predictor variable
```

### 5. Ontology Integration

STATO references use `range: uriorcurie` for proper URI handling:

```yaml
statoIRI:
  range: uriorcurie
  slot_uri: obo:IAO_0000136
```

### 6. OID Validation

OID patterns enforce type-specific prefixes:

```yaml
AnalysisConcept:
  slot_usage:
    OID:
      pattern: "^AC\\."
```

## Benefits of LinkML Representation

1. **Formal Specification**: Machine-readable schema definition
2. **Multi-Format Generation**: JSON Schema, Python, RDF, docs from single source
3. **Validation**: Built-in validation with clear error messages
4. **Type Safety**: Generated code with type hints and IDE support
5. **Semantic Web**: Direct RDF/OWL generation for ontology integration
6. **Interoperability**: Standard formats (JSON Schema, Python dataclasses)
7. **Inheritance**: Native support for class hierarchies via `is_a`
8. **Documentation**: Auto-generated docs with descriptions and examples

## Makefile Targets

Use the Makefile for common operations:

```bash
make validate      # Validate all examples
make json-schema   # Generate JSON Schema
make python        # Generate Python classes
make rdf           # Generate RDF/Turtle
make docs          # Generate markdown documentation
make uml           # Generate UML diagrams (PlantUML and yUML)
make plantuml      # Generate only PlantUML diagram
make yuml          # Generate only yUML diagram
make all           # Generate all artifacts
make clean         # Remove generated files
```

**Note**: The UML generation includes an automated post-processing step to fix duplicate relationship lines created by the LinkML PlantUML generator. See [docs/UML_README.md](docs/UML_README.md) for details on viewing UML diagrams.

## Next Steps

1. **Extend with BiomedicalConcepts**: Add BC examples for clinical semantics
2. **SDTM Integration**: Add DataStructureDefinition for SDTM class/domain templates
3. **Version Management**: Add schema versioning and migration support
4. **Validation Rules**: Add custom validation beyond type checking
5. **API Development**: Use generated Python classes in FastAPI or similar
6. **Graph Queries**: Develop Cypher query templates for common patterns
7. **Tooling**: Build conversion utilities between LinkML, JSON, and Neo4j

## References

- [LinkML Documentation](https://linkml.io)
- [LinkML Schema Language](https://linkml.io/linkml-model/latest/)
- [Define-JSON Extensions](../DEFINE_JSON_EXTENSIONS.md)
- [Neo4j Schema](../schema.cypher)
- [Pydantic Validation Models](../validation/)

## Contributing

When extending the schema:

1. Update `schema/define_json_analysis_concepts.yaml`
2. Add examples in `examples/`
3. Validate: `make validate`
4. Regenerate artifacts: `make all`
5. Update documentation in this README

## License

This work is licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

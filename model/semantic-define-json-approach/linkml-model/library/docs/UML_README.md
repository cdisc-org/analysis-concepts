# UML Diagrams for Define-JSON Analysis Concepts

This directory contains UML class diagrams generated from the LinkML schema.

## Generated Files

### 1. [class_diagram.puml](class_diagram.puml)
**PlantUML format** - Most recommended for viewing

**How to view:**

**Option A: VS Code (Recommended)**
1. Install the "PlantUML" extension in VS Code
2. Open `class_diagram.puml`
3. Press `Alt+D` (or `Cmd+D` on Mac) to preview the diagram
4. Or right-click and select "Preview Current Diagram"

**Option B: Online PlantUML Server**
1. Go to https://www.plantuml.com/plantuml/uml/
2. Copy the contents of `class_diagram.puml`
3. Paste into the text area
4. The diagram will render automatically

**Option C: Local PlantUML Installation**
```bash
# Install PlantUML (requires Java)
brew install plantuml  # macOS
apt-get install plantuml  # Linux

# Generate PNG
plantuml class_diagram.puml

# Generate SVG (scalable)
plantuml -tsvg class_diagram.puml
```

### 2. [class_diagram.yuml](class_diagram.yuml)
**yUML format** - Simple online viewing

**How to view:**
1. Copy the entire URL from `class_diagram.yuml`
2. Paste it directly into your browser address bar
3. The diagram will render as an image

The URL looks like:
```
https://yuml.me/diagram/nofunky;dir:TB/class/[...]
```

## What the Diagrams Show

The UML diagrams visualize:

### Class Hierarchy
- **ReifiedConcept** (abstract base class)
  - AnalysisConcept
  - DerivationConcept
  - BuildingBlock
  - BiomedicalConcept

### Key Relationships
- **Inheritance** (^-): Specialized concepts inherit from ReifiedConcept
- **Composition** (++->): Strong ownership relationships
  - AnalysisConcept contains inputs, outputs, method references
  - BuildingBlock contains template parameters
  - Method contains implementations and specifications
- **Associations** (<->): References between concepts
  - BuildingBlockReference maps to AnalysisConcept inputs/outputs
  - DerivationConceptReference connects to DerivationConcepts
  - MethodReference links to Method definitions

### Properties
Each class shows:
- **Attributes**: With their types and cardinality
- **Inherited properties**: Marked with (i)
- **Required fields**: Indicated by lack of `?`
- **Multivalued properties**: Shown with `[0..*]` or `[1..*]`

## Diagram Legend

**PlantUML Notation:**
- `*-->` : Composition (strong ownership)
- `-->` : Association (reference)
- `<|--` : Inheritance
- `[0..*]` : Zero or many
- `[1..*]` : One or many
- `?` : Optional field

**yUML Notation:**
- `^-` : Inheritance
- `++-` : Composition
- `<-` : Association
- `*` : Multiple cardinality

## Updating the Diagrams

To regenerate the diagrams after schema changes:

```bash
# From the linkml-model directory
cd /path/to/linkml-model

# Generate both PlantUML and yUML (recommended - includes duplicate fix)
make uml

# Or generate individually
make plantuml  # PlantUML only (includes automatic duplicate fix)
make yuml      # yUML only
```

**Manual generation** (not recommended - won't fix duplicates):
```bash
# Generate PlantUML
../../../.venv/bin/gen-plantuml schema/define_json_analysis_concepts.yaml > docs/class_diagram.puml

# Generate yUML
../../../.venv/bin/gen-yuml schema/define_json_analysis_concepts.yaml > docs/class_diagram.yuml
```

**Note**: The LinkML `gen-plantuml` tool has a known issue where it sometimes creates duplicate relationship lines with incorrect `(i)` inherited markers. The Makefile automatically runs a post-processing script ([fix_plantuml_duplicates.py](../fix_plantuml_duplicates.py)) to clean up these duplicates.

## Tips for Understanding the Model

1. **Start with ReifiedConcept**: This abstract base defines common properties (OID, name, description, conceptType, etc.)

2. **Focus on inheritance**: Each specialized concept (AC, DC, BB, BC) adds specific properties while inheriting the base properties

3. **Follow the composition relationships**:
   - AnalysisConcept → inputs/outputs → ConceptInput/ConceptOutput
   - BuildingBlock → parameters → TemplateParameter
   - Method → implementations → MethodImplementation

4. **Type discrimination**: The `conceptType` field uses values like "analysis_concept", "derivation_concept", etc. to distinguish between types

5. **Bidirectional mappings**: BuildingBlockReference contains ParameterMapping that connects building block parameters to analysis concept inputs/outputs

## Additional Resources

- **Schema file**: [../schema/define_json_analysis_concepts.yaml](../schema/define_json_analysis_concepts.yaml)
- **JSON Schema**: [../schema/define_json_analysis_concepts.schema.json](../schema/define_json_analysis_concepts.schema.json)
- **Examples**: [../examples/](../examples/)
- **Main README**: [../README.md](../README.md)

## LinkML Documentation

For more information about LinkML UML generation:
- LinkML UML generation: https://linkml.io/linkml/generators/uml.html
- PlantUML documentation: https://plantuml.com/class-diagram
- yUML documentation: https://yuml.me/

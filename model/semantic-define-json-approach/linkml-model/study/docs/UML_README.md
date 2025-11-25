# UML Diagrams for Define-JSON Study Implementation

This directory contains UML class diagrams generated from the LinkML study implementation schema.

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

The UML diagrams visualize the study implementation model structure:

### Core Classes

- **StudyImplementation** (root container)
  - Contains library references, data structures, analyses, and output datasets

- **DataStructureDefinition** (ADaM datasets)
  - Represents ItemGroupDef with ItemDefs (e.g., ADSL, ADLBC, ADAE)
  - Contains StudyVariable definitions

- **StudyVariable** (dataset variables)
  - Maps to library DerivationConcepts
  - Implements library BiomedicalConcepts

- **StudyAnalysis** (instantiated analyses)
  - References library AnalysisConcepts
  - Contains AnalysisParameterBindings
  - References analysis populations

- **AnalysisParameterBinding** (parameter mappings)
  - Binds BuildingBlock parameters to StudyVariables
  - Provides literal values or expressions

- **AnalysisOutputDataset** (CUBE structures)
  - Represents multi-dimensional result tables
  - Contains OutputDimensions and OutputMeasures

### Key Relationships

- **Composition** (*-->): Strong ownership relationships
  - StudyImplementation contains DataStructureDefinitions
  - DataStructureDefinition contains StudyVariables
  - StudyAnalysis contains AnalysisParameterBindings
  - AnalysisOutputDataset contains OutputDimensions and OutputMeasures

- **References** (-->): Links to library concepts
  - StudyAnalysis → library AnalysisConcept (via implementsConcept)
  - StudyVariable → library DerivationConcept (via implementsDerivationConcept)
  - AnalysisParameterBinding → library BuildingBlock (via buildingBlockRef)

### Properties

Each class shows:
- **Attributes**: With their types and cardinality
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
# From the study directory
cd /path/to/linkml-model/study

# Generate both PlantUML and yUML (recommended - includes duplicate fix)
make uml

# Or generate individually
make plantuml  # PlantUML only (includes automatic duplicate fix)
make yuml      # yUML only
```

**Manual generation** (not recommended - won't fix duplicates):
```bash
# Generate PlantUML
../../../.venv/bin/gen-plantuml schema/define_json_study_implementation.yaml > docs/class_diagram.puml

# Generate yUML
../../../.venv/bin/gen-yuml schema/define_json_study_implementation.yaml > docs/class_diagram.yuml
```

**Note**: The LinkML `gen-plantuml` tool has a known issue where it sometimes creates duplicate relationship lines with incorrect `(i)` inherited markers. The Makefile automatically runs a post-processing script ([fix_plantuml_duplicates.py](../../fix_plantuml_duplicates.py)) to clean up these duplicates.

## Tips for Understanding the Model

1. **Start with StudyImplementation**: This is the root container that holds all study-specific information

2. **Follow the data flow**:
   - DataStructureDefinition (datasets) → StudyVariable (variables)
   - StudyAnalysis references library AnalysisConcept
   - AnalysisParameterBinding connects library parameters to study variables
   - AnalysisOutputDataset structures the results

3. **Understand the library linkage**:
   - `implementsConcept`: StudyAnalysis → library AnalysisConcept
   - `implementsDerivationConcept`: StudyVariable → library DerivationConcept
   - `buildingBlockRef`: AnalysisParameterBinding → library BuildingBlock

4. **CUBE structure**: AnalysisOutputDataset represents multi-dimensional result tables with:
   - OutputDimension: Row/column groupings (treatment, visit, parameter)
   - OutputMeasure: Values displayed in cells (statistics, p-values)

5. **OID patterns**:
   - `IG.*` - Data structure (ItemGroupDef)
   - `IT.*` - Study variable (ItemDef)
   - `ANALYSIS.*` - Study analysis
   - `CUBE.*` - Output dataset
   - `POP.*` - Analysis population

## Relationship to Library Model

This study model complements the [library model](../../library/README.md):

- **Library model**: Defines abstract, reusable analysis concepts, building blocks, and derivation concepts
- **Study model**: Provides concrete implementations that reference and instantiate library concepts

The study model creates **traceability** from:
- Source data (SDTM) → Derived data (ADaM variables implementing DerivationConcepts)
- ADaM data → Analyses (implementing AnalysisConcepts)
- Analyses → Results (CUBE structures)

## Additional Resources

- **Schema file**: [../schema/define_json_study_implementation.yaml](../schema/define_json_study_implementation.yaml)
- **Examples**: [../examples/](../examples/)
- **Study README**: [../README.md](../README.md)
- **Library model**: [../../library/README.md](../../library/README.md)
- **Main architecture docs**: [../../../README.md](../../../README.md)

## LinkML Documentation

For more information about LinkML UML generation:
- LinkML UML generation: https://linkml.io/linkml/generators/uml.html
- PlantUML documentation: https://plantuml.com/class-diagram
- yUML documentation: https://yuml.me/

# AC/DC model

## Definitions

| Term | Meaning |
| --- | ----------- |
| Analysis | Analysis and creation of non-subject-level aggregated data |
| Analysis Concept (AC) | <span style="color:red">Question: what is the definition? Is it the entire sentence describing a single analysis?</span> |
| Concept | Description of something in the real world, independent of study and data standards |
| Derivation | Handling of subject-level data prior to analysis to generate new subject-level data from collected or other derived data |
| Derivation Concept (DC) | New piece(s) of subject-level data (records and/or variables) to be created by a single derivation method |
| Implementation | Representation of a concept instantiated in a data standard or in code |
| Method | Description of how an analysis or derivation should be performed in the real world, a method has inputs, outputs and arguments |
| Slice | Subset of data on which to perform a derivation of analysis, this can be a collection of records, variables or a combination of records and variables |

<span style="color:red">Question: do we need terms like reified concept or will that confuse people?</span>

<span style="color:red">Question: do we use the term slice for a subset (in terms of records and variables) of a dataset? Or is the term context better?</span>

## Goals

<span style="color:red">Needs work!</span>

## Rationale

- **Interchange**
  - Standardized structure allows <span style="color:blue">**interchange**</span> of analysis and derivation specifications between systems and organizations
- **Analysis and derivation automation and reuse**
  - <span style="color:blue">**Machine-readable**</span> analysis and derivation specifications can directly link to statistical programming code reducing transcription errors, allowing automated validation and reuse
- **Reduced ambiguity**
  - Standardized structure <span style="color:blue">**enforces precision**</span> in specifying analysis and derivation setting and assumptions
- **Increased traceability**
  - Provides <span style="color:blue">**clear linkage**</span> from results all the way back to objectives and endpoints in USDM and vice versa
- **Streamlined collaboration**
  - Provides <span style="color:blue">**common language**</span> between statisticians, clinicians, data managers, programmers and other stakeholders

## KISS - Keep it simple, stupid

Some complexity is unavoidable in a model like this, but whenever possible simplicity is a design goal. Complexity can also be hidden from end-users by tools.

## Modeling language

USDM is modeled in UML, which is complex, not easily visualized in a consistent way and requires commercial software like Enterprise Architect, which is Windows-only. For the AC/DC model **LinkML** will be used. LinkML is less complex and tooling is free, open and available for all operating systems.

## Layers

| Conceptual | Implementation * |
| --- | ---|
| Description of a concept in the real world, independent of study and data standards | Representation of the concept instantiated in a data standard or code |
| Not context dependent | Context dependent |
| Example: Biomedical Concept | Example: SDTM Dataset Specialization |
| Human-readable | Machine-readable and executable |

\* Representational layer in ISO 11179

## Derivation Concepts

<span style="color:red">Question: What comes first: the Method or the Derivation Concept? E.g. a dataset is a sequence of Methods that create Derivation Concepts (the GSK approach) or a dataset is a collection of Derivation Concepts that are defined by Methods?</span>

**Do one thing and do it well**: a derivation that requires a sequence of derivation methods should be broken down into multiple Derivation Concepts.

For the input dataset or slice a Derivation Concept and its Method can:

- update values for existing columns
- produce one or more new columns with values
- produce one or more new records
- a combination of the above

To allow analyses to be performed on a slice of data that was not created by a Derivation Concept or a small group of Derivation Concept the model should allow for defining a slice that has no method and is only used by an Analysis Concepts.

## Analysis Concepts


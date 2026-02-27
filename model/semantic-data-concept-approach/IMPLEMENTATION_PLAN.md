# Analysis Concepts Implementation Plan

## Standards Organisation Deliverables

This document outlines the deliverables, approach, and resources for implementing the Analysis Concept (AC) and Derivation Concept (DC) standards.

---

## 1. Deliverables Overview

### 1.1 Normative Deliverables (Required for Compliance)

| Deliverable | Format | Description |
|-------------|--------|-------------|
| **DataConcept Definitions** | JSON-LD + LinkML schema | Pure semantic layer - name, definition, category (NO variable mappings embedded) |
| **Class Variable Mappings** | JSON-LD | `is_a` relationships linking class-level variables to DataConcepts |
| **AC/DC Templates** | JSON-LD | Library-level analysis/derivation patterns (cubes, slices, methods) |
| **Sentence/Phrase Templates** | JSON-LD | Natural language description components |

### 1.2 Informative Deliverables (Guidance/Reference)

| Deliverable | Format | Description |
|-------------|--------|-------------|
| **Reference Code** | R, SAS, Python | Metadata-driven implementations using class variable names |
| **Resolution Engine** | Python/R | Universal Connector resolver: semantic → class variable |
| **Example Study Instances** | JSON-LD | Worked examples showing template instantiation |
| **Human-Readable Documentation** | Thunderstruck DSL, Markdown | Developer-friendly representations |

### 1.3 Exchange Formats

| Format | Use Case | Primary Audience |
|--------|----------|------------------|
| **JSON-LD** | Machine exchange, API integration | Developers, Systems |
| **CSV exports** | Tabular views, spreadsheet analysis | Data Managers, Reviewers |
| **Graph exports** | Neo4j/RDF, relationship exploration | Architects, Analysts |
| **Thunderstruck DSL** | Human-readable documentation | Standards Developers |

---

## 2. Scope of Class Variable Mappings

**IMPORTANT**: The standards organisation provides mappings **only to class-level variables**, not study-specific implementations.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STANDARDS ORG RESPONSIBILITY                             │
│                                                                             │
│   DataConcept ────────────────────────────────────────────────────────────  │
│       │                                                                     │
│       ├── is_a ── ADaM CLASS Variable (e.g., CHG, BASE, USUBJID)           │
│       ├── is_a ── SDTM CLASS Variable (e.g., --STRESN, USUBJID)            │
│       ├── is_a ── USDM Element (e.g., Observation.change)                  │
│       └── is_a ── ARS Element (e.g., AnalysisResult.pValue)                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPONSOR/STUDY RESPONSIBILITY                             │
│                                                                             │
│   ADaM CLASS Variable (CHG) ── implemented_by ── ADQSADAS.CHG              │
│   SDTM CLASS Variable (--STRESN) ── implemented_by ── QS.QSSTRESN          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Mapping Scope by External Model

| External Model | What Standards Org Maps | What Sponsors Map |
|----------------|------------------------|-------------------|
| **ADaM** | Class variables (USUBJID, AVAL, CHG, BASE, PARAMCD, etc.) | Study datasets (ADQSADAS.CHG) |
| **SDTM** | Class variables (--STRESN, USUBJID, VISIT, --TESTCD, etc.) | Domain instances (QS.QSSTRESN) |
| **USDM** | JSON paths (StudySubject.identifier, Observation.value) | - |
| **ARS** | Result structure paths (AnalysisResult.estimate, etc.) | - |

---

## 3. Approach to Creating Content

### 3.1 DataConcept Development

#### Step 1: Identify Minimum Viable Concept Set

Start with concepts required for pilot examples (e.g., ANCOVA, Change from Baseline):

| Category | Concepts |
|----------|----------|
| **Foundational** | Subject, Visit, Parameter, Treatment, Site |
| **Derived Values** | AnalysisValue, BaselineValue, ChangeValue, PercentChange |
| **Study Design** | Population (ITT, Efficacy), ImputationMethod |
| **Statistical Output** | LeastSquaresMean, StandardError, PValue, ConfidenceInterval, TreatmentDifference |

#### Step 2: Source Definitions from Ontologies

For each concept, gather definitions from authoritative sources:

| Source | Use For | Access |
|--------|---------|--------|
| **NCIt (NCI Thesaurus)** | Clinical and study design concepts | https://ncithesaurus.nci.nih.gov/ |
| **STATO (Statistical Methods Ontology)** | Statistical concepts | http://stato-ontology.org/ |
| **CDISC Controlled Terminology** | CDISC-specific terms | https://www.cdisc.org/standards/terminology |
| **SNOMED CT** | Clinical observations | Via UMLS or national license |
| **LOINC** | Laboratory/clinical measurements | https://loinc.org/ |

#### Step 3: Define Concept Structure

Each DataConcept should include:

```json
{
  "@id": "acdc:ChangeValue",
  "@type": "DataConcept",
  "name": "ChangeValue",
  "definition": "The difference between a post-baseline value and the baseline value",
  "category": "DerivedMeasurement",
  "references": [
    {
      "source": "NCIt",
      "code": "C25570",
      "label": "Change"
    },
    {
      "source": "STATO",
      "code": "STATO_0000161",
      "label": "difference"
    }
  ]
}
```

### 3.2 Class Variable Mapping Development

#### Step 1: Inventory Existing Standards

Document class variables from each standard:

| Standard | Source Document | Key Variables |
|----------|-----------------|---------------|
| ADaM | ADaM IG, ADaMIG BDS | USUBJID, AVAL, BASE, CHG, PARAMCD, AVISIT, TRT01A, TRTP |
| SDTM | SDTMIG | USUBJID, --STRESN, --TESTCD, VISIT, ARM, EXTRT |
| USDM | USDM Specification | StudySubject, Observation, StudyIntervention |
| ARS | ARS Model | AnalysisResult, OperationResult |

#### Step 2: Create Mapping Declarations

Each mapping declares an `is_a` relationship TO a DataConcept:

```json
{
  "@id": "adam:CHG",
  "@type": "ADaMClassVariable",
  "name": "CHG",
  "label": "Change from Baseline",
  "datatype": "numeric",
  "class": "BDS",
  "is_a": "acdc:ChangeValue"
}
```

#### Step 3: Validate Bidirectional Resolution

Verify that resolution works in both directions:
- Semantic → Physical: `change_value` → `ChangeValue` → `CHG`
- Physical → Semantic: `CHG` → `ChangeValue` → `change_value`

### 3.3 AC/DC Template Development

#### Step 1: Extract Patterns from SAPs

Review Statistical Analysis Plans to identify common patterns:

| Pattern | Example | Frequency |
|---------|---------|-----------|
| ANCOVA | Change from baseline with covariates | Very common |
| MMRM | Mixed model repeated measures | Common |
| Logistic Regression | Binary endpoint analysis | Common |
| Kaplan-Meier | Time-to-event analysis | Common |
| Descriptive Statistics | Summary tables | Very common |

#### Step 2: Model as Cubes

For each pattern, define:
- **Input Cube**: Dimensions, measures, attributes
- **Output Cube(s)**: Aggregated results structure
- **Slice**: Constraint specification
- **Method**: Statistical operation

#### Step 3: Create Template and Instance Examples

Provide both:
- **Library Template**: Portable, no fixed values
- **Study Instance**: Concrete values bound

### 3.4 Reference Code Development

#### Approach: Metadata-Driven Code Generation

The same semantic code works across contexts because resolution happens through the DataConcept hub:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SEMANTIC CODE (Written Once)                             │
│                                                                             │
│    model FitANCOVA {                                                        │
│        formula: change_value ~ baseline_value + site + treatment            │
│    }                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ resolves via DataConcept hub
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
            │  ADaM Context │ │  SDTM Context │ │  R/SAS/Python │
            │               │ │               │ │               │
            │  CHG ~ BASE   │ │  Derived      │ │  lm(CHG ~     │
            │    + SITEID   │ │  expression   │ │    BASE + ..  │
            │    + TRTP     │ │               │ │               │
            └───────────────┘ └───────────────┘ └───────────────┘
```

#### Code Repository Structure

```
code/
├── python/
│   ├── resolver.py          # Universal Connector resolution
│   ├── ancova.py             # ANCOVA implementation
│   ├── change_from_baseline.py
│   └── tests/
├── r/
│   ├── resolver.R
│   ├── ancova.R
│   ├── change_from_baseline.R
│   └── tests/
├── sas/
│   ├── resolver.sas
│   ├── ancova.sas
│   ├── change_from_baseline.sas
│   └── tests/
└── shared/
    ├── concepts.json         # DataConcept definitions
    ├── mappings.json         # Class variable mappings
    └── templates.json        # AC/DC templates
```

---

## 4. Resources Required

### 4.1 Human Resources

| Role | Responsibility | Estimated Effort |
|------|----------------|------------------|
| **Ontology Expert** | DataConcept definitions, NCIt/STATO alignment | 0.5 FTE |
| **Standards Expert** | ADaM/SDTM/USDM mapping validation | 0.5 FTE |
| **Software Developer** | JSON-LD schema, resolution engine | 1 FTE |
| **Statistician** | AC template validation, code review | 0.25 FTE |
| **Technical Writer** | Documentation, examples | 0.25 FTE |

### 4.2 Tools and Infrastructure

| Tool | Purpose | Cost |
|------|---------|------|
| **LinkML** | Schema definition | Open source |
| **JSON-LD Playground** | Validation, testing | Free |
| **Neo4j** | Graph database for relationships | Community edition free |
| **GitHub** | Version control, collaboration | Free |
| **Claude/AI Assistant** | Code generation, documentation | Subscription |

### 4.3 Reference Materials

| Resource | Use |
|----------|-----|
| ADaM Implementation Guide | Class variable definitions |
| SDTM Implementation Guide | Class variable definitions |
| USDM Specification | JSON element paths |
| ARS Model | Result structure definitions |
| CDISC ADaM Examples | Pattern extraction |
| NCIt Browser | Concept definitions |
| STATO OWL files | Statistical concept definitions |

---

## 5. Implementation Timeline

### Phase 1: Foundation (Weeks 1-2)
- [ ] Define minimum viable DataConcept set (~20 concepts)
- [ ] Source definitions from NCIt/STATO
- [ ] Create LinkML schema for DataConcepts
- [ ] Establish JSON-LD context

### Phase 2: Mappings (Weeks 3-4)
- [ ] Document ADaM class variables for pilot concepts
- [ ] Document SDTM class variables for pilot concepts
- [ ] Document USDM elements for pilot concepts
- [ ] Create mapping JSON-LD files
- [ ] Validate bidirectional resolution

### Phase 3: Templates (Weeks 5-6)
- [ ] Create Change from Baseline derivation template
- [ ] Create ANCOVA analysis template
- [ ] Create study instance examples
- [ ] Validate against real SAP examples

### Phase 4: Code (Weeks 7-8)
- [ ] Implement resolution engine (Python)
- [ ] Port resolution engine to R and SAS
- [ ] Create ANCOVA reference implementation
- [ ] Create Change from Baseline reference implementation
- [ ] Write tests for all implementations

### Phase 5: Documentation (Weeks 9-10)
- [ ] Write user guide
- [ ] Create worked examples
- [ ] Generate export formats (CSV, graph)
- [ ] Prepare for public review

---

## 6. Governance

### 6.1 Concept Registry

Maintain a catalog of approved DataConcepts with:
- Unique identifier (URI)
- Version history
- NCIt/STATO references
- Change log

### 6.2 Mapping Registry

Maintain class variable mappings with:
- Source standard and version
- DataConcept reference
- Validation status
- Deprecation notices

### 6.3 Template Library

Maintain AC/DC templates with:
- Template ID and version
- Required DataConcepts
- Validation rules
- Example instances

### 6.4 Change Management

- **Minor changes**: Bug fixes, clarifications (patch version)
- **Additions**: New concepts, mappings, templates (minor version)
- **Breaking changes**: Schema changes, deprecations (major version)

---

## 7. Quality Assurance

### 7.1 Validation Rules

Each deliverable must pass:

| Deliverable | Validation |
|-------------|------------|
| DataConcepts | NCIt/STATO reference exists, definition non-empty |
| Mappings | Target DataConcept exists, class variable valid |
| Templates | All referenced concepts have mappings |
| Code | Unit tests pass, produces expected output |

### 7.2 Review Process

1. **Technical Review**: Schema validity, JSON-LD compliance
2. **Domain Review**: Statistical accuracy, clinical relevance
3. **Public Review**: Community feedback period
4. **Final Approval**: Standards body sign-off

---

## 8. Success Criteria

### Pilot Success (ANCOVA Example)

- [ ] Complete DataConcept definitions for all required concepts
- [ ] Class variable mappings for ADaM, SDTM, USDM, ARS
- [ ] Working template with study instance example
- [ ] Reference code in R, SAS, Python that produces identical results
- [ ] Sentence/Phrase pattern generating correct natural language description
- [ ] Round-trip validation: semantic → physical → semantic

### Full Implementation Success

- [ ] 50+ DataConcepts covering common analysis patterns
- [ ] Templates for top 10 statistical methods
- [ ] Adoption by 2+ sponsor organisations in pilot studies
- [ ] Integration with Define-XML tooling
- [ ] Positive feedback from regulatory reviewers

---

## Appendix A: ANCOVA Pilot Task Breakdown

### Overview

This appendix provides a detailed task breakdown for the ANCOVA pilot. Tasks are organised by phase and include dependencies, deliverables, and suggested assignees.

**Legend:**
- 🔵 Standards/Ontology work
- 🟢 Technical/Development work
- 🟡 Validation/Review work
- 🟣 Documentation work

---

### Phase 1: Foundation (Weeks 1-2)

#### Week 1: DataConcept Identification and Sourcing

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 1.1 | 🔵 Review ANCOVA SAP text | Extract all nouns/concepts from CDISC ADaM Example 1.0 ANCOVA section | Concept extraction spreadsheet | - | Standards Expert |
| 1.2 | 🔵 Categorise extracted concepts | Group into Foundational, Derived, Population, Statistical Output | Categorised concept list | 1.1 | Standards Expert |
| 1.3 | 🔵 Search NCIt for definitions | Find NCIt codes for each concept (Subject, Visit, Treatment, etc.) | NCIt mapping table | 1.2 | Ontology Expert |
| 1.4 | 🔵 Search STATO for statistical concepts | Find STATO codes for LeastSquaresMean, PValue, etc. | STATO mapping table | 1.2 | Ontology Expert |
| 1.5 | 🔵 Draft concept definitions | Write definitions for concepts not found in NCIt/STATO | Draft definitions document | 1.3, 1.4 | Ontology Expert |
| 1.6 | 🟡 Review concept definitions | Statistician reviews statistical concept definitions | Approved definitions | 1.5 | Statistician |

#### Week 2: Schema and Infrastructure Setup

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 2.1 | 🟢 Design LinkML schema for DataConcept | Define schema with name, definition, category, references | `dataconcept.yaml` | 1.6 | Developer |
| 2.2 | 🟢 Design LinkML schema for ClassVariableMapping | Define schema for ADaM/SDTM/USDM mappings | `mapping.yaml` | 2.1 | Developer |
| 2.3 | 🟢 Create JSON-LD context | Define namespaces (acdc, adam, sdtm, ncit, stato) | `context.jsonld` | 2.1 | Developer |
| 2.4 | 🟢 Create 21 DataConcept definitions | Encode all pilot concepts in JSON-LD | `concepts.jsonld` | 2.1, 2.3, 1.6 | Developer |
| 2.5 | 🟢 Set up validation tooling | Configure LinkML validator, JSON-LD playground | Validation scripts | 2.1, 2.2 | Developer |
| 2.6 | 🟡 Validate concept definitions | Run validation, fix any schema errors | Validated concepts | 2.4, 2.5 | Developer |

**Phase 1 Deliverables:**
- [ ] 21 DataConcept definitions in JSON-LD
- [ ] LinkML schema for DataConcepts
- [ ] JSON-LD context file
- [ ] NCIt/STATO reference mapping table

---

### Phase 2: Class Variable Mappings (Weeks 3-4)

#### Week 3: ADaM and SDTM Mappings

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 3.1 | 🔵 Inventory ADaM BDS class variables | List all BDS variables relevant to ANCOVA (USUBJID, AVAL, BASE, CHG, etc.) | ADaM variable inventory | Phase 1 | Standards Expert |
| 3.2 | 🔵 Map ADaM variables to DataConcepts | Create is_a relationships (CHG → ChangeValue) | ADaM mapping table | 3.1, 2.4 | Standards Expert |
| 3.3 | 🔵 Inventory SDTM class variables | List relevant SDTM variables (USUBJID, --STRESN, VISIT, etc.) | SDTM variable inventory | Phase 1 | Standards Expert |
| 3.4 | 🔵 Map SDTM variables to DataConcepts | Create is_a relationships, note derived concepts | SDTM mapping table | 3.3, 2.4 | Standards Expert |
| 3.5 | 🟢 Encode ADaM mappings in JSON-LD | Create `adam-mappings.jsonld` | `adam-mappings.jsonld` | 3.2, 2.2 | Developer |
| 3.6 | 🟢 Encode SDTM mappings in JSON-LD | Create `sdtm-mappings.jsonld` | `sdtm-mappings.jsonld` | 3.4, 2.2 | Developer |

#### Week 4: USDM, ARS Mappings and Validation

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 4.1 | 🔵 Inventory USDM elements | List relevant USDM JSON paths (StudySubject, Observation, etc.) | USDM element inventory | Phase 1 | Standards Expert |
| 4.2 | 🔵 Map USDM elements to DataConcepts | Create is_a relationships | USDM mapping table | 4.1, 2.4 | Standards Expert |
| 4.3 | 🔵 Inventory ARS result elements | List ARS paths for statistical outputs (estimate, pValue, etc.) | ARS element inventory | Phase 1 | Standards Expert |
| 4.4 | 🔵 Map ARS elements to DataConcepts | Create is_a relationships for output concepts | ARS mapping table | 4.3, 2.4 | Standards Expert |
| 4.5 | 🟢 Encode USDM mappings in JSON-LD | Create `usdm-mappings.jsonld` | `usdm-mappings.jsonld` | 4.2, 2.2 | Developer |
| 4.6 | 🟢 Encode ARS mappings in JSON-LD | Create `ars-mappings.jsonld` | `ars-mappings.jsonld` | 4.4, 2.2 | Developer |
| 4.7 | 🟢 Build resolution lookup table | Create combined mapping index for resolver | `mappings-index.json` | 3.5, 3.6, 4.5, 4.6 | Developer |
| 4.8 | 🟡 Validate bidirectional resolution | Test semantic → physical and physical → semantic | Validation report | 4.7 | Developer |

**Phase 2 Deliverables:**
- [ ] ADaM class variable mappings (JSON-LD)
- [ ] SDTM class variable mappings (JSON-LD)
- [ ] USDM element mappings (JSON-LD)
- [ ] ARS element mappings (JSON-LD)
- [ ] Combined mapping index
- [ ] Bidirectional resolution validation report

---

### Phase 3: AC/DC Templates (Weeks 5-7)

#### Derivation Dependency Chain

The ANCOVA analysis depends on a chain of upstream derivations. These must be defined in dependency order:

```
ANCOVA Input requires:
├── CHG (Change from Baseline) ← requires AVAL and BASE
│   ├── AVAL (Analysis Value) ← from SDTM --STRESN or derived
│   └── BASE (Baseline Value) ← requires AVAL at baseline visit + baseline flag
│       ├── AVAL at ABLFL="Y"
│       └── ABLFL (Baseline Flag) ← derived from visit/timing rules
├── Population flags (EFFFL, ITTFL) ← derived from criteria
└── LOCF imputation ← derived for missing values
```

#### Week 5: Upstream Derivation Concepts

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 5.1 | 🔵 Define DC: AnalysisValue (AVAL) | SDTM → ADaM mapping for analysis value | DC spec | Phase 2 | Standards Expert |
| 5.2 | 🔵 Define AnalysisValue input cube | Dimensions, measures from SDTM (--STRESN, --STRESC) | DC input cube spec | 5.1 | Standards Expert |
| 5.3 | 🔵 Define AnalysisValue derivation method | Mapping rules for numeric/character results | DC method spec | 5.2 | Standards Expert |
| 5.4 | 🟢 Encode DC: AnalysisValue in JSON-LD | Create `dc-analysis-value.jsonld` | DC template file | 5.1, 5.2, 5.3 | Developer |
| 5.5 | 🔵 Define DC: BaselineFlag (ABLFL) | Timing criteria → baseline identification | DC spec | Phase 2 | Standards Expert |
| 5.6 | 🔵 Define BaselineFlag input cube | Dimensions (subject, visit, parameter), attributes (visit timing) | DC input cube spec | 5.5 | Standards Expert |
| 5.7 | 🔵 Define BaselineFlag derivation method | Rules for identifying baseline record | DC method spec | 5.6 | Standards Expert |
| 5.8 | 🟢 Encode DC: BaselineFlag in JSON-LD | Create `dc-baseline-flag.jsonld` | DC template file | 5.5, 5.6, 5.7 | Developer |
| 5.9 | 🔵 Define DC: BaselineValue (BASE) | AVAL + ABLFL → baseline value | DC spec | 5.4, 5.8 | Standards Expert |
| 5.10 | 🔵 Define BaselineValue input cube | Requires AVAL and ABLFL from upstream DCs | DC input cube spec | 5.9 | Standards Expert |
| 5.11 | 🔵 Define BaselineValue derivation method | Copy AVAL where ABLFL="Y", propagate to post-baseline | DC method spec | 5.10 | Standards Expert |
| 5.12 | 🟢 Encode DC: BaselineValue in JSON-LD | Create `dc-baseline-value.jsonld` | DC template file | 5.9, 5.10, 5.11 | Developer |
| 5.13 | 🔵 Define DC: PopulationFlag (EFFFL/ITTFL) | Criteria → population flags | DC spec | Phase 2 | Standards Expert |
| 5.14 | 🔵 Define PopulationFlag input cube | Subject-level attributes for criteria evaluation | DC input cube spec | 5.13 | Standards Expert |
| 5.15 | 🔵 Define PopulationFlag derivation method | Business rules for population inclusion | DC method spec | 5.14 | Standards Expert |
| 5.16 | 🟢 Encode DC: PopulationFlag in JSON-LD | Create `dc-population-flag.jsonld` | DC template file | 5.13, 5.14, 5.15 | Developer |
| 5.17 | 🔵 Define DC: LOCFImputation | Missing data → imputed values | DC spec | 5.4 | Standards Expert |
| 5.18 | 🔵 Define LOCFImputation input cube | Time-ordered observations with missingness | DC input cube spec | 5.17 | Standards Expert |
| 5.19 | 🔵 Define LOCFImputation derivation method | Last observation carried forward logic | DC method spec | 5.18 | Standards Expert |
| 5.20 | 🟢 Encode DC: LOCFImputation in JSON-LD | Create `dc-locf-imputation.jsonld` | DC template file | 5.17, 5.18, 5.19 | Developer |

#### Week 6: Change from Baseline and ANCOVA Templates

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 6.1 | 🔵 Define DC: ChangeFromBaseline (CHG) | AVAL - BASE → change value | DC spec | 5.4, 5.12 | Standards Expert |
| 6.2 | 🔵 Define ChangeFromBaseline input cube | Requires AVAL and BASE from upstream DCs | DC input cube spec | 6.1 | Standards Expert |
| 6.3 | 🔵 Define ChangeFromBaseline derivation method | Formula: CHG = AVAL - BASE | DC method spec | 6.2 | Standards Expert |
| 6.4 | 🟢 Encode DC: ChangeFromBaseline in JSON-LD | Create `dc-change-from-baseline.jsonld` | DC template file | 6.1, 6.2, 6.3 | Developer |
| 6.5 | 🔵 Define ANCOVA AC input cube | Dimensions (subject, treatment, site), measures (CHG, BASE) | AC input cube spec | 6.4, 5.12, 5.16 | Standards Expert |
| 6.6 | 🔵 Define ANCOVA AC output cubes | TreatmentResults, ComparisonResults structures | AC output cube specs | 6.5 | Standards Expert |
| 6.7 | 🔵 Define ANCOVA model method | Formula, family, link, comparison specification | AC method spec | 6.5, 6.6 | Statistician |
| 6.8 | 🟢 Encode AC template in JSON-LD | Create `ac-ancova-template.jsonld` | AC template file | 6.5, 6.6, 6.7 | Developer |

#### Week 7: Study Instance and Sentence/Phrase

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 7.1 | 🔵 Define study instance slice | Fix clause with ADAS-Cog(11), Week 24, Efficacy, LOCF | Slice specification | 6.8 | Standards Expert |
| 7.2 | 🟢 Encode study instance in JSON-LD | Create `ac-ancova-study-instance.jsonld` | Study instance file | 7.1 | Developer |
| 7.3 | 🔵 Define phrase roles and templates | as_result, as_method, as_scope, etc. | Phrase role catalog | 6.8 | Standards Expert |
| 7.4 | 🔵 Create static phrases | ResultPhrase, MethodPhrase_ANCOVA, ComparisonPhrase, etc. | Static phrase definitions | 7.3 | Standards Expert |
| 7.5 | 🔵 Create parameterised phrases | ScopePhrase, TimepointPhrase with is_a and fix relationships | Parameterised phrase definitions | 7.3, 7.1 | Standards Expert |
| 7.6 | 🔵 Compose ANCOVA sentence | Full natural language description from phrases | Sentence definition | 7.4, 7.5 | Standards Expert |
| 7.7 | 🟢 Encode sentences in JSON-LD | Create `sentences.jsonld` | Sentence file | 7.4, 7.5, 7.6 | Developer |
| 7.8 | 🟡 Validate template against SAP | Compare generated description with source SAP text | Validation report | 7.6, 7.7 | Statistician |

**Phase 3 Deliverables:**
- [ ] DC: AnalysisValue template (JSON-LD)
- [ ] DC: BaselineFlag template (JSON-LD)
- [ ] DC: BaselineValue template (JSON-LD)
- [ ] DC: PopulationFlag template (JSON-LD)
- [ ] DC: LOCFImputation template (JSON-LD)
- [ ] DC: ChangeFromBaseline template (JSON-LD)
- [ ] ANCOVA AC template (JSON-LD)
- [ ] Study instance example (JSON-LD)
- [ ] Sentence/Phrase definitions (JSON-LD)
- [ ] Template validation report

---

### Phase 4: Reference Code (Weeks 8-9)

#### Week 8: Resolution Engine and Python Implementation

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 8.1 | 🟢 Design resolver API | Define interface: resolve(semantic_name, context) → physical_name | API specification | Phase 3 | Developer |
| 8.2 | 🟢 Implement Python resolver | Load mappings, perform bidirectional resolution | `resolver.py` | 8.1, 4.7 | Developer |
| 8.3 | 🟢 Write resolver unit tests | Test all concepts in ADaM/SDTM/USDM contexts | `test_resolver.py` | 8.2 | Developer |
| 8.4 | 🟢 Implement Python ANCOVA | Metadata-driven ANCOVA using semantic names | `ancova.py` | 8.2, 6.8 | Developer |
| 8.5 | 🟢 Implement Python derivation chain | All 6 DCs: AVAL, ABLFL, BASE, CHG, PopFlag, LOCF | `derivations.py` | 8.2, 5.4-6.4 | Developer |
| 8.6 | 🟢 Create Python test data | Sample ADQSADAS-like data for testing | `test_data.csv` | 8.4 | Developer |
| 8.7 | 🟢 Write Python integration tests | End-to-end test: metadata → code → results | `test_integration.py` | 8.4, 8.5, 8.6 | Developer |

#### Week 9: R and SAS Implementation

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 9.1 | 🟢 Port resolver to R | Translate Python resolver to R | `resolver.R` | 8.2 | Developer |
| 9.2 | 🟢 Implement R ANCOVA | Using emmeans/lm with resolved variable names | `ancova.R` | 9.1, 6.8 | Developer |
| 9.3 | 🟢 Implement R derivation chain | All 6 DCs using dplyr/mutate with resolved names | `derivations.R` | 9.1, 5.4-6.4 | Developer |
| 9.4 | 🟢 Write R tests | Test R implementations produce same results as Python | `test_ancova.R` | 9.2, 9.3, 8.6 | Developer |
| 9.5 | 🟢 Port resolver to SAS | Translate resolver logic to SAS macro | `resolver.sas` | 8.2 | Developer |
| 9.6 | 🟢 Implement SAS ANCOVA | PROC MIXED with resolved variable names | `ancova.sas` | 9.5, 6.8 | Developer |
| 9.7 | 🟢 Implement SAS derivation chain | All 6 DCs in DATA steps with resolved names | `derivations.sas` | 9.5, 5.4-6.4 | Developer |
| 9.8 | 🟡 Cross-language validation | Verify R, SAS, Python produce identical numerical results | Cross-validation report | 9.4, 9.6, 8.7 | Statistician |

**Phase 4 Deliverables:**
- [ ] Resolution engine (Python, R, SAS)
- [ ] ANCOVA implementation (Python, R, SAS)
- [ ] Full derivation chain implementation (Python, R, SAS) - 6 DCs
- [ ] Test suite with sample data
- [ ] Cross-language validation report

---

### Phase 5: Documentation and Review (Weeks 10-11)

#### Week 10: Documentation

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 10.1 | 🟣 Write DataConcept user guide | How to use/extend concepts | User guide section | Phase 2 | Technical Writer |
| 10.2 | 🟣 Write mapping user guide | How mappings work, how to add new ones | User guide section | Phase 2 | Technical Writer |
| 10.3 | 🟣 Write template user guide | How to create templates and instances | User guide section | Phase 3 | Technical Writer |
| 10.4 | 🟣 Write code user guide | How to use reference implementations | User guide section | Phase 4 | Technical Writer |
| 10.5 | 🟣 Create worked example document | Step-by-step ANCOVA walkthrough with full derivation chain | Worked example | All phases | Technical Writer | �� Create worked example document | Step-by-step ANCOVA walkthrough | Worked example | All phases | Technical Writer |
| 10.6 | 🟢 Generate CSV exports | Export concepts, mappings, templates as CSV | CSV files | All phases | Developer |
| 10.7 | 🟢 Generate Neo4j import files | Create Cypher scripts for graph database | Cypher scripts | All phases | Developer |
| 10.8 | 🟢 Update Thunderstruck DSL files | Ensure .tsk files match JSON-LD | Updated .tsk files | All phases | Developer |

#### Week 11: Review and Finalisation

| ID | Task | Description | Deliverable | Depends On | Assignee |
|----|------|-------------|-------------|------------|----------|
| 11.1 | 🟡 Internal technical review | Review all JSON-LD for schema compliance | Review checklist | 10.1-10.8 | Developer |
| 11.2 | 🟡 Internal domain review | Statistician reviews all statistical content | Review checklist | 10.1-10.8 | Statistician |
| 11.3 | 🟡 Internal standards review | Standards expert reviews ADaM/SDTM alignment | Review checklist | 10.1-10.8 | Standards Expert |
| 11.4 | 🟣 Incorporate review feedback | Address all review comments | Updated deliverables | 11.1, 11.2, 11.3 | All |
| 11.5 | 🟣 Prepare public review package | Bundle all deliverables for external review | Review package | 11.4 | Technical Writer |
| 11.6 | 🟡 Final validation | Run complete test suite, verify all success criteria | Final validation report | 11.4 | Developer |

**Phase 5 Deliverables:**
- [ ] User guide (4 sections)
- [ ] Worked example document
- [ ] CSV exports
- [ ] Neo4j import files
- [ ] Updated Thunderstruck DSL files
- [ ] Public review package
- [ ] Final validation report

---

### Task Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|------------------|
| **1. Foundation** | 12 tasks | 21 DataConcepts, LinkML schema, JSON-LD context |
| **2. Mappings** | 14 tasks | ADaM, SDTM, USDM, ARS mappings |
| **3. Templates** | 16 tasks | DC template, AC template, study instance, sentences |
| **4. Code** | 16 tasks | Resolver + implementations in Python, R, SAS |
| **5. Documentation** | 14 tasks | User guide, examples, exports, review package |
| **Total** | **72 tasks** | |

---

### Resource Allocation by Phase

| Phase | Standards Expert | Ontology Expert | Developer | Statistician | Technical Writer |
|-------|-----------------|-----------------|-----------|--------------|------------------|
| 1 | 20% | 60% | 40% | 10% | 0% |
| 2 | 60% | 10% | 40% | 0% | 0% |
| 3 | 50% | 0% | 40% | 20% | 0% |
| 4 | 0% | 0% | 80% | 20% | 0% |
| 5 | 10% | 0% | 30% | 10% | 60% |

---

## Appendix B: Pilot Concept List

### Foundational Concepts
1. Subject
2. Visit
3. VisitNumeric
4. Parameter
5. Treatment
6. Site

### Derived Value Concepts
7. AnalysisValue
8. BaselineValue
9. ChangeValue
10. PercentChangeValue

### Population Concepts
11. ITTFlag
12. EfficacyFlag
13. SafetyFlag

### Imputation Concepts
14. ImputationMethod
15. LOCFFlag

### Statistical Output Concepts
16. LeastSquaresMean
17. StandardError
18. PValue
19. ConfidenceLower
20. ConfidenceUpper
21. TreatmentDifference

---

## Appendix B: Example JSON-LD Structure

### DataConcept Definition

```json
{
  "@context": {
    "acdc": "http://cdisc.org/ns/acdc#",
    "ncit": "http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#",
    "stato": "http://purl.obolibrary.org/obo/STATO_"
  },
  "@id": "acdc:ChangeValue",
  "@type": "acdc:DataConcept",
  "acdc:name": "ChangeValue",
  "acdc:definition": "The difference between a post-baseline value and the baseline value",
  "acdc:category": "acdc:DerivedMeasurement",
  "acdc:seeAlso": [
    {"@id": "ncit:C25570"},
    {"@id": "stato:0000161"}
  ]
}
```

### Class Variable Mapping

```json
{
  "@context": {
    "acdc": "http://cdisc.org/ns/acdc#",
    "adam": "http://cdisc.org/ns/adam#"
  },
  "@id": "adam:CHG",
  "@type": "acdc:ADaMClassVariable",
  "acdc:name": "CHG",
  "acdc:label": "Change from Baseline",
  "acdc:datatype": "numeric",
  "adam:class": "BDS",
  "acdc:is_a": {"@id": "acdc:ChangeValue"}
}
```

---

## Appendix C: References

- [CDISC Analysis Concepts Wiki](https://github.com/cdisc-org/analysis-concepts/wiki)
- [Thunderstruck DSL](https://github.com/metadatadriven/acdc-wip)
- [NCIt Browser](https://ncithesaurus.nci.nih.gov/)
- [STATO Ontology](http://stato-ontology.org/)
- [JSON-LD Specification](https://www.w3.org/TR/json-ld11/)
- [LinkML](https://linkml.io/)
- [W3C Data Cube Vocabulary](https://www.w3.org/TR/vocab-data-cube/)

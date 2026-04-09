# Analysis Concepts (AC/DC Framework)

The main purpose of the Analysis Concepts project is to define and model concepts representing the derivation and analysis of data to support end-to-end automation and the CDISC 360i project.

The AC/DC (Analysis Concepts / Derivation Concepts) Framework provides a metadata-driven architecture for specifying, configuring, and executing statistical analyses for clinical trials. It separates *what* needs to be analyzed from *how* it is computed, enabling interchange, automation, and reuse across organizations and programming languages.

![Analysis Concepts](./images/analysis-concepts.png)

---

## Design Principles

| Principle | Description |
| --- | --- |
| **Concept-first modeling** | Concepts describe the real world independently of any study or data standard. A "change from baseline" is the same concept whether implemented in ADaM, SDTM, OMOP, or FHIR. |
| **Separation of specification from implementation** | Conceptual layer (human-readable) is kept distinct from the implementation layer (machine-readable, executable). This mirrors ISO 11179 terminology for metadata registries. |
| **Method–Concept independence** | Methods (statistical procedures) know nothing about concepts (clinical meaning). Transformations bridge the two, binding method input/output roles to concept dimensions. This keeps both sides reusable. |
| **Metadata-driven execution** | The execution engine reads method definitions, call templates, and output mappings from JSON metadata. Adding a new statistical method requires zero code changes to the engine or UI — only new JSON entries. |
| **Standards alignment** | Value types align to FHIR R5 primitives and complex types. Statistical measures link to the STATO ontology. Concept hierarchies use SKOS vocabulary (broader/narrower, inScheme, prefLabel). |
| **KISS** | Some complexity is unavoidable, but simplicity is a design goal. Complexity can be hidden from end-users by tools. "Do one thing and do it well" — a derivation requiring multiple steps should be broken into multiple Derivation Concepts. |

---

## Framework Layers

The framework is organized into three layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Conceptual Layer                                           │
│  AC (Analysis Concepts) · DC (Derivation Concepts)          │
│  OC (Observation Concepts) · Shared Definitions             │
│  Standard-agnostic, human-readable                          │
├─────────────────────────────────────────────────────────────┤
│  Transformation Layer                                       │
│  Methods + Concepts → Transformations                       │
│  SmartPhrases · Configuration Options · Bindings            │
├─────────────────────────────────────────────────────────────┤
│  Implementation Layer                                       │
│  Language-specific code templates (R, SAS, Python, Julia)   │
│  Variable mappings (ADaM, SDTM) · Executable specifications│
└─────────────────────────────────────────────────────────────┘
```

| Layer | Location | Role |
| --- | --- | --- |
| **Conceptual** | `model/concept/`, `model/shared/` | Defines what things mean, independent of data standards |
| **Transformation** | `lib/transformations/`, `lib/methods/` | Bridges methods and concepts via bindings, formulas, and configurations |
| **Implementation** | `lib/method_implementations/`, `ac-dc-app/data/` | Maps concepts to physical variables and methods to executable code |

---

## Model Elements

### Observation Concepts (OC)

**File:** `model/concept/OC_Instance_Model_v016.json` · **Schema:** `model/concept/oc_concepts.schema.json` (v0.16)

The Observation Concept is the atomic unit of clinical data. It represents a single observation in the real world (e.g., a blood pressure measurement, an adverse event occurrence).

- **Structure groups:** Identification (Topic, Category, Sequence), Result (Value, Unit, ReferenceRange), CollectionMethod (Device, Technique, Specimen)
- **Shared dimensions:** Subject, Study, Visit, Timing, Treatment, Population, Site
- **Observation subtypes:** EventObservation, InterventionObservation, FindingObservation, FindingAboutObservation
- **FHIR R5 alignment:** Value types mapped to FHIR primitives (decimal, integer, code, string, boolean, date, dateTime) and complex types (Quantity, CodeableConcept, Identifier)

### Derivation Concepts (DC)

**Files:** `model/concept/Option_B_Clinical.json` (currently used) · **Schema:** `model/concept/dc_concepts.schema.json` (v0.20)

Derivation Concepts describe subject-level data transformations — creating new data from collected or other derived data. Four naming options exist (A–D); **Option B (Clinical)** is the active variant.

**Categories (Option B):**

| Category | Concepts | Description |
| --- | --- | --- |
| PointComputation | Measure | Direct values (BMI, eGFR, imputed values) |
| Comparison | Change, PercentChange, Ratio, LogRatio, Shift | Differences and transitions from a reference point |
| SequenceAggregate | PeakValue, TroughValue, AreaUnderCurve, SequenceAverage | Aggregations over a sequence of observations |
| Classification | Flag, Category | Event indicators and categorized values |

Each DC concept carries dimensions that describe the semantic axes of the derived data (e.g., Subject, Parameter, AnalysisVisit, Treatment, Population).

### Analysis Concepts (AC)

**File:** `model/concept/AC_Concept_Model_v016.json` · **Schema:** `model/concept/ac_concepts.schema.json` (v0.16)

Analysis Concepts describe aggregated, non-subject-level results. They follow a 3-level SKOS-inspired hierarchy:

1. **Statistical Concepts** (atoms) — Individual statistical measures: Estimate, SE, CI_Lower, CI_Upper, PValue, HazardRatio, OddsRatio, etc.
2. **Result Patterns** (molecules) — Groups of related statistics: LSMeans, Contrasts, RegressionCoefficients, SurvivalCurves, FrequencyTable, etc.
3. **Categories** — Higher-order groupings of result patterns

Method output slots map to AC concepts, connecting computed results to their statistical meaning.

### Methods

**Directory:** `lib/methods/` · **Schema:** `model/method/acdc_methods.schema.json` (v0.6.0)

Methods describe *how* an analysis or derivation should be performed. A method has:

- **Input roles** — Named parameters with statisticalRole, dataType, cardinality, and required flag (e.g., `response: required decimal`, `group: optional code`)
- **Output specification** — Output classes, dimensions, and statistics produced
- **Formula** — Human-readable expression using a defined grammar (e.g., `result := MEAN(<response>) OVER (<group>*)`)
- **STATO coding** — Link to the Statistical Methods Ontology

**Method categories:**

| Type | Count | Examples |
| --- | --- | --- |
| **Derivations** | 60+ | Subtraction, Division, PercentChange, DateDifference, Categorization, Imputation (LOCF, BOCF, WOCF, Mean, Median, Zero), Rounding, WindowLookup |
| **Analyses** | 40+ | Mean, Median, Variance, StdDev, TTest, ANOVA, ANCOVA, MMRM, Chi-Square, Fisher Exact, CMH, Log-Rank, Kaplan-Meier, Cox PH, Count, Proportion |

**Supporting vocabularies:**

| File | Purpose |
| --- | --- |
| `model/method/statistics_vocabulary.json` (v0.5.0) | Reusable statistic definitions (estimate, SE, CI, p_value, etc.) with STATO codings |
| `model/method/output_class_templates.json` | Standard output structure templates used by methods |
| `model/method/formula_grammar.json` | BNF grammar for analysis formulas (Wilkinson-Rogers style) and derivation formulas (assignment style) |

### Shared Definitions

**Directory:** `model/shared/`

| File | Purpose |
| --- | --- |
| `fhir_value_types.json` | FHIR R5 type alignment — primitive types for method inputs, complex types (Quantity, CodeableConcept, Identifier) for concept outputs |
| `oc_bc_property_mapping.json` | Maps USDM BiomedicalConceptProperty codes to OC Instance Model facets (result, unit, qualifier, context, condition, identity) |
| `bc_to_oc_instance_mapping.json` | Mapping between biomedical concepts and observation instance properties |

**Qualifier types** (`model/concept/CDDM_Shared_QualifierTypes.json`):

| Qualifier | Values | ADaM examples |
| --- | --- | --- |
| IntentType | Planned, Actual | TRTP / TRTA |
| DerivationStatus | Protocol, Analysis | VISIT / AVISIT |
| ReferenceFrame | Relative, Absolute | ADY / ADT |
| BoundaryType | Start, End | ASTDT / AENDT |

### Transformations

**File:** `lib/transformations/ACDC_Transformation_Library_v06.json` · **Schema:** `model/method/acdc_transformations.schema.json` (v0.1.0)

Transformations are the bridge between Methods and Concepts. Each transformation:

- References a **method** (`usesMethod: M.*`)
- Declares **bindings** that map concept dimensions to method input/output roles
- Specifies a **transformation type** (derivation or analysis)
- Is an **instance of** a concept (`instanceOf: DC.* or AC.*`)
- Has a **composedPhrase** (human-readable template describing the analysis)

**SmartPhrases** — Reusable phrase templates for human-readable descriptions:

| SmartPhrase | Template |
| --- | --- |
| SP_CFB_ENDPOINT | "change from baseline in {parameter}" |
| SP_PCTCFB_ENDPOINT | "percent change from baseline in {parameter}" |
| SP_TTE_ENDPOINT | "time to {event}" |
| SP_RESPONDER_ENDPOINT | "proportion of responders in {parameter}" |
| SP_VALUE_ENDPOINT | "{parameter} value" |
| SP_SHIFT_ENDPOINT | "shift from baseline in {parameter}" |

**ConfigurationOptions** — Parameterized choices resolved at study time:

| Option | Values | Default |
| --- | --- | --- |
| imputation | LOCF, BOCF, WOCF, Mean, Median, MMRM | LOCF |
| event | death, discontinuation, first AE, disease progression | — |
| strata | site, region, baseline severity | — |
| conf_level | 90, 95, 97.5, 99 | 95 |

### Implementation Catalog

**File:** `lib/method_implementations/r_implementations.json` · **Schema:** `model/method/method_implementation_catalog.schema.json` (v0.1.0)

The implementation catalog maps abstract methods to language-specific executable code. Each entry contains:

- **`callTemplate`** — Code template with `<role>` placeholders, e.g.: `t.test(<response> ~ <fixed_effect>, data = <dataset>, paired = TRUE)`
- **`outputMapping`** — Expressions to extract results from the language's return value, e.g.: `estimate → result$estimate`, `p_value → result$p.value`
- **`package`** and **`function`** — The library and function to call (e.g., `stats::t.test`)
- **`documentation`** — URL to the function's documentation

Currently implemented for **R**. The schema supports R, SAS, Python, and Julia.

### Concept-to-Variable Mappings

**File:** `ac-dc-app/data/concept-variable-mappings.json`

Maps abstract concepts to physical variable names within specific data standards:

| Concept | ADaM Variable | Data Type |
| --- | --- | --- |
| Measure | AVAL / AVALC | decimal / code |
| Change | CHG | decimal |
| PercentChange | PCHG | decimal |
| Shift | AVALC | string |
| PeakValue | AVAL | decimal |
| Flag | AVALC, xxxFL | boolean |
| Category | AVALC | code |

**Dimension mappings:**

| Dimension | ADaM Variable(s) |
| --- | --- |
| Subject | USUBJID |
| Parameter | PARAMCD, PARAM |
| Timing | ADT, ADY, ATPT |
| AnalysisVisit | AVISIT, AVISITN |
| Treatment | TRTA, TRTP |
| Population | ITTFL, SAFFL, EFFFL |
| Period | APERIOD, APERIODC |
| Site | SITEID, SITEGR1 |

---

## Schema Files

| Schema | Path | Version | Defines |
| --- | --- | --- | --- |
| AC Concepts | `model/concept/ac_concepts.schema.json` | v0.16 | Analysis Concept hierarchy (Statistical Concepts → Result Patterns → Categories) |
| DC Concepts | `model/concept/dc_concepts.schema.json` | v0.20 | Derivation Concept categories, dimensions, and FHIR-aligned result types |
| OC Concepts | `model/concept/oc_concepts.schema.json` | v0.16 | Observation Concept instance model with recursive data definitions |
| Methods | `model/method/acdc_methods.schema.json` | v0.6.0 | Method definitions with input/output roles, formulas, and STATO codings |
| Transformations | `model/method/acdc_transformations.schema.json` | v0.1.0 | Transformation bindings, SmartPhrases, and configuration options |
| Implementations | `model/method/method_implementation_catalog.schema.json` | v0.1.0 | Language-specific code templates with callTemplate and outputMapping |
| Study eSAP | `model/study/study_esap.schema.json` | — | Study-level electronic Statistical Analysis Plan structure |

---

## The eSAP Builder App

The `ac-dc-app/` directory contains a browser-based electronic Statistical Analysis Plan (eSAP) builder that demonstrates the framework end-to-end — from study selection to in-browser R execution.

### Technology Stack

- **Frontend:** Vanilla JavaScript (ES6 modules), HTML5, CSS3 — no framework dependencies
- **Execution:** WebR (WebAssembly R runtime) for in-browser statistical analysis
- **Serving:** Python SimpleHTTPServer (`serve.py`, port 8080)
- **Architecture:** Single-Page Application with hash-based routing and centralized state

### 8-Step Wizard Workflow

| Step | View | Purpose |
| --- | --- | --- |
| 1 | `study-select.js` | Browse and select a USDM study |
| 2 | `study-overview.js` | Review study design, arms, objectives, endpoints, populations |
| 3 | `endpoint-what.js` | Select endpoint and specify the derivation concept |
| 4 | `endpoint-how.js` | Choose analysis method and configure it |
| 5 | `endpoint-summary.js` | Review all configured endpoints in a summary table |
| 6 | `derivation-pipeline.js` | Define derivation chains for composite/derived concepts |
| 7 | `esap-builder.js` | Build narrative eSAP document with method specifications |
| 8 | `execute-analysis.js` | Upload ADaM XPT datasets and run analyses via WebR |

### How the App Uses Metadata

The app loads **14 data sources in parallel** at startup (`data-loader.js`) and derives all behavior from them:

```
USDM Study JSON ──→ Parsed endpoints, populations, arms
                      ↓
Concept Models ─────→ DC categories, OC dimensions, AC hierarchy
                      ↓
Transformation Lib ─→ SmartPhrases, bindings, configuration options
                      ↓
Method Library ─────→ Input/output roles, formulas, statistics
                      ↓
R Implementations ──→ callTemplate, outputMapping, package info
                      ↓
Variable Mappings ──→ Concept → ADaM variable resolution
                      ↓
           ┌─────────────────────────┐
           │  Resolved Specification │ ← rebuilt before each render
           │  (fully executable JSON)│
           └────────────┬────────────┘
                        ↓
           WebR Engine (acdc_engine.R)
           ├─ Resolves concept → variable names from mappings
           ├─ Builds data cube from slices
           ├─ Evaluates callTemplate with resolved role bindings
           ├─ Extracts results via outputMapping expressions
           └─ Returns JSON results
```

**Key property:** Adding a new statistical method requires only:
1. A method JSON definition in `lib/methods/` (formula, input/output roles)
2. An R implementation entry in `lib/method_implementations/r_implementations.json` (callTemplate + outputMapping)
3. Zero changes to `acdc_engine.R` or any JavaScript code

### Known Hardcoding

While the framework is designed to be fully metadata-driven, the app currently contains a few instances where domain values are hardcoded in JavaScript rather than derived from model metadata:

| Issue | Location | Description |
| --- | --- | --- |
| BC domain grouping | `endpoint-spec.js`, `derivation-pipeline.js` | Biomedical Concept grouping uses hardcoded string matches (e.g., "Blood Pressure" → "Vital Signs", "ADAS-Cog" → "ADAS-Cog Items"). Should be externalized to a metadata configuration file. |
| Concept type checks | `endpoint-spec.js`, `derivation-pipeline.js` | Checks like `slot.concept === 'Measure'` and `conceptCat !== 'Observation'` use string literals instead of model-driven lookups. |
| SmartPhrase role filtering | `phrase-engine.js`, `smartphrase-builder.js` | A fixed set of role names (`endpoint`, `parameter`, `timepoint`, `population`, `grouping`) is hardcoded. Adding new roles requires code changes. |
| Auto-confirm dimensions | `derivation-pipeline.js` | A hardcoded set (`Subject`, `Parameter`, `AnalysisVisit`, etc.) determines which dimensions are auto-confirmed. Should be derived from the DC or OC model. |

---

## Repository Structure

```
analysis-concepts/
├── model/                              # Conceptual layer
│   ├── concept/                        # AC, DC, OC concept models + schemas
│   │   ├── AC_Concept_Model_v016.json
│   │   ├── Option_B_Clinical.json      # Active DC variant
│   │   ├── OC_Instance_Model_v016.json
│   │   ├── CDDM_Shared_QualifierTypes.json
│   │   └── *.schema.json              # Validation schemas
│   ├── method/                         # Method schemas + vocabularies
│   │   ├── acdc_methods.schema.json
│   │   ├── acdc_transformations.schema.json
│   │   ├── statistics_vocabulary.json
│   │   ├── output_class_templates.json
│   │   └── formula_grammar.json
│   ├── shared/                         # Cross-cutting definitions
│   │   ├── fhir_value_types.json
│   │   ├── oc_bc_property_mapping.json
│   │   └── bc_to_oc_instance_mapping.json
│   ├── study/                          # Study-level schemas
│   └── drawings/                       # Architecture diagrams (.drawio)
│
├── lib/                                # Transformation + implementation layer
│   ├── methods/                        # Method definitions
│   │   ├── _index.json                 # Method catalog
│   │   ├── analyses/                   # 39 analysis methods (M.Mean, M.TTest, ...)
│   │   └── derivations/               # 17 derivation methods (M.Subtraction, ...)
│   ├── transformations/                # Transformation library
│   │   └── ACDC_Transformation_Library_v06.json
│   └── method_implementations/         # Language-specific code templates
│       └── r_implementations.json
│
├── ac-dc-app/                          # eSAP Builder web application
│   ├── index.html                      # SPA entry point
│   ├── serve.py                        # Dev server (port 8080)
│   ├── js/
│   │   ├── app.js                      # State management + routing
│   │   ├── data-loader.js              # Parallel data loading
│   │   ├── components/                 # header, sidebar, drag-drop
│   │   ├── views/                      # 8 wizard step views
│   │   └── utils/                      # Parsers, engines, serializers
│   ├── css/                            # Modular stylesheets
│   ├── r/                              # R execution engine
│   │   └── acdc_engine.R              # Metadata-driven R engine
│   └── data/                           # Sample data
│       ├── usdm/                       # USDM study definitions
│       ├── adam/                        # ADaM sample datasets
│       ├── sdtm/                       # SDTM sample datasets
│       └── concept-variable-mappings.json
│
├── scripts/                            # Utilities (validation, enrichment)
├── documents/                          # Presentations and model drawings
└── studies/                            # Study index
```

---

## Contribution

Contribution is very welcome. When you contribute to this repository you are doing so under the below licenses. Please checkout [Contribution](CONTRIBUTING.md) for additional information. All contributions must adhere to the following [Code of Conduct](CODE_OF_CONDUCT.md).

## License

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg) ![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-blue.svg)

### Code & Scripts

This project is using the [MIT](http://www.opensource.org/licenses/MIT "The MIT License | Open Source Initiative") license (see [`LICENSE`](LICENSE)) for code and scripts.

### Content

The content files like documentation and minutes are released under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). This does not include trademark permissions.

## Re-use

When you re-use the source, keep or copy the license information also in the source code files. When you re-use the source in proprietary software or distribute binaries (derived or underived), copy additionally the license text to a third-party-licenses file or similar.

When you want to re-use and refer to the content, please do so like the following:

> Content based on [CDISC Analysis Concepts (GitHub)](https://github.com/cdisc-org/analysis-concepts) used under the [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) license.

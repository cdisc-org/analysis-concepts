# AC/DC Framework Workbench - Claude Code Project Prompt

## Project Overview

Build a **Streamlit application** that demonstrates the AC/DC Framework (Analysis Concepts / Derivation Concepts) for clinical trial analysis specification, using the **CDISCPILOT01 Primary Analysis** as the working example.

The app allows users to:

1. Browse the AC/DC library (STCs, Methods, Templates, Phrases)
2. Build analysis specifications by composing smart phrases into sentences
3. Configure study-specific parameters (slice/fix dimensions)
4. Generate eSAP text, ADaM specifications, and executable code (SAS/R)
5. Visualize the derivation chain from SDTM → ADaM → Analysis
6. (If data provided) Execute the analysis and display results as a data cube

---

## Working Example: CDISCPILOT01 Primary Analysis

The app will demonstrate this specific analysis:

> "The primary analysis of the ADAS-Cog (11) at Week 24 will use the efficacy population with LOCF imputation for any missing values at Week 24. An ANCOVA model will be used with the baseline score, site, and treatment included as independent variables. Treatment will be included as a continuous variable, and results for a test of dose response will be produced."

### Key Features of This Analysis
- **Endpoint**: Change from baseline in ADAS-Cog(11) total score
- **Timepoint**: Week 24
- **Population**: Efficacy population
- **Imputation**: LOCF for missing values
- **Model**: ANCOVA with treatment as **continuous variable** (dose: 0, 54, 81 mg)
- **Primary Test**: Dose-response trend (β_dose ≠ 0)

### Treatment Dose Mapping
| Treatment Arm | TRT01PN (dose_mg) |
|---------------|-------------------|
| Placebo | 0 |
| Xanomeline Low Dose | 54 |
| Xanomeline High Dose | 81 |

---

## Domain Context: The Recipe Analogy

Think of the AC/DC Framework like cooking:

| Cooking Concept | AC/DC Component | What It Does |
|-----------------|-----------------|--------------|
| Recipe | **Template** | Defines the pattern, references ingredients by role |
| Ingredient type (e.g., "oil") | **Semantic Transformation Concept (STC)** | Abstract concept, not tied to specific data |
| Cooking method (e.g., "emulsify") | **Method** | Instructions using named roles |
| Pantry label | **Implementation Binding** | Maps concept to standard (ADaM, SDTM) |
| Actual product | **Physical Variable** | Column in actual dataset |
| Tonight's dish | **Study Instance** | Specific application with fixed context |

**Key insight**: A good recipe works in any kitchen. A good Template works with any data standard.

---

## Folder Structure

The app should work with the **existing** metadata in `examples/cdiscpilot01_primary_analysis/`. Do NOT regenerate these JSON files - they are already provided.

```
acdc-workbench/
├── app.py                          # Main Streamlit application
├── requirements.txt
├── README.md
├── assets/
│   └── cdisc-360i-logo.png         # CDISC branding
├── lib/
│   ├── __init__.py
│   ├── models.py                   # Pydantic models for all domain objects
│   ├── library.py                  # Load and query the metadata library
│   ├── sentence_builder.py         # Compose sentences from phrases
│   ├── esap_generator.py           # Generate eSAP text
│   ├── code_generator.py           # Generate SAS/R code from templates
│   └── derivation_visualizer.py    # Visualize SDTM → ADaM → Analysis chain
├── examples/
│   └── cdiscpilot01_primary_analysis/    # ← EXISTING - DO NOT REGENERATE
│       └── metadata/
│           ├── concepts/
│           │   └── semantic_transformation_concepts.json
│           ├── methods/
│           │   ├── derivation_methods.json
│           │   └── analysis_methods.json
│           ├── templates/
│           │   ├── ac/
│           │   │   └── cfb_ancova_dose_response.json
│           │   └── dc/
│           │       ├── baseline_derivation.json
│           │       ├── change_from_baseline.json
│           │       ├── locf_imputation.json
│           │       └── efficacy_flag.json
│           ├── instances/
│           │   ├── ac/
│           │   │   └── adas_cog_week24_dose_response.json
│           │   └── dc/
│           │       ├── adas_baseline.json
│           │       ├── adas_change.json
│           │       ├── adas_locf.json
│           │       └── efficacy_population.json
│           ├── phrases/
│           │   └── primary_analysis_phrases.json
│           └── mappings/
│               ├── sdtm_to_stc.json
│               └── stc_to_adam.json
└── tests/
    └── test_models.py
```

### Loading the Library

The library loader should read from the existing example folder:

```python
DEFAULT_EXAMPLE_PATH = "examples/cdiscpilot01_primary_analysis/metadata"

def load_library(base_path: str = DEFAULT_EXAMPLE_PATH) -> Library:
    """Load all metadata from the example folder."""
    # Load existing JSON files - do not generate new ones
    ...
```

---

## Core Domain Model

The domain model is defined by the **existing JSON files** in `examples/cdiscpilot01_primary_analysis/metadata/`. 

Claude Code should read these files to understand the exact structure. The key entity types are:

| Entity | Location | Purpose |
|--------|----------|---------|
| **STCs** | `concepts/semantic_transformation_concepts.json` | Abstract data concepts (observation + inference level) |
| **Methods** | `methods/derivation_methods.json`, `methods/analysis_methods.json` | Operations with named roles |
| **Templates** | `templates/ac/`, `templates/dc/` | Patterns binding STCs to method roles |
| **Instances** | `instances/ac/`, `instances/dc/` | Study-specific configurations |
| **Phrases** | `phrases/primary_analysis_phrases.json` | Smart phrases for sentence building |
| **Mappings** | `mappings/` | SDTM↔STC and STC↔ADaM bindings |

**Important**: Do not assume the JSON structure from this prompt. Read the actual files first, then create Pydantic models that match.

The app should visualize this derivation chain:

```
SDTM QS Domain (Source)
  │
  ├── QSTESTCD = 'ACTOT11' ──────→ PARAMCD (parameter)
  ├── QSSTRESN ───────────────────→ AVAL (analysis_value)
  └── VISITNUM = 3 (Baseline) ────→ BASE derivation context
         │
         ↓ [T_DC_Baseline]
         │
    baseline_value (BASE)
         │
         ↓ [T_DC_ChangeFromBaseline]
         │
    change_value (CHG = AVAL - BASE)
         │
         ↓ [T_DC_LOCF] (if missing at Week 24)
         │
    imputed change_value
         │
         ↓ [T_AC_ANCOVA_DoseResponse]
         │
    Analysis Output (slope, p-value, CI)
```

---

## Application Screens

### Screen 1: Library Browser
- **Tabs**: STCs | Methods | Templates (AC/DC) | Phrases | Mappings
- Search/filter functionality
- Click to view details with JSON preview
- Show relationships (which Templates use which Methods, which STCs)
- Highlight CDISCPILOT01 example components

### Screen 2: Derivation Chain Visualizer
- Interactive diagram showing SDTM → ADaM → Analysis flow
- Click nodes to see template/instance details
- Show data transformations at each step
- Color-code by template type (DC vs AC)

### Screen 3: Sentence Builder
- Start by selecting analysis type or browsing phrases
- Show available phrase slots with drag-drop or selection
- **Live preview** of assembled sentence
- Show which STCs and templates are implicitly selected
- Validation: highlight missing required phrases
- **Pre-load CDISCPILOT01 example** as default

### Screen 4: Study Configuration
- Based on assembled sentence, show configurable parameters:
  - **Slice**: parameter, visit/timepoint
  - **Filter**: population flags
  - **Method params**: alpha level, covariance structure
  - **Treatment coding**: continuous (dose) vs categorical
- Save/load configuration as JSON

### Screen 5: Output Generation
Four output tabs:

**eSAP Text:**
> "The primary analysis of the ADAS-Cog (11) at Week 24 will use the efficacy population with LOCF imputation for any missing values at Week 24. An ANCOVA model will be used with the baseline score, site, and treatment included as independent variables. Treatment will be included as a continuous variable, and results for a test of dose response will be produced."

**ADaM Specification:**
- Variable derivation rules for CHG, BASE, EFFFL
- Traceability to STCs and templates

**SAS Code:**
```sas
proc mixed data=adqsadas;
  where PARAMCD='ACTOT11' and AVISIT='Week 24' and EFFFL='Y';
  class SITEID;
  model CHG = BASE SITEID TRT01PN / solution cl;
  estimate 'Dose-Response Slope' TRT01PN 1 / cl;
run;
```

**R Code:**
```r
model <- lm(CHG ~ BASE + factor(SITEID) + TRT01PN,
            data = adqsadas %>%
              filter(PARAMCD == 'ACTOT11',
                     AVISIT == 'Week 24',
                     EFFFL == 'Y'))
summary(model)$coefficients['TRT01PN', ]
confint(model, 'TRT01PN')
```

### Screen 6: Execution (Optional/Advanced)
- Upload CSV data or connect to sample CDISCPILOT01 ADaM
- Execute the analysis
- Display results as data cube:

| Estimate | Value | Std Error | 95% CI | p-value |
|----------|-------|-----------|--------|---------|
| Dose-Response Slope (β_dose) | -0.024 | 0.008 | (-0.040, -0.008) | 0.003 |

---

## Technical Requirements

```
streamlit>=1.28
pydantic>=2.0
pandas>=2.0
graphviz>=0.20          # For derivation chain visualization
statsmodels>=0.14       # For optional execution
```

---

## Branding: CDISC 360i Color Palette

Use the official CDISC color palette throughout the application for a professional, branded look. Include the CDISC 360i logo in the sidebar header.

### Official CDISC Color Palette

```python
CDISC_COLORS = {
    # Core colors
    "dark_1": "#134678",         # Primary navy - headers, navigation, primary actions
    "light_1": "#FFFFFF",        # White - backgrounds, cards
    "dark_2": "#515349",         # Dark gray - secondary text, borders
    "light_2": "#F5F5F5",        # Light gray - page background, disabled states
    
    # Accent colors
    "accent_1": "#134678",       # Navy (same as dark_1) - primary accent
    "accent_2": "#A1D0CA",       # Teal/mint - success, observation-level STCs
    "accent_3": "#C94543",       # Red/coral - alerts, important actions, derivations
    "accent_4": "#EDAA00",       # Gold/yellow - warnings, inference-level STCs
    "accent_5": "#553278",       # Purple - special highlights, advanced features
    "accent_6": "#40B3E5",       # Light blue - info, secondary actions
    
    # Links
    "hyperlink": "#0563C1",      # Standard links
    "followed_link": "#954F72",  # Visited links
}
```

### Color Usage by Entity Type

| Entity | Color | Hex | Use For |
|--------|-------|-----|---------|
| **STCs (Observation)** | Teal | `#A1D0CA` | Cards, tags, badges |
| **STCs (Inference)** | Gold | `#EDAA00` | Cards, tags, badges |
| **Methods** | Navy | `#134678` | Headers, borders |
| **Templates (DC)** | Coral | `#C94543` | Derivation concept cards |
| **Templates (AC)** | Purple | `#553278` | Analysis concept cards |
| **Phrases** | Light Blue | `#40B3E5` | Selectable phrase chips |
| **Instances** | Teal | `#A1D0CA` | Study-specific items |
| **Mappings** | Dark Gray | `#515349` | Connection lines, secondary |

### Streamlit Custom CSS

Add this to your app for consistent CDISC branding:

```python
CDISC_CSS = """
<style>
/* Global font and background */
.main {
    background-color: #F5F5F5;
}

/* Headers */
h1, h2, h3 {
    color: #134678 !important;
    font-weight: 700;
}

/* Primary buttons */
.stButton > button[kind="primary"] {
    background-color: #134678;
    color: white;
    border: none;
    border-radius: 4px;
}
.stButton > button[kind="primary"]:hover {
    background-color: #0d3456;
}

/* Secondary/action buttons */
.stButton > button[kind="secondary"] {
    background-color: #C94543;
    color: white;
}

/* Tabs */
.stTabs [data-baseweb="tab-list"] {
    gap: 8px;
}
.stTabs [data-baseweb="tab"] {
    color: #515349;
    border-bottom: 2px solid transparent;
}
.stTabs [aria-selected="true"] {
    color: #134678;
    border-bottom: 2px solid #134678;
}

/* Cards/Expanders */
.stExpander {
    border: 1px solid #A1D0CA;
    border-radius: 8px;
}

/* Sidebar */
[data-testid="stSidebar"] {
    background-color: #134678;
}
[data-testid="stSidebar"] .stMarkdown {
    color: white;
}

/* Entity-specific badges */
.badge-stc-obs { background-color: #A1D0CA; color: #515349; }
.badge-stc-inf { background-color: #EDAA00; color: #515349; }
.badge-method { background-color: #134678; color: white; }
.badge-template-dc { background-color: #C94543; color: white; }
.badge-template-ac { background-color: #553278; color: white; }
.badge-phrase { background-color: #40B3E5; color: white; }
.badge-instance { background-color: #A1D0CA; color: #515349; }

/* Links */
a { color: #0563C1; }
a:visited { color: #954F72; }
</style>
"""

def apply_cdisc_branding():
    st.markdown(CDISC_CSS, unsafe_allow_html=True)
```

### Logo Placement

Place the CDISC 360i logo in the sidebar header:

```python
def render_sidebar():
    with st.sidebar:
        st.image("assets/cdisc-360i-logo.png", width=200)
        st.markdown("---")
        st.markdown("### AC/DC Framework Workbench")
        # ... navigation
```

### Assets Folder

```
assets/
├── cdisc-360i-logo.png          # Main logo (provided)
├── cdisc-360i-logo-white.png    # White version for dark backgrounds
└── favicon.ico                   # Browser tab icon
```

---

## Development Phases

### Phase 1: Foundation
1. Create Pydantic models for: STC, Method, Template, Instance, Phrase
2. Build library loader to read **existing** JSON files from `examples/cdiscpilot01_primary_analysis/metadata/`
3. Build library querying functions (search, filter, get by ID)
4. Unit tests for models and loading

### Phase 2: Library Browser
5. Streamlit UI with tabs for each entity type
6. Search and filter
7. Detail view with JSON display
8. Relationship visualization

### Phase 3: Derivation Chain
9. Build derivation chain data structure from loaded templates/instances
10. Graphviz/mermaid visualization
11. Interactive node selection

### Phase 4: Sentence Builder
12. Phrase selection UI
13. Live sentence preview
14. STC/Template inference from phrase selections
15. Pre-load CDISCPILOT01 example from existing phrases

### Phase 5: Configuration & Output
16. Study configuration form
17. eSAP text generation (assemble phrases)
18. Code generation (SAS, R) from templates
19. ADaM spec generation

### Phase 6: Polish
20. Download buttons for all outputs
21. Help/documentation
22. Sample data for execution demo

---

## Example Workflow

User explores the CDISCPILOT01 primary analysis:

1. **Library Browser**: View the STCs, see `change_value` → `baseline_value` relationship
2. **Derivation Chain**: See visual flow from QS domain through CHG derivation to ANCOVA
3. **Sentence Builder**: Phrases are pre-loaded; user sees how each phrase selects STCs/templates
4. **Modify**: User changes "at Week 24" to "at Week 8" → slice updates automatically
5. **Generate**: 
   - eSAP text updates with new timepoint
   - SAS/R code updates WHERE clause
   - ADaM spec unchanged (same derivation logic)
6. **Export**: Download all outputs as package

---

## Getting Started

The JSON metadata files already exist in `examples/cdiscpilot01_primary_analysis/metadata/`. Do NOT regenerate them.

After reading this prompt, please:

1. Create the project directory structure (`lib/`, `assets/`, `tests/`)
2. Create Pydantic models in `lib/models.py` that match the structure of the existing JSON files
3. Create `lib/library.py` to load and query the existing JSON files
4. Build a minimal Streamlit app that loads and displays the library
5. The app should work out of the box with the CDISCPILOT01 example

**Important**: Read the existing JSON files first to understand their exact structure before creating the Pydantic models. The models should match what's in the files.

Start with Phase 1 and we'll iterate from there.

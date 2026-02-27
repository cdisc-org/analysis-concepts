# AC/DC Framework Workbench

A Streamlit application demonstrating the AC/DC Framework (Analysis Concepts / Derivation Concepts) for clinical trial analysis specification.

## Features

1. **Library Browser** - Browse STCs, Methods, Templates, Phrases, and Mappings
2. **Derivation Chain** - Visualize SDTM → ADaM → Analysis data flow
3. **Sentence Builder** - Compose analysis sentences from smart phrases
4. **Study Configuration** - Configure slice parameters and model settings
5. **Output Generation** - Generate eSAP text, SAS code, and R code
6. **Execution** - Run analysis on uploaded data (optional)

## Quick Start

```bash
# Navigate to the example folder
cd examples/cdiscpilot01_primary_analysis

# Activate the virtual environment
source .venv/bin/activate

# Install dependencies (if not already installed)
pip install -r acdc-workbench/requirements.txt

# Run the app
streamlit run acdc-workbench/app.py
```

## Working Example

The application demonstrates the CDISCPILOT01 primary analysis:

> "The primary analysis of the ADAS-Cog (11) at Week 24 will use the efficacy population with LOCF imputation for any missing values at Week 24. An ANCOVA model will be used with the baseline score, site, and treatment included as independent variables. Treatment will be included as a continuous variable, and results for a test of dose response will be produced."

### Key Features

- **Endpoint**: Change from baseline in ADAS-Cog(11) total score
- **Timepoint**: Week 24
- **Population**: Efficacy population
- **Imputation**: LOCF for missing values
- **Model**: ANCOVA with treatment as continuous variable (dose: 0, 54, 81 mg)
- **Primary Test**: Dose-response trend

## Project Structure

```
acdc-workbench/
├── app.py                      # Main Streamlit application
├── requirements.txt            # Python dependencies
├── README.md
├── lib/
│   ├── __init__.py
│   ├── models.py               # Pydantic models
│   ├── library.py              # Library loader
│   ├── branding.py             # CDISC colors and CSS
│   ├── derivation_visualizer.py
│   ├── sentence_builder.py
│   ├── code_generator.py
│   └── esap_generator.py
├── assets/                     # Logo and branding assets
└── tests/
    └── test_models.py          # Unit tests
```

## Metadata Files

The application uses existing JSON metadata from `../metadata/`:

- `concepts/semantic_transformation_concepts.json` - 17 observation-level + 8 inference-level STCs
- `methods/derivation_methods.json` - 6 derivation methods
- `methods/analysis_methods.json` - 2 analysis methods (ancova, ancova_dose_response)
- `templates/dc/` - 4 DC templates (baseline, change, LOCF, efficacy)
- `templates/ac/` - 1 AC template (ANCOVA dose-response)
- `instances/dc/` - 4 DC instances
- `instances/ac/` - 1 AC instance
- `phrases/` - Smart phrases and sentences
- `mappings/` - SDTM↔STC and STC↔ADaM mappings

## Running Tests

```bash
cd examples/cdiscpilot01_primary_analysis
source .venv/bin/activate
python acdc-workbench/tests/test_models.py
```

## Dependencies

- streamlit>=1.28
- pydantic>=2.0
- pandas>=2.0
- graphviz>=0.20
- statsmodels>=0.14

## CDISC Branding

The application uses the official CDISC 360i color palette:

| Color | Hex | Use |
|-------|-----|-----|
| Navy | #134678 | Headers, primary actions |
| Teal | #A1D0CA | Observation STCs, instances |
| Coral | #C94543 | DC templates |
| Purple | #553278 | AC templates |
| Gold | #EDAA00 | Inference STCs |
| Light Blue | #40B3E5 | Phrases |

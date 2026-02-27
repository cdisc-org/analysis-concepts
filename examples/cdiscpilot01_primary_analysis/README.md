# CDISCPILOT01 Primary Analysis - AC/DC Framework Example

This example demonstrates the complete AC/DC Framework implementation for the CDISC Pilot Study (CDISCPILOT01) primary efficacy analysis.

## Analysis Description

> "The primary analysis of the ADAS-Cog (11) at Week 24 will use the efficacy population with LOCF imputation for any missing values at Week 24. An ANCOVA model will be used with the baseline score, site, and treatment included as independent variables. Treatment will be included as a continuous variable, and results for a test of dose response will be produced."

## Key Features

- **Endpoint**: Change from baseline in ADAS-Cog(11) total score
- **Timepoint**: Week 24
- **Population**: Efficacy population
- **Imputation**: LOCF for missing values
- **Model**: ANCOVA with treatment as **continuous variable** (dose: 0, 54, 81 mg)
- **Primary Test**: Dose-response trend

## Folder Structure

```
metadata/
├── concepts/
│   └── semantic_transformation_concepts.json    # STC definitions
├── methods/
│   ├── derivation_methods.json                  # Subtraction, Aggregation, etc.
│   └── analysis_methods.json                    # ANCOVA dose-response
├── templates/
│   ├── ac/
│   │   └── cfb_ancova_dose_response.json       # Analysis template
│   └── dc/
│       ├── baseline_derivation.json             # T_DC_Baseline
│       ├── change_from_baseline.json            # T_DC_ChangeFromBaseline
│       ├── locf_imputation.json                 # T_DC_LOCF
│       └── efficacy_flag.json                   # T_DC_EfficacyFlag
├── instances/
│   ├── ac/
│   │   └── adas_cog_week24_dose_response.json  # Study instance
│   └── dc/
│       ├── adas_baseline.json                   # S_DC_ADAS_Baseline
│       ├── adas_change.json                     # S_DC_ADAS_Change
│       ├── adas_locf.json                       # S_DC_ADAS_LOCF
│       └── efficacy_population.json             # S_DC_Efficacy
├── phrases/
│   └── primary_analysis_phrases.json            # Smart phrases & sentence
└── mappings/
    ├── sdtm_to_stc.json                         # SDTM → STC mappings
    └── stc_to_adam.json                         # STC → ADaM mappings
```

## Data Flow

### SDTM → ADaM Derivation Chain

```
SDTM QS Domain (Source)
  │
  ├── QSTESTCD = 'ACTOT11' ──────→ PARAMCD (parameter)
  ├── QSSTRESN ───────────────────→ AVAL (analysis_value)
  └── VISITNUM = 3 (Baseline) ───→ BASE derivation context
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

### Treatment Dose Mapping

| Treatment Arm | TRT01PN (dose_mg) |
|---------------|-------------------|
| Placebo | 0 |
| Xanomeline Low Dose | 54 |
| Xanomeline High Dose | 81 |

## Model Specification

### Wilkinson-Rogers Formula

```
CHG ~ BASE + SITEID + TRT01PN
```

Where:
- `CHG`: Change from baseline (dependent variable)
- `BASE`: Baseline value (continuous covariate)
- `SITEID`: Site (categorical fixed effect)
- `TRT01PN`: Treatment dose in mg (continuous predictor)

### Hypothesis Test

- **Null**: β_dose = 0 (no dose-response relationship)
- **Alternative**: β_dose ≠ 0 (dose-response exists)
- **Alpha**: 0.05

## Generated Code Examples

### SAS

```sas
proc mixed data=adqsadas;
  where PARAMCD='ACTOT11' and AVISIT='Week 24' and EFFFL='Y';
  class SITEID;
  model CHG = BASE SITEID TRT01PN / solution cl;
  estimate 'Dose-Response Slope' TRT01PN 1 / cl;
run;
```

### R

```r
model <- lm(CHG ~ BASE + factor(SITEID) + TRT01PN,
            data = adqsadas %>%
              filter(PARAMCD == 'ACTOT11',
                     AVISIT == 'Week 24',
                     EFFFL == 'Y'))

summary(model)$coefficients['TRT01PN', ]
confint(model, 'TRT01PN')
```

## Smart Phrase Composition

The analysis description is composed from these phrases:

| Order | Phrase ID | Text |
|-------|-----------|------|
| 1 | SP_CFB_ENDPOINT | "change from baseline" |
| 2 | SP_PARAMETER | "in ADAS-Cog(11)" |
| 3 | SP_TIMEPOINT | "at Week 24" |
| 4 | SP_POPULATION | "will use the efficacy population" |
| 5 | SP_IMPUTATION | "with LOCF imputation for any missing values at Week 24" |
| 6 | SP_ANCOVA_METHOD | "An ANCOVA model will be used" |
| 7 | SP_BASELINE_COV | "with the baseline score included as a covariate" |
| 8 | SP_SITE_FACTOR | "site included as a fixed effect" |
| 9 | SP_TRT_CONTINUOUS | "treatment included as a continuous variable" |
| 10 | SP_DOSE_RESPONSE | "results for a test of dose response will be produced" |

## References

- CDISC Pilot Study: https://github.com/cdisc-org/sdtm-adam-pilot-project
- AC/DC Framework: ACDC_Methods_Templates_DEL_v6.md
- CSTM: CSTM_Draft_v5.md

## Version

- Example Version: 1.0.0
- AC/DC Framework: Draft v0.3
- CSTM: Draft v0.5

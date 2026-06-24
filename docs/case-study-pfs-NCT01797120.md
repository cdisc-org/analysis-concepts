# Case Study — Progression-Free Survival (PFS) for NCT01797120 (PrE0102)

**Status:** Analysis / design overview
**Date:** 2026-06-24
**Scope:** Assess whether the AC/DC concept-model framework can express the **primary PFS endpoint** of study NCT01797120, and specify the full transformation chain (derivation + analysis) required to do so.

**Primary sources:**
- **Test data (SDTM/ADaM):** cdisc-org/360i — <https://github.com/cdisc-org/360i/tree/main/data/protocol/NCT01797120/test_data> (per-file links in §3)
- **Registry:** ClinicalTrials.gov NCT01797120 — <https://clinicaltrials.gov/study/NCT01797120> (API v2: `https://clinicaltrials.gov/api/v2/studies/NCT01797120`)
- **SAP:** PrE0102 Statistical Analysis Plan, Final 24 Mar 2014 (`SAP_NCT01797120.pdf`, local)

---

## 1. Study & endpoint context

| Attribute | Value | Source |
|---|---|---|
| Study | **PrE0102** — Fulvestrant +/- Everolimus, HR+/HER2– metastatic breast cancer resistant to AI therapy | SAP §3.1; ClinicalTrials.gov |
| NCT | NCT01797120 | registry |
| Design | Randomized, double-blind (quadruple-masked incl. outcomes assessor), parallel, Phase II, 1:1, n≈131 | SAP §4.1; registry |
| Arms | A: Fulvestrant + Everolimus · B: Fulvestrant + Placebo | SAP §4.1 |
| **Primary objective** | **Progression-free survival** (A vs B) | SAP §3.1 |
| Response assessment | RECIST 1.1; tumor measurements every 12 weeks (±1 wk) | SAP §4.3, §5.1 |

**Primary endpoint definition (SAP §5.3, §7.7.2):**

> **PFS = time from randomization to documented disease progression or death, whichever occurs first. A subject who has neither progressed nor died is censored at the date of last tumor assessment.**

**Primary analysis (SAP §7.7.2):** Kaplan-Meier — **median PFS + 90% CI per arm**, plus KM survival curves. If medians are not reached, report **2-year (landmark) PFS** with 90% CI. Sensitivity analysis repeats on the ITT (as-randomized) population.

> Note: the SAP's *primary* analysis is **descriptive Kaplan-Meier** (median + 90% CI), **not** a log-rank / Cox hypothesis test. Log-rank and Cox are available in the library and listed here as **optional secondary** analyses only.

---

## 2. Sufficiency assessment summary

| # | Question | Verdict |
|---|---|---|
| 1 | Is the SDTM data sufficient to derive the primary endpoint? | ✅ **Yes** — anchor, progression, death, and censor dates are all present. Only TU/full-TR are absent, which blocks *re-deriving* RECIST response, not *consuming* it. |
| 2 | Which derivation transformations do we need? | A 8-step chain (§5). The atomic **methods all exist**; the **transformations must be authored**. |
| 3 | Do we have sufficient methods (derivation + analysis)? | ✅ **Yes** — `M.KaplanMeier` for analysis; `M.RecordSelection`, `M.Minimum`, `M.Maximum`, `M.ConditionalValue`, `M.Categorization`, `M.DateDifference` for derivation. |
| 4 | Do we have sufficient concepts? | ✅ Output concepts complete. ⚠️ One gap: no first-class **censoring indicator** concept (currently overloads generic `Flag`). "Progression" correctly stays a collected BC value, not a concept. |

---

## 3. SDTM data — what we have and what we lack

**Source:** cdisc-org/360i — synthetic test data for NCT01797120.
Directory: <https://github.com/cdisc-org/360i/tree/main/data/protocol/NCT01797120/test_data>
Raw file base: `https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/<file>`

**Present in test data:** `DM`, `RS`, `DS`, `EX`, `TA`, `TV` (+ ADaM `ADSL`, `ADTTE`). All files are CSV.

| File | Layer / domain | Link |
|---|---|---|
| `DM.csv` | SDTM Demographics (anchor, death) | [DM.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/DM.csv) |
| `RS.csv` | SDTM Disease Response (RECIST overall response) | [RS.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/RS.csv) |
| `DS.csv` | SDTM Disposition (progression / death corroboration) | [DS.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/DS.csv) |
| `TR.csv` | SDTM Tumor Results (thin: `DIAM` + `ABLFL` only) | [TR.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/TR.csv) |
| `EX.csv` | SDTM Exposure | [EX.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/EX.csv) |
| `TA.csv` | SDTM Trial Arms (trial design) | [TA.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/TA.csv) |
| `TV.csv` | SDTM Trial Visits (trial design) | [TV.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/TV.csv) |
| `ADSL.csv` | ADaM Subject-Level | [ADSL.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/ADSL.csv) |
| `ADTTE.csv` | ADaM Time-to-Event (**pre-derived PFS — validation oracle**) | [ADTTE.csv](https://raw.githubusercontent.com/cdisc-org/360i/main/data/protocol/NCT01797120/test_data/ADTTE.csv) |

| PFS component | Source | Status |
|---|---|---|
| Anchor: randomization date | `DM.RFSTDTC` / `ADSL` (RANDDT) | ✅ |
| Event 1: progression (RECIST PD) | `RS.RSSTRESC = "PD"` @ `RS.RSDTC` (corroborated `DS.DSDECOD="PROGRESSIVE DISEASE"`) | ✅ |
| Event 2: death | `DM.DTHFL="Y"` / `DM.DTHDTC` (corroborated `DS.DSDECOD="DEATH"`) | ✅ |
| Censor: last tumor assessment | max `RS.RSDTC` per subject | ✅ |
| Validation oracle | `ADTTE` (`PARAMCD=PFS`, `AVAL`, `CNSR`) | ✅ |

**Domains we lack, and why it does not block the primary endpoint:**

| Missing | Needed for | Impact |
|---|---|---|
| **TU** (Tumor Identification) | Enumerating target/non-target/new lesions | ⚠️ Can't re-derive RECIST response — **not required to *produce* the endpoint** (blocks independent QC of the adjudication only); `RS.OVRLRESP` carries the adjudicated overall response (blinded assessor). |
| **TR thin** (`DIAM` + `ABLFL` only; no `TRLNKID`/`TRORRES`) | Sum-of-diameters / nadir → mechanistic PD | ⚠️ Same: blocks re-derivation/QC, not the endpoint. Mitigated via `RS`. |
| `SV`, `AE`, `CM`, `LB`, `VS` | Visit structure, safety/secondary endpoints | ❌ Not needed for the PFS primary. |

**Conclusion:** PFS needs a *progression event with a date*, not the lesion math behind it. Data is sufficient **for Scope A** (§3.1).

### 3.1 Two "end-to-end" scopes — where the chain starts

"End-to-end derivation of the endpoint" can mean two different things depending on where the chain's **source boundary** sits. Both derive the endpoint from SDTM (neither merely reads `ADTTE`); they differ only in the *prefix* of the chain.

| Scope | Source boundary | Chain | Re-derive RECIST response? | Supported by current data? |
|---|---|---|---|---|
| **A — endpoint chain** *(headline demo)* | `RS.OVRLRESP=PD` (+ death, dates) | D1–D8 → A1 (§5–6) | ❌ No — "first PD" is consumed from `RS` | ✅ **Yes, fully**; validates against `ADTTE` |
| **B — clinical chain** *(optional deep extension)* | `TR`/`TU` lesion measurements | RECIST response sub-chain **→ then** D1–D8 → A1 | ✅ **Yes** — lesion sums → nadir → ≥20 % + ≥5 mm → non-target/new → timepoint → best overall response → PD | ❌ **No** — `TU` absent, `TR` minimal |

**Key point:** Scope B does not add endpoint logic — it **prepends a RECIST response-determination sub-chain** that produces one of the endpoint's inputs (the `PD` value that Scope A reads off `RS`). So re-deriving RECIST is *required for Scope B only*, and is a **choice about demo depth**, not a requirement of the endpoint.

**Design tension to settle before committing to Scope B** — this is not just a data gap:
- Per `project_parameter_is_bc_identifier`, overall response is **collected/adjudicated BC data** the AC layer *consumes* → RECIST derivation belongs **upstream** (data collection / adjudication), not in the analysis-concept model.
- But the SAP **Appendices 3–5** specify response as explicit algorithms (disease evaluation, response criteria, best overall response) → one *could* model timepoint-response and best-overall-response as AC derivations, exercising `M.Maximum` (nadir), `M.PercentChange`, `M.ThresholdCompare`, `M.Categorization`. A powerful showcase, but a deliberate extension of where the standard draws the line.

**Recommendation:** ship **Scope A as the headline** (defensible, fully supported, `ADTTE`-validated); treat **Scope B as an optional deep extension** gated on (a) richer test data with `TU` + lesion-linked `TR`, and (b) a decision to model RECIST in the AC layer. A separate sufficiency assessment of the Scope B sub-chain (methods / concepts / data) is the next step if pursued.

---

## 4. Library coverage — methods & concepts

### Methods (all present)

| Role | Method | Signature |
|---|---|---|
| **Analysis (primary)** | `M.KaplanMeier` | `(time, event, fixed_effect)` → `median_survival`, `survival_table`, `event_summary`, `landmark_estimates` |
| Analysis (optional) | `M.LogRankTest` | `(time, event, fixed_effect, strata)` → `chi_squared_test_result` |
| Analysis (optional) | `M.CoxPH` | `(time, event, covariate, fixed_effect, strata)` → `hazard_ratio_estimates`, … |
| Derivation | `M.RecordSelection` | `(value, partition, time_order)` → `flag` |
| Derivation | `M.Minimum` / `M.Maximum` | `(value, group)` → `result` |
| Derivation | `M.ConditionalValue` | `(value, alternate)` → `result` |
| Derivation | `M.Categorization` | `(value)` → `result` |
| Derivation | `M.DateDifference` | `(start_date, end_date)` → `result` (config `unit ∈ {days,weeks,months,years}`) |

### Concepts

| Concept | Status | Notes |
|---|---|---|
| `TimeToEvent` (AVAL input measure) | ✅ | Produced by SmartPhrase `SP_TTE_ENDPOINT`; consumed as `time` in `T.OS_LogRank`. |
| `MedianSurvival`, `SurvivalTable`, `EventSummary` | ✅ | Defined in `resultPatterns`; mapped from KM outputs via `methodOutputSlotMapping["M.KaplanMeier"]`. |
| `Median`, `SurvivalProb`, `ConfidenceInterval`, `NRisk/NEvent/NCensored` | ✅ | `sharedStatisticsVocabulary`. |
| `HazardRatio` / `HazardRatioEstimates` | ✅ | For optional Cox. |
| **Date measures** (`AnchorDate`, `ProgressionDate`, `DeathDate`, `EventDate`, `CensorDate`, `EndpointDate`) | ⚠️ **new** | Modeled below as `Measure` with `requiredValueType: dateTime`; promote to named concepts if desired. |
| **`CensoringIndicator`** | ⚠️ **new (optional)** | Currently overloaded onto generic boolean `Flag`. A dedicated concept would mirror ADaM `CNSR`. |
| "Progression" | ✅ correctly absent | Collected BC value (`RS.OVRLRESP=PD`), not a concept-model concept. |

---

## 5. Derivation chain (SDTM → analysis-ready `(time, event)`)

The chain produces one row per subject carrying `TimeToEvent` (AVAL) and `CensoringIndicator` (CNSR), the two inputs `M.KaplanMeier` consumes.

### 5.1 Dependency graph

```
DM.RFSTDTC ───────────────► [D1] T.PFS_AnchorDate ──────────► AnchorDate ─────────────┐
                                                                                        │
RS (OVRLRESP=PD, RSDTC) ──► [D2] T.PFS_ProgressionDate ─► ProgressionDate ─┐            │
DM.DTHDTC / DS DEATH ─────► [D3] T.PFS_DeathDate ───────► DeathDate ───────┤            │
                                                                           ▼            │
                                              [D5] T.PFS_EventDate (min) ─► EventDate    │
                                                          │  └─► EventOccurred (flag)    │
RS.RSDTC (all visits) ────► [D4] T.PFS_LastAssessmentDate ─► CensorDate ───┐  │          │
                                                                           ▼  ▼          │
                                       [D6] T.PFS_EndpointDate (cond.) ─► EndpointDate ──┤
                                       [D7] T.PFS_CensorFlag (cat.) ────► CensoringIndicator
                                                                                        ▼
                                          [D8] T.PFS_TimeToEvent (date diff) ─► TimeToEvent
                                                                                        │
                            ┌───────────────────────────────────────────────────────────┘
                            ▼
              [A1] T.PFS_KaplanMeier  →  MedianSurvival + SurvivalTable + EventSummary   (PRIMARY)
              [A2] T.PFS_LogRank      →  TestResult                                      (optional)
              [A3] T.PFS_CoxPH        →  HazardRatioEstimates                            (optional)
```

**Execution order** (post-order, leaves first — per the derivationChain sort rule): D1, D2, D3, D4 → D5 → D7 (needs EventOccurred), D6 (needs EventDate, CensorDate, flag) → D8 → A1/A2/A3.

### 5.2 Transformation specifications

> Schema mirrors existing `T.BaselineSelection` (derivation) and `T.OS_LogRank` (analysis). Date measures use `concept: "Measure"`, `requiredValueType: "dateTime"` pending promotion to named date concepts.

#### D1 — `T.PFS_AnchorDate` (derivation)
Select the randomization date per subject (the time-zero anchor).
```json
{
  "conceptId": "T.PFS_AnchorDate",
  "label": "PFS Anchor Date (Randomization)",
  "shortLabel": "PFS Anchor",
  "transformationType": "derivation",
  "description": "Select the randomization date per subject as the PFS time-zero anchor.",
  "usesMethod": "M.RecordSelection",
  "methodConfigurations": [
    { "configurationName": "selection_rule", "value": "first_non_missing" },
    { "configurationName": "reference_event", "value": "randomization" },
    { "configurationName": "cardinality", "value": "single" }
  ],
  "inputDataStructure": {
    "dimensions": [ { "input": "partition", "concept": "Subject" } ],
    "measures": [ { "input": "value", "concept": "Measure", "requiredValueType": "dateTime",
                    "description": "Randomization date (DM.RFSTDTC / ADSL randomization date)." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Measure", "requiredValueType": "dateTime" } ]
  }
}
```

#### D2 — `T.PFS_ProgressionDate` (derivation)
First RECIST progression date per subject.
```json
{
  "conceptId": "T.PFS_ProgressionDate",
  "label": "PFS First Progression Date",
  "shortLabel": "First PD",
  "transformationType": "derivation",
  "description": "Select the earliest RECIST overall-response = PD assessment per subject; output its assessment date.",
  "usesMethod": "M.RecordSelection",
  "methodConfigurations": [
    { "configurationName": "selection_rule", "value": "first_occurrence" },
    { "configurationName": "target_value", "value": "PD" },
    { "configurationName": "cardinality", "value": "single" }
  ],
  "inputDataStructure": {
    "dimensions": [
      { "input": "partition", "concept": "Subject" },
      { "input": "time_order", "concept": "Measure", "requiredValueType": "dateTime",
        "description": "Assessment date RS.RSDTC, ascending." }
    ],
    "measures": [ { "input": "value", "concept": "Measure", "requiredValueType": null,
                    "description": "RECIST overall response (RS.OVRLRESP); filter to PD." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Measure", "requiredValueType": "dateTime",
                    "description": "Date of first PD; null if no progression." } ]
  }
}
```

#### D3 — `T.PFS_DeathDate` (derivation)
Death date per subject.
```json
{
  "conceptId": "T.PFS_DeathDate",
  "label": "PFS Death Date",
  "shortLabel": "Death Date",
  "transformationType": "derivation",
  "description": "Select the death date per subject (DM.DTHDTC where DTHFL=Y; corroborated by DS DEATH).",
  "usesMethod": "M.RecordSelection",
  "methodConfigurations": [
    { "configurationName": "selection_rule", "value": "first_non_missing" },
    { "configurationName": "target_value", "value": "DEATH" },
    { "configurationName": "cardinality", "value": "single" }
  ],
  "inputDataStructure": {
    "dimensions": [ { "input": "partition", "concept": "Subject" } ],
    "measures": [ { "input": "value", "concept": "Measure", "requiredValueType": "dateTime",
                    "description": "Death date DM.DTHDTC; null if alive." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Measure", "requiredValueType": "dateTime" } ]
  }
}
```

#### D4 — `T.PFS_LastAssessmentDate` (derivation)
Last tumor assessment date per subject (the censor date).
```json
{
  "conceptId": "T.PFS_LastAssessmentDate",
  "label": "PFS Last Tumor Assessment Date",
  "shortLabel": "Last Assessment",
  "transformationType": "derivation",
  "description": "Maximum RECIST assessment date (RS.RSDTC) per subject — the censoring date when no event occurs.",
  "usesMethod": "M.Maximum",
  "methodConfigurations": [],
  "inputDataStructure": {
    "dimensions": [ { "input": "group", "concept": "Subject" } ],
    "measures": [ { "input": "value", "concept": "Measure", "requiredValueType": "dateTime",
                    "description": "All RS.RSDTC assessment dates." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Measure", "requiredValueType": "dateTime" } ]
  }
}
```

#### D5 — `T.PFS_EventDate` (derivation)
Earliest of (progression, death) — the event date — plus an event-occurred flag.
```json
{
  "conceptId": "T.PFS_EventDate",
  "label": "PFS Event Date (earliest of progression or death)",
  "shortLabel": "PFS Event Date",
  "transformationType": "derivation",
  "description": "Row-wise earliest of ProgressionDate and DeathDate per subject. Also emits EventOccurred = at least one candidate present.",
  "usesMethod": "M.Minimum",
  "methodConfigurations": [],
  "inputDataStructure": {
    "dimensions": [ { "input": "group", "concept": "Subject" } ],
    "measures": [ { "input": "value", "concept": "Measure", "requiredValueType": "dateTime",
                    "description": "Stacked candidate dates {ProgressionDate (D2), DeathDate (D3)} per subject." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [
      { "output": "result", "concept": "Measure", "requiredValueType": "dateTime",
        "description": "Earliest event date; null if neither occurred." },
      { "output": "flag", "concept": "Flag", "requiredValueType": "boolean",
        "description": "EventOccurred — true if any candidate date present." }
    ]
  }
}
```

> **Modeling note:** `M.Minimum` is typed `(value, group)`. The "row-wise earliest of two columns" is achieved by **stacking** D2 and D3 outputs as two records in a Subject partition and taking the minimum. This is the one place the chain leans on composition rather than a dedicated "min-across-columns" primitive — see Gap #2 in §7.

#### D6 — `T.PFS_EndpointDate` (derivation)
Choose the endpoint date: event date if an event occurred, else the censor date.
```json
{
  "conceptId": "T.PFS_EndpointDate",
  "label": "PFS Endpoint Date (event or censor)",
  "shortLabel": "PFS End Date",
  "transformationType": "derivation",
  "description": "If EventOccurred, use EventDate (D5); otherwise use LastAssessmentDate (D4).",
  "usesMethod": "M.ConditionalValue",
  "methodConfigurations": [
    { "configurationName": "base", "value": "EventOccurred" }
  ],
  "inputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [
      { "input": "value", "concept": "Measure", "requiredValueType": "dateTime", "slice": "event",
        "description": "EventDate (used when EventOccurred = true)." },
      { "input": "alternate", "concept": "Measure", "requiredValueType": "dateTime", "slice": "censor",
        "description": "LastAssessmentDate (used when EventOccurred = false)." }
    ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Measure", "requiredValueType": "dateTime" } ]
  }
}
```

#### D7 — `T.PFS_CensorFlag` (derivation)
Derive the censoring indicator (CDISC ADaM convention: `CNSR` = 0 event, 1 censored).
```json
{
  "conceptId": "T.PFS_CensorFlag",
  "label": "PFS Censoring Indicator",
  "shortLabel": "PFS CNSR",
  "transformationType": "derivation",
  "description": "Map EventOccurred to the analysis event flag. M.KaplanMeier expects event=true for an event; emit CNSR (0=event,1=censored) for ADaM alignment.",
  "usesMethod": "M.Categorization",
  "methodConfigurations": [
    { "configurationName": "conditions", "value": ["EventOccurred == true", "EventOccurred == false"] },
    { "configurationName": "categories", "value": [ {"event": true, "CNSR": 0}, {"event": false, "CNSR": 1} ] },
    { "configurationName": "default_category", "value": {"event": false, "CNSR": 1} }
  ],
  "inputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "input": "value", "concept": "Flag", "requiredValueType": "boolean",
                    "description": "EventOccurred from D5." } ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "Flag", "requiredValueType": "boolean",
                    "description": "Event indicator for M.KaplanMeier (true = event). CNSR carried as ADaM-facing qualifier." } ]
  }
}
```

#### D8 — `T.PFS_TimeToEvent` (derivation)
Compute AVAL = endpoint date − anchor date.
```json
{
  "conceptId": "T.PFS_TimeToEvent",
  "label": "PFS Time-to-Event",
  "shortLabel": "PFS AVAL",
  "transformationType": "derivation",
  "description": "PFS time = EndpointDate (D6) - AnchorDate (D1). Reported in months per SAP convention.",
  "usesMethod": "M.DateDifference",
  "methodConfigurations": [ { "configurationName": "unit", "value": "months" } ],
  "inputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [
      { "input": "start_date", "concept": "Measure", "requiredValueType": "dateTime",
        "description": "AnchorDate (randomization)." },
      { "input": "end_date", "concept": "Measure", "requiredValueType": "dateTime",
        "description": "EndpointDate (event or censor)." }
    ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Subject" } ],
    "measures": [ { "output": "result", "concept": "TimeToEvent", "requiredValueType": "Quantity" } ]
  }
}
```

---

## 6. Analysis transformations

### A1 — `T.PFS_KaplanMeier` (analysis) — **PRIMARY**
Modeled directly on `T.OS_LogRank` (same `TimeToEvent` + `Flag` input structure), swapping the method to `M.KaplanMeier`.
```json
{
  "conceptId": "T.PFS_KaplanMeier",
  "label": "Progression-Free Survival Kaplan-Meier",
  "shortLabel": "PFS KM",
  "transformationType": "analysis",
  "description": "Estimate PFS by treatment arm using Kaplan-Meier: median PFS + 90% CI per arm and KM curves; 2-year landmark estimate when median not reached.",
  "usesMethod": "M.KaplanMeier",
  "methodConfigurations": [
    { "configurationName": "conf_type", "value": "log-log" }
  ],
  "inputDataStructure": {
    "dimensions": [
      { "input": "fixed_effect", "concept": "Treatment" },
      { "concept": "Subject" },
      { "concept": "Population" }
    ],
    "measures": [
      { "input": "time", "concept": "TimeToEvent", "requiredValueType": "Quantity", "slice": "endpoint" },
      { "input": "event", "concept": "Flag", "requiredValueType": "boolean", "slice": "endpoint" }
    ],
    "slices": [
      { "name": "endpoint", "description": "Subjects in the chosen population.",
        "constraints": [ { "dimension": "Population", "value": "{population}" } ] }
    ]
  },
  "outputDataStructure": {
    "dimensions": [ { "concept": "Treatment" }, { "concept": "Population" } ],
    "measures": [
      { "output": "median_survival", "concept": "MedianSurvival" },
      { "output": "survival_table", "concept": "SurvivalTable" },
      { "output": "event_summary", "concept": "EventSummary" },
      { "output": "landmark_estimates", "concept": "SurvivalProb",
        "description": "2-year landmark PFS when median not reached." }
    ]
  },
  "sliceKeys": [ { "dimension": "Population", "source": "population" } ],
  "validSmartPhrases": [ "SP_TTE_ENDPOINT", "SP_POPULATION", "SP_GROUPING", "SP_METHOD_KM", "SP_CONFIDENCE_LEVEL" ]
}
```

### A2 — `T.PFS_LogRank` (analysis) — *optional secondary*
Identical to `T.OS_LogRank` but binds the PFS `TimeToEvent`. (Reuse `T.OS_LogRank`'s body verbatim, change `conceptId`/`label` and point `time` at the PFS endpoint slice.)

### A3 — `T.PFS_CoxPH` (analysis) — *optional secondary*
`usesMethod: "M.CoxPH"`, same `(time, event, fixed_effect=Treatment)` input; output `hazard_ratio_estimates → HazardRatioEstimates`. Use for the HR(A vs B) with 90% CI if required for publication.

---

## 7. Build checklist & gaps

**Author 8 derivation transformations** (D1–D8) + **1 primary analysis transformation** (A1). A2/A3 are optional secondary.

| Item | Type | Method (exists?) | Transformation status |
|---|---|---|---|
| D1 `T.PFS_AnchorDate` | derivation | `M.RecordSelection` ✅ | ❌ author |
| D2 `T.PFS_ProgressionDate` | derivation | `M.RecordSelection` ✅ | ❌ author |
| D3 `T.PFS_DeathDate` | derivation | `M.RecordSelection` ✅ | ❌ author |
| D4 `T.PFS_LastAssessmentDate` | derivation | `M.Maximum` ✅ | ❌ author |
| D5 `T.PFS_EventDate` | derivation | `M.Minimum` ✅ | ❌ author |
| D6 `T.PFS_EndpointDate` | derivation | `M.ConditionalValue` ✅ | ❌ author |
| D7 `T.PFS_CensorFlag` | derivation | `M.Categorization` ✅ | ❌ author |
| D8 `T.PFS_TimeToEvent` | derivation | `M.DateDifference` ✅ | ❌ author |
| A1 `T.PFS_KaplanMeier` | analysis | `M.KaplanMeier` ✅ | ❌ author (template off `T.OS_LogRank`) |
| A2 `T.PFS_LogRank` | analysis (opt.) | `M.LogRankTest` ✅ | ❌ author (clone `T.OS_LogRank`) |
| A3 `T.PFS_CoxPH` | analysis (opt.) | `M.CoxPH` ✅ | ❌ author |

**Open modeling decisions / gaps:**

1. **Date concepts.** D1–D6 traffic in `dateTime` measures modeled as generic `Measure`. Decide whether to promote named concepts (`AnchorDate`, `ProgressionDate`, `EventDate`, `CensorDate`, `EndpointDate`) for clarity, or keep them generic.
2. **`M.Minimum` over columns (D5).** Earliest-of-two-dates relies on stacking candidates and grouping by Subject. A dedicated row-wise "earliest event" primitive (or a composite `T.PFS_EventDate` that hides the stacking) would be cleaner. No new *method* is strictly required.
3. **Censoring indicator concept.** D7 emits a boolean `Flag`; consider a first-class `CensoringIndicator` concept aligned to ADaM `CNSR` (0=event, 1=censored).
4. **90% CI level.** `M.KaplanMeier` currently exposes only `conf_type`, not a confidence *level* config. The SAP requires **90%** CIs — confirm where the level is set (statistic-set / output level) or add a `conf_level`/`alpha` configuration to `M.KaplanMeier`.
5. **RECIST response — consumed (Scope A) vs. derived (Scope B).** The headline chain (Scope A, §3.1) consumes `RS.OVRLRESP` as the adjudicated input — acceptable for PFS (PD triggers the event) and consistent with the blinded-assessor design. Showing the **full lesion-to-curve chain (Scope B)** requires re-deriving the RECIST response, which is **blocked by the current data** (TU absent, TR minimal) **and** is a modeling decision (does RECIST belong in the AC layer, or upstream as collected BC data?). Decide Scope A-only vs. A+B before sizing further work; a separate Scope B sufficiency assessment is the prerequisite for the deep demo.

**Validation:** the test data ships `ADTTE` (`PARAMCD=PFS`, `AVAL`, `CNSR`) — use it as the oracle to verify D8 (`AVAL`) and D7 (`CNSR`) outputs.

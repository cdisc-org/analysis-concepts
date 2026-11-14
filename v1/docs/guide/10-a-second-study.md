# 10. A second study

[Guide index](README.md) · Previous: [9. Estimands](09-estimands.md) · Next: [11. Other CDISC standards](11-other-standards.md)

**You will learn** nothing new. This chapter applies everything from chapters 3
to 9 to a different kind of analysis, so that you can see what carries over and
what changes. It also introduces the last feature: tying the description to
the text of a real SAP.

## The study

PrE0102: fulvestrant plus everolimus against fulvestrant plus placebo in
metastatic breast cancer. The endpoints are times to an event:
progression-free survival (PFS), overall survival (OS) and time to progression
(TTP). The analyses are descriptive Kaplan-Meier summaries.

Unlike the CDISC Pilot example, this one is built from a real statistical
analysis plan, and quotes it.

## In the documents you know

### The SAP

Section 7.7.2 of the plan says:

> Median time and 90% confidence interval for PFS, TTP, and OS will be
> summarized for all eligible, treated subjects by treatment arm using
> Kaplan-Meier estimates.

### The table shell (illustrative)

```
Table 14.2.x   Progression-Free Survival: Kaplan-Meier Summary
               Eligible, Treated Subjects

                                  Fulvestrant +     Fulvestrant +
                                  Everolimus        Placebo
                                  (N=xx)            (N=xx)
--------------------------------------------------------------------
Number of subjects with event     xx                xx
Number censored                   xx                xx

Median PFS (months)               xx.x              xx.x
  90% CI                          (xx.x, xx.x)      (xx.x, xx.x)
--------------------------------------------------------------------
```

### The analysis dataset (made-up values)

`ADTTE`, one record per subject and parameter.

| USUBJID | PARAMCD | AVAL | CNSR | TRTP | EFFIFL | ITTFL |
| --- | --- | --- | --- | --- | --- | --- |
| 0102-001 | PFS | 214 | 0 | Fulvestrant + Everolimus | Y | Y |
| 0102-001 | OS | 611 | 1 | Fulvestrant + Everolimus | Y | Y |
| 0102-002 | PFS | 97 | 0 | Fulvestrant + Placebo | Y | Y |
| 0102-002 | OS | 402 | 0 | Fulvestrant + Placebo | Y | Y |

## Layer by layer

Work through the layers in the order of the guide. For each, ask: what would I
expect, and what is actually there?

### Method (chapter 3)

`M.KaplanMeier`. Three inputs and four outputs.

| Role | Kind | | Sub-method | Statistics |
| --- | --- | --- | --- | --- |
| `time` | continuous | | `SM.KaplanMeier.MedianSurvival` | estimate, CI_lower, CI_upper |
| `event` | categorical | | `SM.KaplanMeier.EventSummary` | n_risk, n_event, n_censored |
| `fixed_effect` | categorical, optional | | `SM.KaplanMeier.SurvivalTable` | estimate, SE, CI_lower, CI_upper, n_risk, n_event, n_censored |
| | | | `SM.KaplanMeier.LandmarkEstimates` | estimate, SE, CI_lower, CI_upper |

This answers the question at the end of chapter 3: the "Median (90% CI)" rows
of the shell come from `SM.KaplanMeier.MedianSurvival`, and the event and
censoring counts from `SM.KaplanMeier.EventSummary`.

### Concepts (chapter 4)

| Concept | Role | Axis | New? |
| --- | --- | --- | --- |
| `C.Subject`, `C.Treatment`, `C.Population` | | dimension | No, same as before |
| `C.Event` | collected | dimension | Yes: which event (replaces "which parameter") |
| `C.TimeToEvent` | derived | measure | Yes |
| `C.Flag` | derived | measure | Yes: the event indicator |
| `C.MedianSurvival`, `C.EventSummary`, `C.SurvivalTable`, `C.LandmarkEstimates` | analysis | measure | Yes |

### Transformation (chapter 5)

`T.PFS_KaplanMeier`.

| Method role | Bound to | Slice |
| --- | --- | --- |
| `time` | `C.TimeToEvent` | `endpoint` |
| `event` | `C.Flag` | `endpoint` |
| `fixed_effect` | `C.Treatment` | |

The `endpoint` slice fixes the event and the population. So the template has
two placeholders, `{event}` and `{population}`. There is no visit and no
baseline: a time-to-event analysis has neither.

### Data bindings (chapter 6)

This is where the "AVAL problem" of chapter 6 earns its keep. In `ADTTE`,
`AVAL` is a time to event. The library marks that as parameter-dependent, and
the study settles it:

```json
{
  "id": "PRE0102.EVENT.PFS.TimeToEvent",
  "concept": "C.TimeToEvent",
  "studyConcept": "EVENT.PFS",
  "level": "valueLevel",
  "locator": { "locatorType": "tabular", "dataset": "ADTTE", "variable": "AVAL" },
  "conditions": [ { "variable": "PARAMCD", "comparator": "EQ", "values": ["PFS"] } ]
}
```

`CNSR` is bound to `C.Flag` in the same way, with a note that 0 is an event
and 1 is censored.

### The study (chapter 7)

Study concepts:

| Study concept | Kind | Found by |
| --- | --- | --- |
| `EVENT.PFS`, `EVENT.OS`, `EVENT.TTP` | Event | `PARAMCD = 'PFS'`, `'OS'`, `'TTP'` in `ADTTE` |
| `POP.EVAL_EFFICACY` | Population | `EFFIFL = 'Y'` |
| `POP.ITT` | Population | `ITTFL = 'Y'` |
| `TRT.PRE0102` | Treatment | `TRTP` |
| `ICE.TOX_DISCONT` | Intercurrent event | |

Four Analysis Concepts, one template:

| Analysis Concept | `{event}` | `{population}` | Estimand | Role |
| --- | --- | --- | --- | --- |
| `AC.PRIMARY.PFS` | `EVENT.PFS` | `POP.EVAL_EFFICACY` | `EST.PFS` | Main estimator |
| `AC.SENS.PFS.ITT` | `EVENT.PFS` | `POP.ITT` | `EST.PFS` | Sensitivity analysis |
| `AC.SEC.OS` | `EVENT.OS` | `POP.EVAL_EFFICACY` | `EST.OS` | Main estimator |
| `AC.SEC.TTP` | `EVENT.TTP` | `POP.EVAL_EFFICACY` | `EST.TTP` | Main estimator |

```
python v1/tools/resolve.py pre0102 AC.PRIMARY.PFS AC.SENS.PFS.ITT
```

```
AC.PRIMARY.PFS
  derivations, in order: (none)
  time          C.TimeToEvent    <- ADTTE.AVAL WHERE PARAMCD = 'PFS' AND EFFIFL = 'Y'
  event         C.Flag           <- ADTTE.CNSR WHERE PARAMCD = 'PFS' AND EFFIFL = 'Y'
  fixed_effect  C.Treatment      <- TRTP

AC.SENS.PFS.ITT
  derivations, in order: (none)
  time          C.TimeToEvent    <- ADTTE.AVAL WHERE PARAMCD = 'PFS' AND ITTFL = 'Y'
  event         C.Flag           <- ADTTE.CNSR WHERE PARAMCD = 'PFS' AND ITTFL = 'Y'
  fixed_effect  C.Treatment      <- TRTP
```

The only difference between the two is the population flag, because the only
difference between the two Analysis Concepts is one placeholder value.

### SmartPhrases (chapter 8)

```
python v1/tools/render.py pre0102
```

> Time to disease progression or death (PFS) in the eligible, treated
> population comparing treatment groups, regardless of discontinuation of
> everolimus for suspected toxicity, using Kaplan-Meier estimation with 90%
> confidence intervals, censoring subjects lost to follow-up, displayed as
> Kaplan-Meier survival curves by treatment arm, summarised as the median time
> to event, will be assessed as the primary analysis.

The phrases are different from chapter 8 (`time to {event}`, `using {method}
estimation`), but the roles, the order and the mechanism are identical.

### Estimands (chapter 9)

`EST.PFS` has one intercurrent event in scope, `ICE.TOX_DISCONT`:
discontinuation of everolimus for suspected toxicity. The plan says such
subjects are still followed for progression and survival. That is the
**treatment policy** strategy, so the handling has no implementing
Transformation: the data are used as observed.

## What was reused and what was new

| Layer | Reused unchanged | New for this study |
| --- | --- | --- |
| Method | The whole method library | Nothing |
| Concept | The whole concept library | One provisional Concept (`C.LandmarkEstimates`) |
| Transformation | The schema and its rules | One template (`T.PFS_KaplanMeier`) |
| Data binding | All ADaM class-level bindings | Six value-level bindings |
| SmartPhrase | 7 of the 9 phrases used | Two fixed-text phrases (censoring rule, survival curves) |
| Study | — | The study file |

A new template was needed because the library's only time-to-event template
was a log-rank test, and this plan asks for no test. That is a normal thing to
find: the library grows by the templates that real plans need.

## New in this chapter: anchoring to the SAP

This study has a source document, so each statement in the model can point at
the passage that licenses it. The pointer is a **document anchor**: a section
number and a quotation.

```json
{ "phrase": "SP_CENSOR_LTFU",
  "sapRefs": [ { "section": "7.7.2",
    "quote": "Subjects who are lost to follow-up are censored at the time of last tumor assessment for TTP and PFS" } ] }
```

| In the model | Anchored to (section: quotation) |
| --- | --- |
| The analysis `AC.PRIMARY.PFS` | 7.7.2: "Median time and 90% confidence interval for PFS, TTP, and OS will be summarized for all eligible, treated subjects by treatment arm using Kaplan-Meier estimates." |
| The event `EVENT.PFS` | 5.3: "the duration of time from time of randomization to time of progression or death, whichever occurs first" |
| The population `POP.EVAL_EFFICACY` | 7.2: "The primary efficacy analysis will be done including eligible, treated subjects." |
| The phrase `SP_ICE_TREATMENT_POLICY` | 4.3: "All subjects who have discontinued protocol therapy will be followed for survival and for progression, even if protocol therapy was discontinued because of toxicity …" |
| The phrase `SP_KM_CURVES` | 7.7.2: "In addition to the summary table, PFS and OS will be displayed by treatment arm using Kaplan-Meier survival curves." |

Two rules apply when a study has a source document (rule Y11):

- every analysis, and every use of a phrase, must be anchored, either directly
  or through a study concept it uses; or
- it must say why it has no anchor.

This is traceability in the other direction from chapter 7: not from a result
back to the data, but from a statement in the model back to the sentence in
the plan that asked for it.

## What this example could not express

It is as useful to see where the model ran out.

| Gap | Detail |
| --- | --- |
| The 90% confidence level has nowhere to go | The plan asks for 90% intervals. `M.KaplanMeier` has no confidence-level configuration, so the value is in the text but not in the method's settings. The validator warns about it |
| No derivations | Nothing says how time to event or censoring is derived from the tumour assessments. The analyses read `AVAL` and `CNSR` as given. The library has no time-to-event derivations yet |
| The template's name | `T.PFS_KaplanMeier` is used for OS and TTP as well. It should be named for what it is, a time-to-event summary |
| "If medians have not been reached, 2-year PFS … should be reported instead" | A conditional instruction. It is recorded as a quotation, but the model cannot express "if … instead" |

## Try it

Without opening the file, predict the where clause for `AC.SEC.OS`. Then run
`python v1/tools/resolve.py pre0102 AC.SEC.OS`.

## What to take away

- A completely different kind of analysis used the same five layers, the same
  study file structure and the same tools.
- What a new kind of analysis needs is usually one template and a few
  value-level bindings.
- A study with a source document anchors its statements to quoted passages.
- The model has gaps, and the validator points at some of them.

Next: [11. Other CDISC standards](11-other-standards.md)

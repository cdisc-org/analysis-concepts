# 13. Describing your own analysis

[Guide index](README.md) · Previous: [12. Automation](12-automation.md) · Next: [14. Quick reference](14-quick-reference.md)

**You will learn** how to add an analysis to a study, step by step, and how to
read the errors the validator gives when something is missing.

Everything in this chapter was run as written.

## The task

The SAP of the example study gains a sentence:

> A supporting analysis of change from baseline in ADAS-Cog (11) at Week 8
> will be performed in the efficacy population, using ANCOVA adjusting for
> baseline.

You will add it as an Analysis Concept.

## Step 0. Work on a copy

```
cp -r v1/studies/cdiscpilot01 v1/studies/mystudy
```

Open `v1/studies/mystudy/analysis_set.json`. Change its `id` to
`MYSTUDY.analyses`. The tools find every folder under `v1/studies/`, so
`mystudy` is now a study in its own right.

## Step 1. Find a template

Ask: is there a library Transformation for this kind of analysis? ANCOVA of
change from baseline is `T.CFB_ANCOVA` (chapter 5). If nothing fits, a new
template is needed, which is library work and not covered here.

Write down what the template leaves open:

| Placeholder | Your answer |
| --- | --- |
| `{parameter}` | ADAS-Cog (11) |
| `{visit}` | Week 8 |
| `{baseline_visit}` | Baseline |
| `{population}` | Efficacy |
| `{control_arm}` | Placebo |

## Step 2. Check the study concepts exist

Each answer must be a study concept (chapter 7). Look in `studyConcepts`:

| Your answer | Study concept | There already? |
| --- | --- | --- |
| ADAS-Cog (11) | `PARAM.ADASCOG11` | Yes |
| Week 8 | `VISIT.WK8` | Yes |
| Baseline | `VISIT.BASELINE` | Yes |
| Efficacy | `POP.EFFICACY` | Yes |

All present. If Week 8 were missing, you would add it, copying `VISIT.WK24`
and changing the identifier, the names and the condition (`AVISITN = 8`).

## Step 3. Add the derivation

The analysis needs a change from baseline at Week 8. Is there a Derivation
Concept for it? There are ones for Week 24 and Week 16, not Week 8. Add one to
`derivations`:

```json
{
  "id": "DC.CHG.ADASCOG11.WK8.LOCF",
  "label": "Change from baseline in ADAS-Cog(11) at Week 8 (LOCF-imputed)",
  "template": "T.ChangeFromBaseline",
  "purpose": "The response analysed.",
  "placeholderValues": [
    { "name": "parameter",      "studyConcept": "PARAM.ADASCOG11" },
    { "name": "visit",          "studyConcept": "VISIT.WK8" },
    { "name": "baseline_visit", "studyConcept": "VISIT.BASELINE" }
  ],
  "dependsOn": [ "DC.BASELINE.ADASCOG11", "DC.LOCF.ADASCOG11" ]
}
```

It reuses the baseline and LOCF derivations that are already there.

## Step 4. Add the Analysis Concept

Add this to `analyses`. Each block is explained below it.

```json
{
  "id": "AC.SUPP.ADASCOG.WK8",
  "label": "Supporting analysis at Week 8",
  "template": "T.CFB_ANCOVA",

  "addressesEstimand": "EST.PRIMARY",
  "analysisRole": "SupplementaryAnalysis",
  "sentenceRole": "a supporting analysis",

  "placeholderValues": [
    { "name": "parameter",      "studyConcept": "PARAM.ADASCOG11" },
    { "name": "visit",          "studyConcept": "VISIT.WK8" },
    { "name": "population",     "studyConcept": "POP.EFFICACY" },
    { "name": "treatment",      "studyConcept": "TRT.ALL" },
    { "name": "baseline_visit", "studyConcept": "VISIT.BASELINE" },
    { "name": "control_arm",    "value": "Placebo" }
  ],
  "configurationValues": [
    { "name": "ss_type", "value": "III", "fixedByTemplate": true },
    { "name": "alpha",   "value": 0.05 }
  ],

  "phrases": [
    { "phrase": "SP_CFB_ENDPOINT",
      "bindings": [ { "slot": "parameter", "studyConcept": "PARAM.ADASCOG11", "render": "label" } ] },
    { "phrase": "SP_TIMEPOINT",
      "bindings": [ { "slot": "visit", "studyConcept": "VISIT.WK8", "render": "label" } ] },
    { "phrase": "SP_POPULATION",
      "bindings": [ { "slot": "population", "studyConcept": "POP.EFFICACY", "render": "name" } ] },
    { "phrase": "SP_GROUPING",
      "bindings": [ { "slot": "treatment", "studyConcept": "TRT.ALL", "render": "label" } ] },
    { "phrase": "SP_METHOD_ANCOVA",
      "bindings": [ { "slot": "method", "method": "M.ANCOVA", "render": "label" } ] },
    { "phrase": "SP_COVARIATE_BASELINE",
      "bindings": [ { "slot": "parameter", "studyConcept": "PARAM.ADASCOG11", "render": "label" } ] }
  ],

  "dependsOn": [ "DC.CHG.ADASCOG11.WK8.LOCF" ],

  "iceHandlings": [
    { "intercurrentEvent": "ICE.TRT_DISCONT", "strategy": "Hypothetical",
      "basis": "studyDefault", "implementedBy": [ "T.LOCF_Imputation" ] },
    { "intercurrentEvent": "ICE.CONMED", "strategy": "TreatmentPolicy",
      "basis": "studyDefault", "implementedBy": [] }
  ]
}
```

| Block | What you decided | Chapter |
| --- | --- | --- |
| `template` | Which standard analysis this is | 5 |
| `addressesEstimand`, `analysisRole` | Which question it serves, and in what capacity | 9 |
| `placeholderValues` | The five answers from step 1 | 7 |
| `configurationValues` | The method's options | 3 |
| `phrases` | The wording, and what fills each blank | 8 |
| `dependsOn` | What must be derived first | 7 |
| `iceHandlings` | How each intercurrent event in the estimand is handled | 9 |

The SAP sentence did not mention intercurrent events, so the study's defaults
apply, and the Analysis Concept says so (`"basis": "studyDefault"`).

## Step 5. Validate

```
python v1/tools/validate.py
```

```
0 errors, 40 warnings, 0 known findings
```

(The warnings are about the libraries, not your study. `--all` lists them.)

## Step 6. Look at what you made

```
python v1/tools/render.py mystudy
```

> Change from baseline in ADAS-Cog(11) at Week 8 in the efficacy
> (intent-to-treat) population comparing treatment groups using ANCOVA
> adjusting for baseline ADAS-Cog(11) will be assessed as a supporting
> analysis.

```
python v1/tools/resolve.py mystudy AC.SUPP.ADASCOG.WK8
```

```
AC.SUPP.ADASCOG.WK8
  derivations, in order: DC.BASELINE.ADASCOG11 -> DC.LOCF.ADASCOG11 -> DC.CHG.ADASCOG11.WK8.LOCF
  response      C.Change         <- ADQSADAS.CHG WHERE PARAMCD = 'ACTOT' AND AVISITN = 8 AND ITTFL = 'Y'
  covariate     C.Measure        <- ADQSADAS.BASE WHERE PARAMCD = 'ACTOT' AND AVISITN = 8 AND ITTFL = 'Y'   [baseline value carried on the analysis record]
  fixed_effect  C.Treatment      <- TRTP
```

You typed "Week 8" as an identifier, `VISIT.WK8`, twice. The sentence says
"Week 8" and the where clause says `AVISITN = 8`. Neither was typed.

Compare your generated sentence with the SAP sentence at the top of the
chapter. They say the same thing in a slightly different order. That
comparison is the review.

## When it goes wrong

The validator's messages are meant to be read. Here are five mistakes made on
purpose in the file above, and what each produced.

| Mistake | Message | Rule |
| --- | --- | --- |
| Left out the `visit` placeholder value | `no value for the template placeholder {visit}` | Y3 |
| Removed the handling of `ICE.CONMED` | `no handling stated for intercurrent event ICE.CONMED` | Y8 |
| Added the phrase `SP_METHOD_KM` | `not one of the SmartPhrases T.CFB_ANCOVA accepts` | Y5 |
| … which also gave two method phrases | `role method is filled 2 times but does not repeat` | Y6 |
| Set `analysisRole` to `MainEstimator` | `an estimand has exactly one main estimator; found 2` | Y7 |

Each message names the study, the analysis and, where it applies, the phrase:

```
ERROR   Y3   mystudy/AC.SUPP.ADASCOG.WK8: no value for the template placeholder {visit}
ERROR   Y5   mystudy/AC.SUPP.ADASCOG.WK8/SP_METHOD_KM: not one of the SmartPhrases T.CFB_ANCOVA accepts
```

Other messages you are likely to meet:

| Message | Usually means |
| --- | --- |
| `unknown study concept …` | A typo in an identifier, or the study concept was never added |
| `… is a Treatment, not a Population` | The wrong study concept in a phrase blank |
| `required placeholder … is not bound` | A phrase is listed without filling its blank |
| `input C.… is neither derived nor bound to data` | The analysis needs something that no derivation produces and no binding provides. Add `dependsOn`, or a value-level binding |
| `depends on unknown derivation …` | A typo in `dependsOn`, or the derivation was not added |
| `… is pinned at … but the library is …` | The library changed version since the study was written |
| `Hypothetical handling of … has no implementing transformation` | A strategy is claimed with nothing to carry it out |

All the rules are listed in [conformance.md](../conformance.md).

## Checklist

Use this for any new analysis.

- [ ] A library template fits the analysis
- [ ] I have listed the template's placeholders and my answer to each
- [ ] Each answer is a study concept, with a data selection
- [ ] The derivations the analysis needs exist, with `dependsOn` in order
- [ ] The Analysis Concept names its estimand and its role
- [ ] Every intercurrent event in that estimand's scope has a handling
- [ ] The phrases are ones the template accepts, and each blank is filled
- [ ] The validator reports no errors
- [ ] The generated sentence matches the SAP
- [ ] The resolved where clause and variables match the specification

## Step 7. Tidy up

```
rm -r v1/studies/mystudy
```

## Going further

| You want to … | You need … |
| --- | --- |
| Analyse a different parameter the same way | A study concept for it, and value-level bindings if its variables are parameter-dependent |
| Use a different population | A study concept with the flag condition |
| Add a covariate | A phrase such as `SP_COVARIATE_SITE`, if the template accepts it. Binding a further covariate to the model itself is template work |
| Describe a kind of analysis with no template | A new Transformation in the library, and perhaps a new Method. See [model-reference.md](../model-reference.md) and the conformance rules T1 to T10 |
| Describe a study from scratch | A new study file: pins, study concepts, estimands, then derivations and analyses as above |

## What to take away

- Adding an analysis is: pick a template, answer its placeholders with study
  concepts, add any missing derivation, state the estimand and handlings, pick
  the phrases.
- The validator tells you what is missing, in words.
- The generated sentence and where clause are how you review your own work.

Next: [14. Quick reference](14-quick-reference.md)

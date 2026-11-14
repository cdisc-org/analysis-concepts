# 1. Getting started

[Guide index](README.md) · Next: [2. One analysis, five artefacts](02-one-analysis-five-artefacts.md)

**You will learn** what Analysis Concepts is for, and how to run the examples
on your own machine.

## What it is

Analysis Concepts (AC) is a way to write down, in a form a program can read,
*how study data is derived and analysed*.

You already write this down, several times over: in the SAP, in the ADaM
specification, in define.xml, in the table shells and in the programs. Each
says the same thing in a different way, and each is kept in step with the
others by hand.

AC states each fact once, in a structured form. The other documents can then
be generated from it, or checked against it.

## The one idea underneath

Every derivation and every analysis has the same shape:

```
output  =  method ( inputs )
```

| | A derivation | An analysis |
| --- | --- | --- |
| Example | Change from baseline | ANCOVA of change from baseline |
| Method | Subtraction | Analysis of covariance |
| Inputs | The value at the visit; the baseline value | The change; the baseline value; treatment |
| Output | One value per subject and visit | LS means, differences, p-values |
| In CDISC terms | SDTM → ADaM | ADaM → results |

That is all AC describes. The rest of the guide is about how it keeps the
*method*, the *meaning of the inputs* and *your actual variables* apart, so
that each can be reused.

## What you already know, and what it is called here

You do not need these yet. They are here so that the new words do not look
strange when they arrive.

| You know it as | In Analysis Concepts | Chapter |
| --- | --- | --- |
| A statistical procedure or a derivation rule | Method | 3 |
| "Change from baseline", "analysis value", "treatment" | Concept | 4 |
| A standard derivation or a standard analysis | Transformation | 5 |
| `CHG`, `AVAL`, `PARAMCD = 'ACTOT'` | Data binding | 6 |
| One row of your analysis plan, one table | Analysis Concept | 7 |
| A sentence of the SAP | SmartPhrases | 8 |

## Run the examples

You need git, Python 3.12 and [uv](https://docs.astral.sh/uv/). Node.js is not
needed to read or check the model.

```
git clone --branch candidate_v1 https://github.com/cdisc-org/analysis-concepts.git
cd analysis-concepts
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install linkml pytest
```

Check that everything is consistent:

```
python -m pytest v1/tests -q
```

You should see every test pass.

### Your first three commands

**1. Generate the SAP sentences of a study.**

```
python v1/tools/render.py cdiscpilot01
```

```
AC.PRIMARY.ADASCOG: Change from baseline in Alzheimer's Disease Assessment
Scale - Cognitive Subscale (11 items) (ADAS-Cog(11)) at Week 24 in the efficacy
(intent-to-treat) population comparing treatment groups, as if discontinuation
of study treatment had not occurred and regardless of use of concomitant AD
medication, using ANCOVA with 95% confidence intervals adjusting for baseline
ADAS-Cog(11), summarised as the difference in least-squares means, will be
assessed as the primary analysis.
```

**2. See which variables that analysis reads.**

```
python v1/tools/resolve.py cdiscpilot01 AC.PRIMARY.ADASCOG
```

```
AC.PRIMARY.ADASCOG
  derivations, in order: DC.BASELINE.ADASCOG11 -> DC.LOCF.ADASCOG11 -> DC.CHG.ADASCOG11.WK24.LOCF
  response      C.Change         <- ADQSADAS.CHG WHERE PARAMCD = 'ACTOT' AND AVISITN = 24 AND ITTFL = 'Y'
  covariate     C.Measure        <- ADQSADAS.BASE WHERE PARAMCD = 'ACTOT' AND AVISITN = 24 AND ITTFL = 'Y'
  fixed_effect  C.Treatment      <- TRTP
```

**3. Generate the analysis results metadata and the program call.**

```
python v1/tools/downstream.py cdiscpilot01 arm AC.PRIMARY.ADASCOG
```

It prints the analysis dataset, the where clause, the analysis variables, the
documentation text, and a `PROC GLM` call with the variables filled in.

All three come from one file, `v1/studies/cdiscpilot01/analysis_set.json`. By
chapter 7 you will be able to read it.

## Where things are

```
v1/
  lib/        the libraries: reusable content, the same for every study
    methods/  concepts/  transformations/  smartphrases/  bindings/  statistics/
  studies/    one folder per study: how that study uses the libraries
  schema/     the formal model (LinkML)
  tools/      the commands used in this guide
  docs/       reference documents, and this guide
```

The split between `lib/` and `studies/` matters. A library entry is written
once and used by many studies. A study file says only what is particular to
the study.

## What to take away

- AC describes derivations and analyses as *method applied to inputs*.
- It states each fact once, in structured form.
- Libraries are reusable; a study file says how one study uses them.

Next: [2. One analysis, five artefacts](02-one-analysis-five-artefacts.md)

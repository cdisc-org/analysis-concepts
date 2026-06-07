# Intercurrent events: ascertainment vs. handling, and how an endpoint is derived

This note explains how the eSAP model represents an intercurrent event (ICE) and
how a subject's endpoint value is derived **with** and **without** the ICE. It
covers two things people routinely conflate:

1. The split between **ascertaining** an ICE (did it occur, and when) and
   **handling** it (how the analysis value reflects it).
2. The three layers — **estimand → estimator → execution** — and why *both* ICE
   edges in the schema live in the plan, not in execution.

It is grounded in ICH E9(R1) and the CDISC USDM `IntercurrentEvent` entity (a
`SyntaxTemplate` with a free-text `strategy`; it has no native detection or
timeline link — those are AC/DC extensions).

---

## 1. Two edges, two jobs

```
Estimand
 ├─ intercurrentEvents[] → IntercurrentEvent
 │     ├─ name / text          "use of rescue medication"
 │     ├─ icheStrategy          Hypothetical            (study-default strategy)
 │     ├─ hasScheduleTimeline → ScheduleTimeline        (event-driven timeline, gated by entryCondition)
 │     └─ ascertainedBy       → TransformationRef       (Step 1: recognise occurrence)
 └─ handlesIntercurrentEvent[] → IceHandling
       ├─ forIntercurrentEvent → (that ICE)
       ├─ icheStrategy          Hypothetical | Composite | …  (per-estimand override)
       └─ implementedBy[]      → TransformationRef       (Step 2: derive the value)
```

- **`ascertainedBy`** points to the recipe that reads collected data and emits,
  per subject, *(occurred?, time)*. It is **strategy-independent** — you
  recognise rescue-medication use the same way regardless of how you later
  handle it.
- **`implementedBy`** points to the recipe(s) that produce the analysis value
  *given* occurrence, per the chosen strategy.

**The event gate has two halves — one condition, two forms.** Per the USDM-IG
"Unscheduled Visits" pattern, an event-driven timeline is gated by an
`entryCondition` (a non-main timeline, `mainTimeline=false`). For an ICE that
condition is expressed twice:

- `ScheduleTimeline.entryCondition` — the **prose** gate, e.g.
  *"Subject receives rescue medication"* (USDM-IG's own examples are
  *"Adverse event"* / *"Lost contact with subject"*).
- `IntercurrentEvent.ascertainedBy → Transformation` — the **executable** gate
  that realises the same condition against data.

They are the human-readable and machine-readable halves of one gate; the
timeline's instances then detail the protocol's response steps once it fires.

Keeping these separate means a sensitivity estimand that swaps
`Treatment Policy → Hypothetical` only re-points `implementedBy`; the occurrence
fact from `ascertainedBy` is reused unchanged.

> **Naming note.** The field is `ascertainedBy` in both the schema
> (`study_esap.schema.yaml`) and the diagram. It was renamed from `detectedBy`
> to align with estimand vocabulary — "detection" leans toward pharmacovigilance.

---

## 2. Three layers: estimand → estimator → execution

Both edges above are **specification**. Neither is execution. The eSAP is a
plan; it never holds subject data or computed values.

```
LAYER 1 — ESTIMAND DECLARATION   (the "what" / scientific intent)
   IntercurrentEvent + icheStrategy        ← attribute 5 of the estimand
   IceHandling.icheStrategy                ← per-estimand strategy (override)

LAYER 2 — ESTIMATOR / OPERATIONAL SPEC    (the "how"; still planned, machine-executable)
   IntercurrentEvent.ascertainedBy  → Transformation   (recipe: recognise occurrence)
   IceHandling.implementedBy[]      → Transformation   (recipe: derive the value)
       — both are *references to* recipes, not results —

LAYER 3 — EXECUTION                        (the engine; the "actual")
   engine runs those Transformations over concept-keyed subject data →
       per-subject ICE flag, per-subject handled value, ARD
```

A method definition is not a method run; likewise `ascertainedBy` /
`implementedBy` are pointers to recipes, not the act of computing. Only the
engine (Layer 3) touches data. `Treatment Policy` is the one strategy with no
`implementedBy` — the observed value flows straight through.

---

## 3. Worked example — change-from-baseline with and without an ICE

**Endpoint:** change-from-baseline (CFB) in HbA1c at Week 24.
**ICE:** use of rescue medication.
Two subjects, identical raw observations; only the ICE differs.

| Subject | Baseline | Wk 12 | Wk 24 (observed) | ICE? |
| ------- | -------- | ----- | ---------------- | ---- |
| S-001   | 9.0      | 8.0   | **7.0**          | none |
| S-002   | 9.0      | 8.0   | **7.5**          | rescue med at Wk 12 |

**Step 1 — `ascertainedBy`** reads CM and emits per-subject *(occurred, time)*:

- S-001 → `(No, —)`
- S-002 → `(Yes, Wk 12)`

**Step 2 — value by strategy.** S-001 (no ICE) is trivial in every strategy:
observed CFB = `7.0 − 9.0 = −2.0`; ascertainment returned `No`, so no handling
fires. For S-002 the analysis value diverges — and that is exactly what
`IceHandling.implementedBy` operationalises:

| Strategy            | Meaning for S-002                              | Wk-24 value      | CFB      | `implementedBy`                |
| ------------------- | ---------------------------------------------- | ---------------- | -------- | ------------------------------ |
| Treatment Policy    | Use data as observed, ignore the rescue        | 7.5 (observed)   | **−1.5** | *omitted* — no transformation  |
| Hypothetical        | Value had they not rescued → impute            | 8.2 (imputed)    | **−0.8** | imputation derivation          |
| Composite           | Rescue = treatment failure → fold into variable| 9.0 (failure)    | **0.0**  | variable-folding derivation    |
| While on Treatment  | Evaluate at last on-treatment time (Wk 12)     | 8.0 (Wk 12 obs)  | **−1.0** | timepoint-reselection derivation |
| Principal Stratum   | Estimand only for "would-not-rescue" subjects  | —                | **excl.**| population-subsetting derivation |

The same ascertained fact `(Yes, Wk 12)` feeds every row; only the handling —
and therefore the number — changes. The handling derivations sit under the
**Endpoint**'s `hasTransformation[]`, produce the analysis-ready CFB, which the
**Analysis** (e.g. ANCOVA) then consumes.

---

## Sources

- ICH E9(R1) addendum — Step 2 training material, database.ich.org
- The estimands framework: a primer on the ICH E9(R1) addendum (ResearchGate)
- CDISC USDM model source — `intercurrent_event.py` (github.com/cdisc-org/usdm)
- CDISC Digital Data Flow (DDF) / USDM — cdisc.org/ddf

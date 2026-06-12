# The "owning the link" principle

How the eSAP relates to the **single-source USDM** study definition. This is the
rule that settled the meeting's "arrow-direction" debate — direction is a
*consequence* of who owns the link, and who owns the link follows one principle.

## The principle

> When two entities are related and one is **single-source / locked** and the other
> is **authored later / eSAP-owned**, the **later eSAP-owned entity owns the
> reference** — it points *at* the locked entity. A locked entity is **never
> modified** to hold a link to later content.

USDM is the *unified* study definition: **one model, from which the protocol and the
eSAP are both generated.** So the eSAP must not duplicate or mutate the USDM study
structure — it **references** it. The analysis content the eSAP adds (analyses,
derivations, ICE handling, ICE ascertainment) is authored at SAP stage and therefore
**owns the links back into the locked USDM**.

## The three bindings

| Upstream source | Binding | Why |
| --------------- | ------- | --- |
| **Transformation library** (templates) | **COPY** (into each study `Transformation`) | external, reusable, independently versioned — copying *insulates the study from library drift* |
| **Method** | **REFERENCE** (`usesMethod`) | external executable artefact |
| **USDM** study structure (Study, Estimand, Endpoint, IntercurrentEvent, …) | **REFERENCE — single source** | it *is* the one study definition; duplicating or mutating it breaks "one model → protocol + eSAP" |
| **ARS** analysis spec (`ReportingEvent` → analyses/methods/outputs) | **REFERENCE** | analysis-spec **data** standard; the SAP's `reportingEvents[]` hold the analyses, which reference USDM |

Copy applies only to **external** artefacts. The study's **own** definition (USDM) is
single-sourced and referenced — never copied, never extended in place.

## Three standards, no inventions

The eSAP spans three standards and invents nothing structural:

- **USDM** — the study-definition **data** (estimands, endpoints, ICEs). Single source.
- **ARS** — the analysis-specification **data**: a **`ReportingEvent`** (referenced,
  not reinvented) holding analyses/methods/outputs. The SAP defines **one or more**
  ReportingEvents — an interim, the final CSR, a DSMB run — each with its own analyses
  and derivations, all referencing the *same* USDM.
- a **SAP document template** — the M11-equivalent the data renders *into* (a separate
  layer, not modelled here as data).

So the analysis content lives under top-level **`reportingEvents[]`** (ARS), a sibling
of `study` (USDM). Every member references the locked USDM by id:

```
{ model: eSAP, version, study: { …USDM single source… },
  reportingEvents: [ ReportingEvent(interim), ReportingEvent(CSR), … ] }   ← ARS

ReportingEvent  (ARS — per reporting requirement)
 ├─ analyses[]          → Analysis.addressesEstimand  [0..1] → Estimand  (USDM)
 │                        Analysis.addressesEndpoint  [0..1] → Endpoint  (USDM)
 │                        Analysis.addressesObjective [0..1] → Objective (USDM)
 │                        (anchor optional — see "Anchoring is a gradient" below)
 ├─ derivations[]       → Derivation.forEndpoint      [0..1] → Endpoint  (USDM)
 ├─ iceHandlings[]      → IceHandling.forEstimand           → Estimand   (USDM)
 │                        IceHandling.forIntercurrentEvent  → IntercurrentEvent (USDM)
 ├─ iceAscertainments[] → IceAscertainment.forIntercurrentEvent → IntercurrentEvent (USDM)
 │                        (carries icheStrategy, hasScheduleTimeline, ascertainedBy)
 ├─ hypotheses[]        → Hypothesis.forEstimand            → Estimand   (USDM)   (confirmatory only)
 │                        Hypothesis.testedBy → Analysis;  statement = prose
 └─ multiplicityStrategy → MultiplicityStrategy  (order | Bretz-Maurer graph over the hypotheses; familyAlpha)
```

`Hypothesis` and `MultiplicityStrategy` are **eSAP-owned** — neither USDM (design-level)
nor ARS (results-level) models statistical hypotheses or multiplicity. The hypothesis is
the inferential bridge (estimand = the effect → hypothesis = the claim + decision rule →
analysis = the test); its H0/H1 wording stays prose; α lives on the strategy, not the
hypothesis. The across-hypotheses multiplicity here is orthogonal to across-looks
α-spending (which is handled by the looks being separate `reportingEvents[]`).

> **Bridge note.** ARS `Analysis` has **no native estimand/endpoint link** — it links
> only to method/analysisSet. So the estimand↔analysis linkage (`addressesEstimand`)
> is precisely the **eSAP's bridge role** between USDM and ARS. (ARS expresses
> MainEstimator/Sensitivity/Supplementary via an `AnalysisOutputCategorization`
> "Estimand Analysis Type" — which is what `Analysis.analysisRole` maps to;
> `analysisRole` is the *role* the analysis plays for its estimand, distinct from the
> `addresses*` anchor, which is *which* USDM node it attaches to.) And
> `derivations` / `iceAscertainments` / `iceHandlings` are AC/DC content ARS has no
> concept of — carried alongside the ARS analyses, each referencing USDM.

> **Anchoring is a gradient, not a gate.** The bridge is **optional**. Native ARS lets an
> analysis exist with no estimand or endpoint, and so does the eSAP: an analysis attaches
> to the `Objective → Endpoint → Estimand` spine at whatever altitude fits — `addressesEstimand`
> (confirmatory), `addressesEndpoint` (descriptive endpoint summaries), `addressesObjective`
> (supportive, e.g. safety), or **nothing at all** for operational outputs (disposition,
> demographics, exposure, protocol deviations). All three anchors are `[0..1]`, and a `Derivation`
> may likewise produce an intermediate / collected-data summary with **no** `forEndpoint`. The
> anchors are roles an analysis *may* play, not a tax every analysis pays — and whichever it sets
> still points eSAP-owned → locked USDM, owning the link. (Consequence: "exactly one MainEstimator
> per estimand" is now a conditional invariant over estimands that *have* analyses, enforced by
> validation rather than cardinality.)

The USDM entities are **pure single-source** — they carry **no** eSAP fields:

- `Endpoint` lost `hasTransformation` → `Derivation.forEndpoint` and `Analysis.addressesEndpoint`
  point in (both optional).
- `Estimand` lost `hasTransformation` and `handlesIntercurrentEvent` → `Analysis.addressesEstimand`
  and `IceHandling.forEstimand` point in.
- `Objective` is also a valid analysis anchor → `Analysis.addressesObjective` points in (for
  analyses that serve a goal but no specific endpoint/estimand).
- `IntercurrentEvent` lost `icheStrategy` / `hasScheduleTimeline` / `ascertainedBy` → these moved
  to the eSAP-owned **`IceAscertainment`**, which references the ICE by id.

## Study-scoped vs document-scoped — why narrative differs from estimands

A natural objection: *if the eSAP can author its own `NarrativeContent`, why can't it author its
own `Estimand` / `Endpoint` / `Objective`?* Technically it **can** — nothing in the class structure
forbids new instances of any USDM class. So the boundary is **not** class-vs-instance, and not
USDM-class-vs-eSAP-class. The real discriminator is the **scope of truth** of what the instance
asserts:

| Entity | Scope | Cardinality of truth |
| ------ | ----- | -------------------- |
| `Estimand` / `Endpoint` / `Objective` / `IntercurrentEvent` | **study-scoped** | **one** answer per study — "what is this trial's primary estimand?" has a single truth the protocol and the SAP cannot disagree on |
| `NarrativeContent` / `NarrativeContentItem` | **document-scoped** | **one answer per document** — "what does §9.2 say?" legitimately differs between the protocol and the SAP |

A study has *one* estimand set, so estimands are intrinsically single-instance **across the study**.
A study has *many* documents, each with its own prose, so narrative is intrinsically multi-instance
**across documents**. That semantic fact — not a modelling rule — is why one forks privately and the
other cannot.

**Consequences:**

- A new `Estimand` / `Endpoint` / `Objective` instance is a **study-definition fact**, hence
  USDM-owned and single-source. If the SAP introduces one, that is a **USDM amendment** (a new
  `StudyVersion`) which the protocol *also* sees — **not** eSAP-private content. The protocol cannot
  be allowed to disagree with the SAP about *what the study is*.
- A new SAP `NarrativeContent` instance asserts nothing about the study's scientific commitments —
  it is *this document's text*. The protocol document says different things. So it is genuinely
  **eSAP-private** and does **not** flow to the protocol. The eSAP is a
  `StudyDefinitionDocument(type=eSAP)` with its own `NarrativeContent` tree — the **same USDM
  classes**, a **new instance tree**, authored at SAP stage. No new narrative class is introduced.
  (Adding a separately-versioned document is *additive*, not a mutation of the locked protocol
  document — which is why nesting it under the study does not violate single-source.)

This is why the two mechanisms above exist — they let the SAP add content **without** minting
private design instances that would fork the single source:

1. **Owning-the-link inversion** — the SAP adds analysis content by *referencing* the shared design
   entities (`Analysis → Estimand`, `Derivation → Endpoint`), never by re-authoring them.
2. **`[0..1]` anchors** — a SAP analysis that maps to *no* protocol endpoint/estimand (a data
   summary, an exploratory output) carries **no anchor**, instead of being forced to invent a fake
   `Endpoint` just to host itself.

So the stance is consistent: **the SAP elaborates and references the study definition; it does not
re-author it.** A genuine new design fact is a USDM amendment (shared); an output that *isn't* a
design fact lives anchor-free in the overlay.

## What this means for arrow direction

Arrows now run **eSAP-owned → USDM** for these relationships (the owned side owns the
link), which is the *inverse* of the old nesting (`Estimand → Analysis`). The quick
test:

> *Is the target single-source/locked, and the source authored later? Then the source
> owns the link and the arrow points source → target.*

So `Analysis → Estimand`, `Derivation → Endpoint`, `IceHandling → Estimand`,
`IceAscertainment → IntercurrentEvent`. USDM-internal relationships
(`Estimand → Endpoint`, `Estimand → IntercurrentEvent`, `Objective → Endpoint`) keep
their USDM-native direction — both ends are single-source.

## Why the locking objection dissolves

*"The estimand is locked at protocol; we can't add `hasTransformation` to it."* — Correct,
and that is exactly why analyses **reference** the estimand instead of being nested in
it. The protocol estimand is **never modified**; the SAP-stage `Analysis` in the
overlay points at it. Reproducibility of "what was analysed" is provided by **pinning
the USDM `StudyVersion`**, not by copying entities.

## Summary

- **Single source:** the USDM study definition exists once; protocol and eSAP are
  views/products of it.
- **Owning the link:** eSAP-owned analysis content owns the references *into* USDM;
  USDM never points at, nests, or carries eSAP content.
- **Copy is the exception, for external artefacts only:** the transformation library is
  copied (insulation from drift); the method is referenced; USDM is referenced
  (single source).

## References

- `model/linkML/study_esap.schema.yaml` — `reportingEvents[]` (ARS `ReportingEvent`), `IceAscertainment`,
  `Derivation.forEndpoint`, `Analysis.addressesEstimand`, `IceHandling.forEstimand`,
  and the now-pure-USDM `Estimand` / `Endpoint` / `IntercurrentEvent`.
- `model/linkML/intercurrent-event-derivation.md` — the ICE ascertainment model (note:
  its structural references predate this inversion and need a refresh — see below).
